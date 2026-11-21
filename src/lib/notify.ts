import 'server-only';
/**
 * محرك التنبيهات والتذكيرات:
 * - القواعد (notify_rules) تحدد متى يُنشأ التذكير ولمن وبأي قناة.
 * - كل تذكير يدخل الطابور (notify_queue) مرة واحدة فقط (مفتاح dedupe)، ثم يُرسل تلقائياً أو بعد المراجعة حسب وضع القاعدة.
 * - القنوات: بريد، رسالة نصية، واتساب (بوابة API أو رابط يفتحه الموظف)، وتنبيه داخل البرنامج للموظفين.
 */
import { q, uid } from './db';
import { loadDB, getSettings } from './data';
import { analyze, daysBetween } from './calc';
import { money, date } from './fmt';
import { sendMail, smtpFrom } from './mailer';
import { sendSms, smsReady, sendWhatsApp, waReady } from './sms';
import { waLink } from './messages';
import { linkFor, payReady, publicBase, orgQ } from './paylinks';

export type Channel = 'email' | 'sms' | 'whatsapp' | 'internal';
export const CHANNELS: [Channel, string][] = [['sms', 'رسالة نصية'], ['whatsapp', 'واتساب'], ['email', 'بريد إلكتروني'], ['internal', 'تنبيه داخل البرنامج']];
export const KINDS: { key: string; label: string; audience: 'tenant' | 'staff'; offsetLabel: string; vars: string }[] = [
  { key: 'due_soon', label: 'تذكير قبل استحقاق القسط', audience: 'tenant', offsetLabel: 'قبل الاستحقاق بـ (يوم)', vars: '{الاسم} {المبلغ} {الاستحقاق} {العقار} {الوحدة} {الأيام} {الجهة} {رابط_الدفع}' },
  { key: 'overdue', label: 'مطالبة بعد التأخر', audience: 'tenant', offsetLabel: 'بعد انتهاء المهلة بـ (يوم)', vars: '{الاسم} {المتأخرات} {عدد_الأقساط} {الأيام} {الجهة} {رابط_الدفع}' },
  { key: 'contract_end', label: 'تنبيه قبل انتهاء العقد (للمستأجر)', audience: 'tenant', offsetLabel: 'قبل الانتهاء بـ (يوم)', vars: '{الاسم} {الانتهاء} {العقار} {الوحدة} {رقم_العقد} {الأيام} {الجهة}' },
  { key: 'contract_end_staff', label: 'تنبيه الموظفين بالعقود المنتهية', audience: 'staff', offsetLabel: 'قبل الانتهاء بـ (يوم)', vars: '{الاسم} {الانتهاء} {العقار} {الوحدة} {رقم_العقد} {الأيام} {المتأخرات}' },
  { key: 'license_expiry', label: 'انتهاء رخصة أو شهادة أو تأمين', audience: 'staff', offsetLabel: 'قبل الانتهاء بـ (يوم)', vars: '{المستند} {العقار} {الانتهاء} {الأيام}' },
  { key: 'payable_due', label: 'دفعة مستحقة لمؤجر', audience: 'staff', offsetLabel: 'قبل الاستحقاق بـ (يوم)', vars: '{المؤجر} {العقار} {المبلغ} {الاستحقاق} {الأيام}' },
  { key: 'staff_digest', label: 'ملخص يومي للموظفين', audience: 'staff', offsetLabel: '—', vars: 'يُبنى تلقائياً' },
];
export const STATUS: Record<string, [string, string]> = {
  pending: ['بانتظار المراجعة', 't-warn'], approved: ['معتمد للإرسال', 't-info'], manual: ['جاهز للإرسال اليدوي', 't-info'], sent: ['أُرسل', 't-ok'],
  failed: ['فشل', 't-bad'], skipped: ['لم يُرسل', 't-mute'], cancelled: ['أُلغي', 't-mute'],
};
export const DEFAULT_RULES = [
  { kind: 'due_soon', name: 'تذكير قبل الاستحقاق بأسبوع', offset_days: 7, repeat_days: 0, channels: 'sms,whatsapp', audience: 'tenant', subject: 'تذكير بموعد قسط الإيجار',
    template: 'السلام عليكم {الاسم}،\nنذكّركم بموعد استحقاق قسط الإيجار بمبلغ {المبلغ} ريال بتاريخ {الاستحقاق} ({العقار} — {الوحدة}).\nشاكرين تعاونكم.\n{الجهة}' },
  { kind: 'overdue', name: 'مطالبة بالمتأخرات كل 15 يوماً', offset_days: 5, repeat_days: 15, channels: 'sms,whatsapp', audience: 'tenant', subject: 'مطالبة بمبالغ متأخرة',
    template: 'السلام عليكم {الاسم}،\nنفيدكم بوجود مبالغ متأخرة على عقد الإيجار بإجمالي {المتأخرات} ريال ({عدد_الأقساط} أقساط).\nنأمل المبادرة بالسداد وإرسال إشعار التحويل.\n{الجهة}' },
  { kind: 'contract_end', name: 'إشعار المستأجر قبل انتهاء العقد بشهرين', offset_days: 60, repeat_days: 0, channels: 'sms,whatsapp', audience: 'tenant', subject: 'قرب انتهاء عقد الإيجار',
    template: 'السلام عليكم {الاسم}،\nنفيدكم بأن عقد الإيجار رقم {رقم_العقد} ({العقار} — {الوحدة}) ينتهي بتاريخ {الانتهاء}.\nنأمل التواصل معنا لترتيب التجديد أو الإخلاء.\n{الجهة}' },
  { kind: 'contract_end_staff', name: 'تنبيه الموظفين قبل انتهاء العقود بـ 90 يوماً', offset_days: 90, repeat_days: 0, channels: 'internal', audience: 'staff', subject: 'عقد يقترب من الانتهاء',
    template: 'عقد {الاسم} — {العقار} / {الوحدة} ينتهي {الانتهاء} (بعد {الأيام} يوماً). متأخرات العقد: {المتأخرات} ريال.' },
  { kind: 'license_expiry', name: 'تنبيه انتهاء الرخص والشهادات قبل 60 يوماً', offset_days: 60, repeat_days: 0, channels: 'internal', audience: 'staff', subject: 'مستند نظامي يقترب من الانتهاء', template: '{المستند} — {العقار} ينتهي {الانتهاء} (بعد {الأيام} يوماً).' },
  { kind: 'payable_due', name: 'تنبيه دفعات المؤجرين قبل 15 يوماً', offset_days: 15, repeat_days: 0, channels: 'internal', audience: 'staff', subject: 'دفعة مستحقة لمؤجر', template: 'دفعة {المبلغ} ريال للمؤجر {المؤجر} عن {العقار} تستحق {الاستحقاق} (بعد {الأيام} يوماً).' },
  { kind: 'staff_digest', name: 'الملخص اليومي', offset_days: 0, repeat_days: 0, channels: 'internal', audience: 'staff', subject: 'ملخص اليوم — نظام الأملاك', template: '' },
];

