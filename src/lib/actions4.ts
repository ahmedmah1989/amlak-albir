'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { q, tx, uid } from './db';
import { requireAction, log } from './auth';
import { todayRiyadh, getSettings } from './data';
import { assertOpenPeriod, saveFiles } from './guard';
import { FEATURES, parseFeatures, parseFeatureCfg } from './features';
import { lateFeeFor } from './late-fee';
import { trackChanges, LABELS } from './changes';

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const n = (fd: FormData, k: string) => { const v = s(fd, k); if (v == null) return null; const x = Number(v.replace(/,/g, '')); return Number.isFinite(x) ? x : NaN; };
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
function back(path: string, err: string): never { redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(err)}`); }
function done(path: string, ok: string): never { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(ok)}`); }
const money = (x: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(x);
const r2 = (x: number) => Math.round(x * 100) / 100;
const setSetting = (k: string, v: string) => q('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]);
async function requireFeature(key: string, path: string) {
  const f = parseFeatures((await getSettings()).features);
  if (!f[key]) back(path, 'هذه الميزة غير مفعّلة. فعّلها من الإدارة ← الميزات');
}

// ---------- الميزات ----------
export async function saveFeatures(fd: FormData) {
  const u = await requireAction('admin');
  const f = Object.fromEntries(FEATURES.map((x) => [x.key, !!fd.get('f_' + x.key)]));
  await setSetting('features', JSON.stringify(f));
  await log(u, 'تعديل الميزات', undefined, undefined, FEATURES.map((x) => `${x.label}: ${f[x.key] ? 'مفعّل' : 'مقفل'}`).join(' • '));
  done('/settings/features', 'تم حفظ الميزات');
}
export async function saveFeatureCfg(fd: FormData) {
  const u = await requireAction('admin'); const path = '/settings/features';
  const vals: [string, number | null, number, number][] = [['late_fee_pct', n(fd, 'late_fee_pct'), 0, 10], ['late_fee_after', n(fd, 'late_fee_after'), 0, 365], ['late_fee_cap_pct', n(fd, 'late_fee_cap_pct'), 0, 100], ['elec_rate', n(fd, 'elec_rate'), 0, 100], ['water_rate', n(fd, 'water_rate'), 0, 1000]];
  for (const [k, v, lo, hi] of vals) { if (v == null || Number.isNaN(v) || v < lo || v > hi) back(path, `قيمة غير صحيحة: ${k}`); }
  for (const [k, v] of vals) await setSetting(k, String(v));
  const req = String(fd.get('required_docs') ?? '').split('\n').map((x) => x.trim()).filter((x) => /^(tenant|contract|unit):.+/.test(x));
  await setSetting('required_docs', JSON.stringify(req));
  await log(u, 'تعديل إعدادات الميزات'); done(path, 'تم حفظ الإعدادات');
}

// ---------- الوحدات الفرعية ----------
export async function saveSubunit(fd: FormData) {
  const u = await requireAction('accountant'); const parent = s(fd, 'parent_id')!, id = s(fd, 'id'), path = `/units/${parent}`;
  await requireFeature('units_split', path);
  const [p] = await q('select property_id from units where id=$1', [parent]); if (!p) back(path, 'الوحدة الأم غير موجودة');
  const code = s(fd, 'code'); if (!code) back(path, 'رقم الوحدة الفرعية مطلوب');
  const rent = n(fd, 'monthly_rent'), area = n(fd, 'area'); if (Number.isNaN(rent) || Number.isNaN(area)) back(path, 'تحقق من الأرقام');
  const st = s(fd, 'status') ?? 'occupied';
  const v = { code, unit_type: s(fd, 'unit_type'), floor: s(fd, 'floor'), rooms: s(fd, 'rooms'), occupant: s(fd, 'occupant'), monthly_rent: rent, area, status: st, note: s(fd, 'note') };
  if (id) {
    const [b] = await q('select * from units where id=$1 and parent_id=$2', [id, parent]); if (!b) back(path, 'الوحدة الفرعية غير موجودة');
    await trackChanges(q, u, 'unit', id, b, v, LABELS);
    await q('update units set code=$1,unit_type=$2,floor=$3,rooms=$4,occupant=$5,monthly_rent=$6,area=$7,status=$8,note=$9 where id=$10', [...Object.values(v), id]);
  } else await q(`insert into units (id,property_id,parent_id,kind,code,unit_type,floor,rooms,occupant,monthly_rent,area,status,note) values ($1,$2,$3,'subunit',$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [uid('u'), p.property_id, parent, ...Object.values(v)]);
  await log(u, id ? 'تعديل وحدة فرعية' : 'إضافة وحدة فرعية', 'unit', parent, code!); done(path, 'تم حفظ الوحدة الفرعية');
}
export async function bulkSubunits(fd: FormData) {
  const u = await requireAction('accountant'); const parent = s(fd, 'parent_id')!, path = `/units/${parent}`;
  await requireFeature('units_split', path);
  const count = n(fd, 'count'), prefix = s(fd, 'prefix') ?? 'شقة', start = n(fd, 'start') ?? 1;
  if (!count || Number.isNaN(count) || count < 1 || count > 200 || !Number.isInteger(count)) back(path, 'العدد بين 1 و200');
  const [p] = await q('select property_id from units where id=$1', [parent]);
  const ex = new Set((await q('select code from units where parent_id=$1', [parent])).map((r) => r.code));
  let c = 0;
  await tx(async (t) => { for (let i = 0; i < count!; i++) { const code = `${prefix} ${start! + i}`; if (ex.has(code)) continue;
    await t(`insert into units (id,property_id,parent_id,kind,code,unit_type,status) values ($1,$2,$3,'subunit',$4,$5,'occupied')`, [uid('u'), p.property_id, parent, code, s(fd, 'unit_type')]); c++; } });
  await log(u, 'إضافة وحدات فرعية', 'unit', parent, `${c} وحدة`); done(path, `أضيفت ${c} وحدة فرعية`);
}

// ---------- العدادات ----------
export async function addMeterReading(fd: FormData) {
  const u = await requireAction('accountant'); const unit = s(fd, 'unit_id')!, path = `/units/${unit}`;
  await requireFeature('meters', path);
  const kind = s(fd, 'kind'), d = s(fd, 'read_on'), reading = n(fd, 'reading');
  if (kind !== 'elec' && kind !== 'water') back(path, 'اختر نوع العداد');
  if (!isDate(d) || d! > todayRiyadh()) back(path, 'تاريخ القراءة غير صحيح');
  if (reading == null || Number.isNaN(reading) || reading < 0) back(path, 'أدخل القراءة');
  const [prev] = await q('select reading, read_on from meter_readings where unit_id=$1 and kind=$2 and read_on<=$3 order by read_on desc, created_at desc limit 1', [unit, kind, d]);
  if (prev && Number(reading) < Number(prev.reading) && !fd.get('reset')) back(path, `القراءة أقل من السابقة (${prev.reading}). إن تم تغيير العداد علّم «عداد جديد»`);
  const S = await getSettings();
  const rate = n(fd, 'rate') ?? Number(kind === 'elec' ? S.elec_rate : S.water_rate);
  const cons = prev && !fd.get('reset') ? r2(reading! - Number(prev.reading)) : null;
  await q('insert into meter_readings (id,unit_id,kind,read_on,reading,consumption,rate,amount,note,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [uid('m'), unit, kind, d, reading, cons, rate, cons != null && rate ? r2(cons * rate) : null, s(fd, 'note'), u.full_name]);
  await log(u, 'قراءة عداد', 'unit', unit, `${kind === 'elec' ? 'كهرباء' : 'مياه'} ${reading}${cons != null ? ` • استهلاك ${cons}` : ''}`);
  done(path, cons != null ? `سُجلت القراءة؛ الاستهلاك ${money(cons)}` : 'سُجلت القراءة الأولى (بداية القياس)');
}
export async function chargeMeter(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!;
  const [m] = await q('select m.*, u.property_id from meter_readings m join units u on u.id=m.unit_id where m.id=$1', [id]);
  const path = `/units/${m?.unit_id ?? ''}`;
  await requireFeature('meters', path);
  if (!m || m.charged || !m.amount || Number(m.amount) <= 0) back(path, 'لا يوجد مبلغ قابل للتحميل');
  const [c] = await q(`select id from contracts where status='active' and (unit_id=$1 or unit_id=(select parent_id from units where id=$1)) order by start_date desc limit 1`, [m.unit_id]);
  if (!c) back(path, 'لا يوجد عقد ساري على الوحدة لتحميل الاستهلاك عليه');
  const due = s(fd, 'due_date') ?? todayRiyadh(); if (!isDate(due)) back(path, 'تاريخ الاستحقاق غير صحيح');
  await assertOpenPeriod(due, path);
  const iid = uid('i');
  await tx(async (t) => {
    const [{ mx }] = await t('select coalesce(max(no),0)::int mx from installments where contract_id=$1', [c.id]);
    await t(`insert into installments (id,contract_id,no,period_from,period_to,due_date,amount,note,kind) values ($1,$2,$3,$4,$4,$5,$6,$7,'utility')`,
      [iid, c.id, mx + 1, m.read_on, due, m.amount, `استهلاك ${m.kind === 'elec' ? 'كهرباء' : 'مياه'} ${m.consumption} × ${m.rate} حتى ${m.read_on}`]);
    await t('update meter_readings set charged=true, installment_id=$1 where id=$2', [iid, id]);
  });
  await log(u, 'تحميل استهلاك على مستأجر', 'contract', c.id, money(Number(m.amount))); done(path, `حُمّل ${money(Number(m.amount))} ريال على العقد كقسط خدمات`);
}

// ---------- خطة التحصيل ----------
export async function setCollector(fd: FormData) {
  const u = await requireAction('accountant'); const path = s(fd, 'back') || '/collection';
  await requireFeature('collection_plan', path);
  const ids = fd.getAll('tenant').map(String).filter(Boolean), col = s(fd, 'collector');
  if (!ids.length) back(path, 'اختر مستأجراً واحداً على الأقل');
  for (const t of ids) await q('update tenants set collector=$1 where id=$2', [col, t]);
  await log(u, 'تعيين موظف تحصيل', 'tenant', undefined, `${ids.length} مستأجر`); done(path, 'تم التعيين');
}
export async function logCall(fd: FormData) {
  const u = await requireAction('accountant'); const tid = s(fd, 'tenant_id')!, path = s(fd, 'back') || '/collection';
  await requireFeature('collection_plan', path);
  const res = s(fd, 'result'); if (!res) back(path, 'اختر نتيجة التواصل');
  const nd = s(fd, 'next_date'); if (nd && !isDate(nd)) back(path, 'تاريخ المتابعة غير صحيح');
  const type = res === 'وعد بالسداد' ? 'وعد بالسداد' : res === 'لم يرد' ? 'اتصال هاتفي' : res === 'رسالة' ? 'رسالة نصية' : 'اتصال هاتفي';
  await q('insert into followups (id,tenant_id,date,type,details,next_date,created_by) values ($1,$2,$3,$4,$5,$6,$7)',
    [uid('f'), tid, todayRiyadh(), type, [res, s(fd, 'promise_amount') && `المبلغ الموعود ${s(fd, 'promise_amount')}`, s(fd, 'details')].filter(Boolean).join(' • '), nd, u.full_name]);
  await log(u, 'نتيجة تحصيل', 'tenant', tid, res!); done(path, 'سُجلت النتيجة');
}

// ---------- غرامات التأخير ----------
export async function issueLateFee(fd: FormData) {
  const u = await requireAction('admin'); const iid = s(fd, 'installment_id')!, path = `/installments/${iid}`;
  await requireFeature('late_fees', path);
  const decision = s(fd, 'decision_no'); if (!decision) back(path, 'رقم قرار الغرامة مطلوب');
  const { loadDB } = await import('./data'); const { analyze } = await import('./calc');
  const db = await loadDB(); const a = analyze(db); const r = a.rows.find((x) => x.id === iid);
  if (!r) back(path, 'القسط غير موجود');
  const cfg = parseFeatureCfg(db.meta.settings);
  const fee = lateFeeFor(r, cfg, a.today);
  const amt = n(fd, 'amount') ?? fee.amount;
  if (!amt || Number.isNaN(amt) || amt <= 0) back(path, 'لا توجد غرامة مستحقة على هذا القسط');
  await assertOpenPeriod(todayRiyadh(), path);
  const nid = uid('i');
  await tx(async (t) => {
    const [{ mx }] = await t('select coalesce(max(no),0)::int mx from installments where contract_id=$1', [r!.contract_id]);
    await t(`insert into installments (id,contract_id,no,due_date,amount,note,kind) values ($1,$2,$3,$4,$5,$6,'penalty')`,
      [nid, r!.contract_id, mx + 1, todayRiyadh(), r2(amt!), `غرامة تأخير على القسط ${r!.no} (${r!.daysLate} يوماً) • قرار ${decision}`]);
  });
  await log(u, 'إصدار غرامة تأخير', 'installment', iid, `${money(amt!)} • قرار ${decision}`); done(`/installments/${nid}`, `صدرت غرامة بقيمة ${money(amt!)} ريال`);
}

// ---------- الموازنة ----------
export async function saveBudget(fd: FormData) {
  const u = await requireAction('admin'); const year = n(fd, 'year'), path = `/reports/budget?y=${year ?? ''}`;
  await requireFeature('accounting', path);
  if (!year || Number.isNaN(year) || year < 2000 || year > 2100) back('/reports/budget', 'السنة غير صحيحة');
  const props = await q('select id from properties');
  for (const p of props) {
    const rv = n(fd, 'rev_' + p.id), ex = n(fd, 'exp_' + p.id);
    if (Number.isNaN(rv) || Number.isNaN(ex)) back(path, 'تحقق من الأرقام');
    await q('insert into property_budgets (property_id,year,revenue,expenses) values ($1,$2,$3,$4) on conflict (property_id,year) do update set revenue=excluded.revenue, expenses=excluded.expenses', [p.id, year, rv, ex]);
  }
  await log(u, 'حفظ الموازنة', undefined, undefined, String(year)); done(path, 'تم حفظ الموازنة');
}

// ---------- بوابة المستأجر ----------
export async function portalToken(fd: FormData) {
  const u = await requireAction('accountant'); const tid = s(fd, 'tenant_id')!, path = `/tenants/${tid}`;
  await requireFeature('portal', path);
  const mode = s(fd, 'mode');
  const token = mode === 'revoke' ? null : randomBytes(18).toString('base64url');
  await q('update tenants set portal_token=$1 where id=$2', [token, tid]);
  await log(u, mode === 'revoke' ? 'إيقاف رابط البوابة' : 'إنشاء رابط البوابة', 'tenant', tid); done(path, mode === 'revoke' ? 'تم إيقاف الرابط' : 'تم إنشاء رابط جديد؛ الرابط السابق لم يعد يعمل');
}
/** رفع إشعار تحويل من البوابة العامة (بدون دخول) — يُحفظ كمرفق ومتابعة للمراجعة */
export async function portalUpload(fd: FormData) {
  const token = s(fd, 'token') ?? '', path = `/portal/${token}`;
  const S = await getSettings(); if (!parseFeatures(S.features).portal) back(path, 'الخدمة غير متاحة حالياً');
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) back('/portal/x', 'رابط غير صالح');
  const [t] = await q('select id, name from tenants where portal_token=$1', [token]);
  if (!t) back(path, 'الرابط غير صالح أو تم إيقافه');
  const files = fd.getAll('files').filter((x): x is File => x instanceof File && x.size > 0).slice(0, 5);
  if (!files.length) back(path, 'اختر صورة أو ملف إشعار التحويل');
  const amt = n(fd, 'amount'), d = s(fd, 'paid_on');
  if (amt == null || Number.isNaN(amt) || amt <= 0) back(path, 'أدخل المبلغ المحوّل');
  if (!isDate(d) || d! > todayRiyadh()) back(path, 'تاريخ التحويل غير صحيح');
  const sys = { id: 'portal', username: 'portal', full_name: `بوابة المستأجر: ${t.name}`, role: 'viewer' as const, must_change: false, prefs: '{}', perms: '{}' };
  try { await saveFiles('tenant', t.id, files, sys, 'إشعار تحويل من البوابة'); } catch (e: any) { back(path, e.message); }
  await q('insert into followups (id,tenant_id,date,type,details,next_date,created_by) values ($1,$2,$3,$4,$5,$6,$7)',
    [uid('f'), t.id, todayRiyadh(), 'إشعار بالسداد', `رفع المستأجر إشعار تحويل عبر البوابة بمبلغ ${money(amt!)} بتاريخ ${d}${s(fd, 'ref') ? ' • مرجع ' + s(fd, 'ref') : ''} — يحتاج مراجعة وتسجيل سند`, todayRiyadh(), 'البوابة']);
  await q(`insert into tasks (id,title,details,due,priority,status,created_by) values ($1,$2,$3,$4,'p1','open','البوابة')`,
    [uid('tk'), `مراجعة إشعار تحويل: ${t.name}`, `${money(amt!)} ريال بتاريخ ${d}. راجع البنك وسجّل السند من ملف المستأجر.`, todayRiyadh()]);
  await log(null, 'رفع إشعار عبر البوابة', 'tenant', t.id, money(amt!));
  redirect(`${path}?ok=${encodeURIComponent('تم استلام الإشعار وسيتم مراجعته وإصدار السند')}`);
}
