import type { DB } from './types';
import type { Analysis } from './calc';
import { daysBetween, addMonths } from './calc';
import { runAudit } from './audit';
import { expiringDocs, missingDocs } from './docs';
import { parseFeatureCfg } from './features';

export type TType = 'تحصيل' | 'توثيق' | 'مطابقة' | 'إيجار' | 'بيانات' | 'تجديد' | 'استحقاق' | 'صيانة' | 'اعتماد' | 'يدوية';
export interface GTask { key: string; type: TType; p: 'p1' | 'p2' | 'p3'; prop: string; propertyId?: string; propertyName?: string; title: string; desc: string; amount: number; due: string | null; href: string; act: string;
  inst?: { unit: string; rows: { due: string; amount: number; late: number; href: string }[] }[]; n?: number; who: string; last?: string | null; tenantId?: string; legacyKey?: string; done?: boolean }

export function buildTasks(db: DB, a: Analysis): GTask[] {
  const T: GTask[] = []; const today = a.today;
  for (const s of a.tenantStats) {
    const allOverdue = s.rows.filter((r) => r.status === 'overdue'); if (!allOverdue.length) continue;
    const properties = new Map<string, typeof allOverdue>();
    for (const row of allOverdue) properties.set(row.contract.property_id, [...(properties.get(row.contract.property_id) || []), row]);
    for (const [propertyId, od] of properties) {
      const units = new Map<string, typeof od>();
      for (const row of od) units.set(row.contract.unit_id, [...(units.get(row.contract.unit_id) || []), row]);
      const oldest = Math.max(...od.map(r => r.daysLate)), amt = Math.round(od.reduce((n, r) => n + r.balance, 0) * 100) / 100;
      const p = amt >= 40000 || (oldest > 180 && amt >= 10000) ? 'p1' : amt >= 5000 || oldest > 90 ? 'p2' : 'p3';
      const lastF = s.lastFollow;
      const act = !lastF ? 'تسجيل اتصال' : ['إنذار رسمي', 'إحالة قانونية'].includes(lastF.type) ? 'إحالة قانونية' : ['مطالبة رسمية', 'إشعار بالسداد'].includes(lastF.type) ? 'إنذار رسمي' : 'إصدار مطالبة رسمية';
      T.push({ key: `col:${s.t.id}:${propertyId}`, legacyKey: `col:${s.t.id}`, tenantId: s.t.id, type: 'تحصيل', p, prop: od[0].propertyShort, propertyId, propertyName: a.P.get(propertyId)?.name, title: s.t.name,
        desc: [...new Set(od.map(r => r.contract.trade_name).filter(Boolean))].join(' • '), amount: amt, due: lastF?.next_date || today, href: `/tenants/${s.t.id}#tab=followups`, act, who: 'موظف التحصيل', n: od.length, last: lastF?.date ?? null,
        inst: [...units.values()].map(rows => ({ unit: `${rows[0].propertyShort} — ${rows[0].unitCode}`, rows: [...rows].sort((x,y)=>x.due_date.localeCompare(y.due_date)).map(r => ({due:r.due_date,amount:r.balance,late:r.daysLate,href:`/installments/${r.id}`})) })) });
    }
  }
  for (const r of a.upcoming.filter((x) => daysBetween(today, x.due_date) <= 10 && daysBetween(today, x.due_date) >= 0))
    T.push({ key: `due:${r.id}`, type: 'استحقاق', p: 'p3', prop: r.propertyShort, propertyId: r.contract.property_id, propertyName: a.P.get(r.contract.property_id)?.name, title: `${r.tenantName} — قسط قادم`, desc: `${r.propertyShort} — ${r.unitCode}، يستحق خلال ${daysBetween(today, r.due_date)} أيام.`, amount: r.balance, due: r.due_date, href: `/installments/${r.id}`, act: 'إرسال تذكير', who: 'موظف التحصيل' });
  for (const r of a.renewals.filter((x) => x.negotiate <= addMonths(today, 1)))
    T.push({ key: `ren:${r.c.id}`, type: 'تجديد', p: r.days <= 60 ? 'p1' : 'p2', prop: r.prop.short, propertyId: r.c.property_id, propertyName: r.prop.name, title: `${r.tenantName} — ${r.unitCode}`, desc: r.days < 0 ? `انتهت مدة العقد منذ ${-r.days} يوماً دون تجديد أو إنهاء.` : `${r.days <= 30 ? 'تنبيه 30 يوماً — عاجل: ' : r.days <= 60 ? 'تنبيه 60 يوماً: ' : r.days <= 90 ? 'تنبيه 90 يوماً: ' : ''}العقد ينتهي بعد ${r.days} يوماً، وموعد التفاوض ${r.negotiate.split('-').reverse().join('/')}.${r.c.notice_days ? ` مدة الإشعار بالعقد ${r.c.notice_days} يوماً.` : ''}`, amount: r.c.annual_rent, due: r.negotiate, href: `/contracts/${r.c.id}`, act: 'فتح التجديد', who: 'مدير الاستثمار' });
  const F = db.meta.features ?? {};
  if (F.doc_alerts) for (const d of expiringDocs(db, today, 60))
    T.push({ key: `doc:${d.key}:${d.date}`, type: 'توثيق', p: d.days <= 30 ? 'p1' : 'p2', prop: 'عام', title: `${d.title} — ${d.what}`, desc: d.days < 0 ? `انتهى منذ ${-d.days} يوماً (${d.date.split('-').reverse().join('/')}).` : `${d.days <= 30 ? 'تنبيه 30 يوماً: ' : 'تنبيه 60 يوماً: '}ينتهي بعد ${d.days} يوماً (${d.date.split('-').reverse().join('/')}).`, amount: 0, due: d.date, href: d.href, act: 'تحديث المستند', who: 'المحاسب' });
  if (F.doc_required) { const cfg = parseFeatureCfg(db.meta.settings ?? {}); const miss = a.active.map((c) => ({ c, m: missingDocs(db, c, cfg.required_docs) })).filter((x) => x.m.length);
    if (miss.length) T.push({ key: 'docreq', type: 'توثيق', p: 'p2', prop: 'عام', title: `${miss.length} عقود سارية ناقصة المستندات`, desc: `${miss.reduce((x, y) => x + y.m.length, 0)} متطلب ناقص (هوية/سجل، عقد موقع…).`, amount: 0, due: today, href: '/documents?f=missing', act: 'عرض النواقص', who: 'المحاسب' }); }
  const open = db.bankLines.filter((l) => l.status === 'open');
  if (open.length) T.push({ key: 'bank:open', type: 'مطابقة', p: 'p2', prop: 'عام', title: `${open.length} إيداعات بنكية غير مطابقة`, desc: 'إيداعات مستوردة من كشف البنك لم تُربط بسند أو قسط.', amount: open.reduce((x, l) => x + l.amount, 0), due: today, href: '/bank/match', act: 'فتح المطابقة', who: 'المحاسب' });
  const pend = db.adjustments.filter((x) => x.status === 'pending');
  if (pend.length) T.push({ key: 'appr:adj', type: 'اعتماد', p: 'p2', prop: 'عام', title: `${pend.length} طلبات خصم بانتظار الاعتماد`, desc: 'لا تؤثر في الأرصدة قبل اعتمادها.', amount: pend.reduce((x, y) => x + y.amount, 0), due: today, href: '/approvals', act: 'مراجعة الطلبات', who: 'مدير الاستثمار' });
  const pex = db.exceptions.filter((x) => x.status === 'pending');
  if (pex.length) T.push({ key: 'appr:exc', type: 'اعتماد', p: 'p3', prop: 'عام', title: `${pex.length} طلبات استثناء بانتظار الاعتماد`, desc: 'استثناءات من قواعد تدقيق البيانات.', amount: 0, due: today, href: '/approvals', act: 'مراجعة الطلبات', who: 'مدير الاستثمار' });
  for (const m of db.maintenance.filter((x) => x.status === 'open' || x.status === 'progress')) {
    const age = daysBetween(m.opened_on, today);
    T.push({ key: `mnt:${m.id}`, type: 'صيانة', p: m.priority === 'عاجلة' ? 'p1' : age > 14 ? 'p2' : 'p3', prop: a.P.get(m.property_id)?.short ?? '', propertyId: m.property_id, propertyName: a.P.get(m.property_id)?.name, title: m.title, desc: `مفتوح منذ ${age} يوماً${m.vendor ? ' • ' + m.vendor : ''}`, amount: m.est_cost ?? 0, due: m.opened_on, href: `/maintenance/${m.id}`, act: 'متابعة الطلب', who: 'مسؤول الصيانة' });
  }
  const audit = runAudit(db, a);
  const groups = new Map<string, number>(); audit.open.forEach((f) => { if (['late_no_follow', 'unconfirmed', 'adj_pending'].includes(f.rule)) return; groups.set(f.rule, (groups.get(f.rule) ?? 0) + 1); });
  const TITLE: Record<string, [string, TType, 'p1' | 'p2' | 'p3']> = { inst_paid_no_date: ['أقساط مسددة في الملف بلا تاريخ استلام', 'توثيق', 'p2'], paid_no_receipt: ['دفعات بلا رقم سند قبض', 'توثيق', 'p2'], pay_no_attach: ['سندات بلا مرفق', 'توثيق', 'p2'], pay_unmatched: ['سندات غير مطابقة مع البنك', 'مطابقة', 'p2'], adj_no_decision: ['خصومات بلا رقم قرار', 'توثيق', 'p2'],
    contract_expired_active: ['عقود انتهت مدتها دون إجراء', 'تجديد', 'p1'], contract_no_ejar: ['عقود بلا رقم إيجار', 'بيانات', 'p3'], contract_no_copy: ['عقود بلا نسخة مرفقة', 'توثيق', 'p3'], dup_contract_no: ['أرقام عقود مكررة', 'بيانات', 'p2'],
    tenant_no_phone: ['مستأجرون بلا جوال', 'بيانات', 'p3'], tenant_no_id: ['مستأجرون بلا هوية أو سجل', 'بيانات', 'p3'], property_no_deed: ['عقارات بلا رقم صك', 'بيانات', 'p3'], property_no_value: ['عقارات بلا قيمة دفترية', 'بيانات', 'p3'],
    doc_expired: ['مستندات منتهية', 'توثيق', 'p2'], ejar_unlinked: ['عقود إيجار غير مربوطة', 'إيجار', 'p2'], ejar_paid_open: ['مدفوع في إيجار وغير مسدد في النظام', 'إيجار', 'p1'] };
  for (const [rule, n] of groups) { const [t, ty, p] = TITLE[rule] ?? [rule, 'بيانات', 'p3'];
    T.push({ key: `aud:${rule}`, type: ty, p, prop: 'عام', title: `${n} — ${t}`, desc: 'من فحص جودة البيانات. يمكن استثناء الحالات المبررة بطلب معتمد.', amount: audit.open.filter((f) => f.rule === rule).reduce((x, f) => x + (f.amount ?? 0), 0), due: today, href: `/audit?r=${rule}`, act: 'عرض الحالات', who: 'المحاسب' }); }
  if (a.unconfirmed.length) T.push({ key: 'aud:unconfirmed', type: 'مطابقة', p: 'p2', prop: 'عام', title: `${a.unconfirmed.length} أقساط تحتاج تأكيداً`, desc: 'مطابقتها مع كشف البنك وتأكيد سدادها أو عدمه.', amount: a.pendingTotal, due: today, href: '/reports/unconfirmed', act: 'فتح الكشف', who: 'المحاسب' });
  for (const m of db.tasks) T.push({ key: `man:${m.id}`, type: 'يدوية', p: (m.priority as 'p1') || 'p2', prop: 'عام', title: m.title, desc: m.details ?? '', amount: 0, due: m.due, href: '/', act: m.due ? 'موعدها ' + m.due.split('-').reverse().join('/') : 'مهمة يدوية', who: m.assignee ?? '' });
  const st = new Map(db.taskStates.map((s) => [s.key, s]));
  const ORD: Record<string, number> = { تحصيل: 0, تجديد: 1, استحقاق: 2, صيانة: 3, إيجار: 4, مطابقة: 5, اعتماد: 6, توثيق: 7, بيانات: 8, يدوية: 9 };
  return T.map((t) => ({ ...t, done: (st.get(t.key) ?? (t.legacyKey ? st.get(t.legacyKey) : undefined))?.status === 'done' })).sort((x, y) => x.p.localeCompare(y.p) || (ORD[x.type] ?? 9) - (ORD[y.type] ?? 9) || y.amount - x.amount);
}