export async function ensureDefaultRules() {
  const [{ n }] = await q('select count(*)::int as n from notify_rules');
  const [done] = await q(`select value from settings where key='mig11_rules'`);
  if (n > 0 || done) return;
  for (const r of DEFAULT_RULES) await q(`insert into notify_rules (id,kind,name,offset_days,repeat_days,channels,audience,subject,template,mode,active) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'review',true)`,
    [uid('nr'), r.kind, r.name, r.offset_days, r.repeat_days, r.channels, r.audience, r.subject, r.template]);
  await q(`insert into settings values ('mig11_rules','1') on conflict (key) do nothing`);
}
/** إضافة قواعد تحديث 13 للأنظمة القائمة مرة واحدة */
async function ensureRules13() {
  const [done] = await q(`select value from settings where key='mig13_rules'`); if (done) return;
  for (const r of DEFAULT_RULES.filter((x) => x.kind === 'license_expiry' || x.kind === 'payable_due')) {
    const [ex] = await q('select 1 from notify_rules where kind=$1', [r.kind]);
    if (!ex) await q(`insert into notify_rules (id,kind,name,offset_days,repeat_days,channels,audience,subject,template,mode,active) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'review',true)`, [uid('nr'), r.kind, r.name, r.offset_days, r.repeat_days, r.channels, r.audience, r.subject, r.template]);
  }
  await q(`insert into settings values ('mig13_rules','1') on conflict (key) do nothing`);
}

export const render = (t: string, v: Record<string, string | number>) => t.replace(/\{([^{}]+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
type Rule = { id: string; kind: string; name: string; offset_days: number; repeat_days: number; channels: string; audience: string; subject: string; template: string; mode: string; active: boolean };
type Item = { rule: Rule; channel: Channel; dedupe: string; tenant_id?: string | null; user_id?: string | null; entity_id?: string | null; to_addr: string | null; recipient: string; subject: string; body: string; skip?: string };

/** يبني التذكيرات المستحقة اليوم ويضيف الجديد منها للطابور. لا يرسل شيئاً. */
export async function generate(today?: string) {
  await ensureDefaultRules(); await ensureRules13();
  const [db, S] = await Promise.all([loadDB(), getSettings()]);
  const a = analyze(db); const now = today ?? a.today; const org = S.org || db.meta.org;
  const rules = (await q('select * from notify_rules where active order by created_at')) as Rule[];
  const staff = (await q(`select id, full_name, email, role from users where active and role in ('admin','accountant')`)) as { id: string; full_name: string; email: string | null; role: string }[];
  const T = new Map(db.tenants.map((t) => [t.id, t]));
  const items: Item[] = [];
  const payOn = S.pay_in_reminders === '1' && payReady(S) && !!publicBase(S);
  const payUrl = async (tenantId: string, contractId: string | null, ids: string[], amount: number, desc: string) => payOn && amount > 0 ? `${publicBase(S)}/pay/${await linkFor({ tenantId, contractId, installmentIds: ids, amount, description: desc, by: 'التذكيرات' })}${orgQ()}` : '';
  const withPay = (body: string, url: string) => !url ? body.replace(/\{رابط_الدفع\}/g, '').replace(/\n\s*\n/g, '\n') : body.includes('{رابط_الدفع}') ? body.replace(/\{رابط_الدفع\}/g, url) : `${body}\nللسداد الإلكتروني: ${url}`;
  const forTenant = (rule: Rule, tenantId: string, key: string, vars: Record<string, string | number>, entity: string | null) => {
    const t = T.get(tenantId); if (!t) return;
    for (const ch of rule.channels.split(',').filter(Boolean) as Channel[]) {
      if (ch === 'internal') continue;
      const addr = ch === 'email' ? t.email : t.phone;
      const skip = t.notify_opt_out ? 'المستأجر طلب عدم مراسلته' : !addr ? (ch === 'email' ? 'لا يوجد بريد للمستأجر' : 'لا يوجد جوال للمستأجر') : undefined;
      items.push({ rule, channel: ch, dedupe: `${rule.id}:${key}:${ch}`, tenant_id: t.id, entity_id: entity, to_addr: addr, recipient: t.name, subject: render(rule.subject, vars), body: render(rule.template, vars), skip });
    }
  };
  const forStaff = (rule: Rule, key: string, subject: string, body: string, entity: string | null) => {
    for (const u of staff) for (const ch of rule.channels.split(',').filter(Boolean) as Channel[]) {
      if (ch !== 'internal' && ch !== 'email') continue;
      items.push({ rule, channel: ch, dedupe: `${rule.id}:${key}:${u.id}:${ch}`, user_id: u.id, entity_id: entity, to_addr: ch === 'email' ? u.email : null, recipient: u.full_name, subject, body,
        skip: ch === 'email' && !u.email ? 'لا يوجد بريد للمستخدم (يُضاف من «حسابي»)' : undefined });
    }
  };
  for (const rule of rules) {
    if (rule.kind === 'due_soon') {
      for (const r of a.rows) {
        if (r.balance <= 0 || r.needs_confirmation || r.contract.status !== 'active') continue;
        const d = daysBetween(now, r.due_date); if (d < 0 || d > rule.offset_days) continue;
        const url = await payUrl(r.contract.tenant_id, r.contract_id, [r.id], r.balance, `قسط الإيجار المستحق ${date(r.due_date)}`);
        forTenant({ ...rule, template: withPay(rule.template, url) }, r.contract.tenant_id, r.id, { 'الاسم': r.tenantName, 'المبلغ': money(r.balance), 'الاستحقاق': date(r.due_date), 'العقار': r.propertyShort, 'الوحدة': r.unitCode, 'الأيام': d, 'الجهة': org }, r.id);
      }
    } else if (rule.kind === 'overdue') {
      for (const ts of a.tenantStats) {
        const od = ts.rows.filter((r) => r.status === 'overdue'); if (!od.length) continue;
        const late = Math.max(...od.map((r) => r.daysLate)); if (late < rule.offset_days) continue;
        const bucket = rule.repeat_days > 0 ? `p${Math.floor(Date.parse(now) / 864e5 / rule.repeat_days)}` : `i${od.map((r) => r.id).sort()[0]}`;
        const url = await payUrl(ts.t.id, null, od.map((r) => r.id), ts.arrears, `سداد المتأخرات (${od.length} أقساط)`);
        forTenant({ ...rule, template: withPay(rule.template, url) }, ts.t.id, `${ts.t.id}:${bucket}`, { 'الاسم': ts.t.name, 'المتأخرات': money(ts.arrears), 'عدد_الأقساط': od.length, 'الأيام': late, 'الجهة': org }, ts.t.id);
      }
    } else if (rule.kind === 'contract_end' || rule.kind === 'contract_end_staff') {
      for (const c of a.active) {
        const d = daysBetween(now, c.end_date); if (d < 0 || d > rule.offset_days) continue;
        if (db.contracts.some((n) => n.renewed_from === c.id)) continue;
        const vars = { 'الاسم': T.get(c.tenant_id)?.name ?? '—', 'الانتهاء': date(c.end_date), 'العقار': a.P.get(c.property_id)?.short ?? '', 'الوحدة': a.U.get(c.unit_id)?.code ?? '', 'رقم_العقد': c.contract_no ?? '—', 'الأيام': d, 'الجهة': org,
          'المتأخرات': money(a.overdue.filter((r) => r.contract_id === c.id).reduce((n, r) => n + r.balance, 0)) };
        if (rule.audience === 'staff') forStaff(rule, c.id, render(rule.subject, vars), render(rule.template, vars), c.id);
        else forTenant(rule, c.tenant_id, c.id, vars, c.id);
      }
    } else if (rule.kind === 'license_expiry') {
      for (const l of await q('select * from licenses where expiry_date is not null')) {
        const d = daysBetween(now, String(l.expiry_date)); if (d > rule.offset_days) continue;
        const vars = { 'المستند': l.kind, 'العقار': a.P.get(l.property_id)?.short ?? '', 'الانتهاء': date(String(l.expiry_date)), 'الأيام': d };
        forStaff(rule, `${l.id}:${l.expiry_date}`, render(rule.subject, vars), render(rule.template, vars) + (d < 0 ? ' (منتهي)' : ''), l.id);
      }
    } else if (rule.kind === 'payable_due') {
      for (const p of await q(`select p.*, o.landlord, o.property_id from obligation_payments p join lease_obligations o on o.id=p.obligation_id where p.status<>'paid'`)) {
        const d = daysBetween(now, String(p.due_date)); if (d > rule.offset_days) continue;
        const vars = { 'المؤجر': p.landlord, 'العقار': a.P.get(p.property_id)?.short ?? '', 'المبلغ': money(Number(p.amount)), 'الاستحقاق': date(String(p.due_date)), 'الأيام': d };
        forStaff(rule, p.id, render(rule.subject, vars), render(rule.template, vars), p.id);
      }
    } else if (rule.kind === 'staff_digest') {
      const newLate = a.overdue.filter((r) => r.daysLate <= 1), dueWeek = a.rows.filter((r) => r.balance > 0 && !r.needs_confirmation && r.due_date >= now && daysBetween(now, r.due_date) <= 7);
      const ending = a.renewals.filter((r) => r.days >= 0 && r.days <= 30), [{ n: pend }] = await q(`select count(*)::int as n from notify_queue where status='pending'`);
      const unm = db.bankLines.filter((l) => l.status === 'open').length, maint = db.maintenance.filter((m) => m.status === 'open' || m.status === 'progress').length;
      const lines = [
        `ملخص ${date(now)} — ${org}`,
        `• المتأخرات المؤكدة: ${money(a.arrearsTotal)} ريال على ${a.overdue.length} قسطاً${newLate.length ? ` (منها ${newLate.length} تأخرت اليوم)` : ''}.`,
        `• أقساط تستحق خلال 7 أيام: ${dueWeek.length} بمبلغ ${money(dueWeek.reduce((n, r) => n + r.balance, 0))} ريال.`,
        `• عقود تنتهي خلال 30 يوماً: ${ending.length}.`,
        `• متأخرون بلا متابعة خلال 30 يوماً: ${a.needFollow.length}.`,
        unm ? `• إيداعات بنكية غير مطابقة: ${unm}.` : '', maint ? `• طلبات صيانة مفتوحة: ${maint}.` : '',
        pend ? `• تذكيرات بانتظار المراجعة: ${pend}.` : '',
      ].filter(Boolean).join('\n');
      forStaff(rule, now, `${rule.subject} ${date(now)}`, lines, null);
    }
  }
  let added = 0, internal = 0;
  for (const it of items) {
    const r = await q(`insert into notify_queue (id,rule_id,kind,channel,dedupe,tenant_id,user_id,entity_id,to_addr,recipient,subject,body,status,error,scheduled_on)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict (dedupe) do update set to_addr=excluded.to_addr, recipient=excluded.recipient, subject=excluded.subject, body=excluded.body, status=excluded.status, error=excluded.error, scheduled_on=excluded.scheduled_on
      where notify_queue.status='skipped' and excluded.status<>'skipped' returning id`,
      [uid('nq'), it.rule.id, it.rule.kind, it.channel, it.dedupe, it.tenant_id ?? null, it.user_id ?? null, it.entity_id ?? null, it.to_addr, it.recipient, it.subject, it.body,
        it.skip ? 'skipped' : it.rule.mode === 'auto' || it.channel === 'internal' ? 'approved' : 'pending', it.skip ?? null, now]);
    added += r.length; if (it.channel === 'internal') internal += r.length;
  }
  return { added, internal, candidates: items.length };
}

/** يرسل عنصراً واحداً من الطابور. واتساب بدون بوابة يصبح «جاهز للإرسال اليدوي» برابط يفتحه الموظف. */
export async function sendItem(id: string, by: string, S?: Record<string, string>) {
  const [it] = await q('select * from notify_queue where id=$1', [id]); if (!it || !['pending', 'approved', 'failed'].includes(it.status)) return 'ignored';
  const set = async (status: string, error: string | null = null) => q(`update notify_queue set status=$2, error=$3, sent_by=$4, sent_at=case when $2='sent' then now() else sent_at end where id=$1`, [id, status, error, by]);
  S = S ?? await getSettings();
  try {
    if (it.channel === 'internal') {
      await q(`insert into notifications (id,user_id,title,body,href,tone) values ($1,$2,$3,$4,$5,$6)`, [uid('nt'), it.user_id, it.subject || 'تنبيه', it.body,
        it.kind === 'contract_end_staff' && it.entity_id ? `/contracts/${it.entity_id}` : it.kind === 'staff_digest' ? '/' : it.kind === 'license_expiry' ? '/compliance' : it.kind === 'payable_due' ? '/payables' : null, it.kind === 'staff_digest' ? 'info' : 'warn']);
    } else if (it.channel === 'email') {
      const c = smtpFrom(S); if (!c) { await set('failed', 'إعدادات البريد غير مكتملة'); return 'failed'; }
      await sendMail(c, it.to_addr, it.subject || 'تنبيه', it.body);
    } else if (it.channel === 'sms') {
      if (!smsReady(S)) { await set('failed', 'بوابة الرسائل غير مضبوطة'); return 'failed'; }
      await sendSms(S, it.to_addr, it.body);
    } else if (it.channel === 'whatsapp') {
      if (!waReady(S)) { if (it.status !== 'manual') await set('manual', waLink(it.to_addr, it.body) ? null : 'رقم الجوال غير صالح لواتساب'); return 'manual'; }
      await sendWhatsApp(S, it.to_addr, it.body);
    }
    await set('sent'); return 'sent';
  } catch (e: any) { await set('failed', String(e?.message ?? e).slice(0, 300)); return 'failed'; }
}

/** دورة كاملة: إنشاء التذكيرات ثم إرسال المعتمد منها */
export async function runCycle(by: string, today?: string) {
  const g = await generate(today);
  const S = await getSettings(); const out = { sent: 0, failed: 0, manual: 0 } as { sent: number; failed: number; manual: number };
  for (const { id } of await q(`select id from notify_queue where status='approved' order by created_at limit 500`)) { const r = await sendItem(id, by, S); if (r === 'sent' || r === 'failed' || r === 'manual') out[r]++; }
  await q(`insert into activity_log (username,action,details) values ($1,'تشغيل التنبيهات',$2)`, [by, `جديد ${g.added} • أُرسل ${out.sent} • فشل ${out.failed} • يدوي ${out.manual}`]);
  return { ...g, ...out };
}
