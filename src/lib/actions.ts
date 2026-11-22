'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx, uid, pq, runAs, currentOrg, validSlug, MULTI, MAIN, type Q } from './db';
import { cookies } from 'next/headers';
import { requireUser, requireAction, createSession, destroySession, log, orgState, type User } from './auth';
import { hashPassword, verifyPassword } from './password';
import { buildSchedule, addDays, addMonths } from './calc';
import { todayRiyadh } from './data';
import { assertOpenPeriod, saveFiles } from './guard';
import type { Frequency } from './types';
import { planPayment } from './payment-plan';
import { METHODS } from './fmt';
import { trackChanges, LABELS } from './changes';

// ---------- أدوات ----------
/** يحفظ الملفات المرفقة مع نموذج (حقل files وحقل file_category) */
async function attachFrom(fd: FormData, entity: string, id: string, u: User, path: string) {
  const files = fd.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
  if (!files.length) return 0;
  try { return await saveFiles(entity, id, files, u, s(fd, 'file_category'), s(fd, 'file_expires')); }
  catch (e: any) { done(path, `حُفظت البيانات لكن تعذر إرفاق الملفات: ${e.message}`); }
}
const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const n = (fd: FormData, k: string) => { const v = s(fd, k); if (v == null) return null; const x = Number(v.replace(/,/g, '')); return Number.isFinite(x) ? x : NaN; };
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
function back(path: string, err: string): never { redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(err)}`); }
function done(path: string, ok: string): never { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(ok)}`); }
const money = (x: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(x);

async function openBalances(t: Q, contractId: string) {
  return t(`select i.id, i.no, i.due_date,
      round(i.amount - i.opening_paid
        - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id=a.payment_id where a.installment_id=i.id and not p.voided),0)
        - coalesce((select sum(d.amount) from adjustments d where d.installment_id=i.id and d.status='approved'),0), 2) as bal
    from installments i where i.contract_id=$1 order by i.due_date, i.no, i.id`, [contractId]);
}

// ---------- الدخول ----------
export async function login(fd: FormData) {
  const u = s(fd, 'username')?.toLowerCase(), p = s(fd, 'password');
  let org = currentOrg();
  if (MULTI) {
    const o = (s(fd, 'org') ?? '').toLowerCase();
    if (o && o !== org) {
      if (o !== MAIN && !validSlug(o)) back('/login', 'رمز الجهة غير صحيح');
      const [r] = o === MAIN ? [{ slug: MAIN }] : await pq('select slug from orgs where slug=$1', [o]);
      if (!r) back('/login', 'رمز الجهة غير مسجل');
      org = o; cookies().set('amlak_org', org, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 365 * 86400 });
    }
  }
  if (!u || !p) back('/login', 'أدخل اسم المستخدم وكلمة المرور');
  // كل خطوات الدخول تُنفّذ على قاعدة بيانات الجهة المختارة
  const dest = await runAs(org, async () => {
    if (MULTI) { const st = await orgState(); if (st.blocked) back('/login', st.blocked); }
    const [row] = await q('select * from users where lower(username)=$1 and active', [u]);
    if (!row || !verifyPassword(p!, row.pass_hash)) back('/login', 'بيانات الدخول غير صحيحة');
    await createSession(row.id);
    await log(row as User, 'تسجيل دخول');
    return row.must_change ? '/account?ok=' + encodeURIComponent('يرجى تغيير كلمة المرور المؤقتة') : '/';
  });
  redirect(dest);
}
export async function chooseOrg(fd: FormData) {
  const o = (s(fd, 'org') ?? '').toLowerCase(), back_ = s(fd, 'back') === '/login/recover' ? '/login/recover' : '/login';
  if (!MULTI) redirect(back_);
  if (o !== MAIN && !validSlug(o)) back(back_, 'رمز الجهة غير صحيح');
  const [r] = o === MAIN ? [{ slug: MAIN }] : await pq('select slug from orgs where slug=$1', [o]);
  if (!r) back(back_, 'رمز الجهة غير مسجل');
  cookies().set('amlak_org', o, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 365 * 86400 });
  redirect(back_);
}
export async function logout() { destroySession(); redirect('/login'); }
export async function changePassword(fd: FormData) {
  // exempt from the must_change wall: this IS the way out (requireAction would loop)
  const u = await requireUser();
  const cur = s(fd, 'current'), nw = s(fd, 'new'), cf = s(fd, 'confirm');
  const [row] = await q('select pass_hash from users where id=$1', [u.id]);
  if (!cur || !verifyPassword(cur, row.pass_hash)) back('/account', 'كلمة المرور الحالية غير صحيحة');
  if (!nw || nw.length < 8) back('/account', 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف');
  if (nw !== cf) back('/account', 'تأكيد كلمة المرور غير مطابق');
  await q('update users set pass_hash=$1, must_change=false where id=$2', [hashPassword(nw), u.id]);
  await log(u, 'تغيير كلمة المرور', 'user', u.id);
  done('/', 'تم تغيير كلمة المرور');
}

// ---------- العقارات والوحدات ----------
export async function saveProperty(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id');
  const name = s(fd, 'name'), short = s(fd, 'short') ?? name;
  if (!name) back(id ? `/properties/${id}/edit` : '/properties/new', 'اسم العقار مطلوب');
  const v = [name, short, s(fd, 'type'), s(fd, 'location'), s(fd, 'ownership'), n(fd, 'land_value'), n(fd, 'building_value'), s(fd, 'value_status'), s(fd, 'deed_no'), s(fd, 'notes') ?? '', s(fd, 'ground_lease_end')];
  if (v.some((x) => Number.isNaN(x))) back(id ? `/properties/${id}/edit` : '/properties/new', 'تحقق من القيم الرقمية');
  const lb = s(fd, 'land_basis'), la = n(fd, 'land_area'), ba = n(fd, 'building_area'), vdate = s(fd, 'val_date');
  if ([la, ba].some((x) => Number.isNaN(x))) back(id ? `/properties/${id}/edit` : '/properties/new', 'تحقق من المساحات');
  if (id) {
    const [pb] = await q('select * from properties where id=$1', [id]);
    // القيمة لا تُعدَّل من هنا بعد الإنشاء؛ تُسجَّل كإعادة تقييم من تبويب «القيمة والتقييمات»
    v[5] = pb?.land_value ?? null; v[6] = pb?.building_value ?? null; v[7] = pb?.value_status ?? v[7];
    await trackChanges(q, u, 'property', id, pb, { land_basis: lb, land_area: la, building_area: ba }, LABELS);
    await q('update properties set land_basis=$2, land_area=$3, building_area=$4 where id=$1', [id, lb, la, ba]);
    await trackChanges(q, u, 'property', id, pb, { name: v[0], short: v[1], type: v[2], location: v[3], ownership: v[4], land_value: v[5], building_value: v[6], value_status: v[7], deed_no: v[8], notes: v[9], ground_lease_end: v[10] }, LABELS);
    await q('update properties set name=$1,short=$2,type=$3,location=$4,ownership=$5,land_value=$6,building_value=$7,value_status=$8,deed_no=$9,notes=$10,ground_lease_end=$11 where id=$12', [...v, id]);
    await log(u, 'تعديل عقار', 'property', id, name!); done(`/properties/${id}`, 'تم حفظ بيانات العقار');
  }
  const nid = uid('p');
  if (lb === 'leased') v[5] = null; if (lb === 'land_only') v[6] = null;
  if (vdate && !/^\d{4}-\d{2}-\d{2}$/.test(vdate)) back('/properties/new', 'تاريخ القيمة غير صحيح');
  await q('insert into properties (name,short,type,location,ownership,land_value,building_value,value_status,deed_no,notes,ground_lease_end,id,land_basis,land_area,building_area) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [...v, nid, lb, la, ba]);
  if (v[5] != null || v[6] != null) await q(`insert into property_valuations (id,property_id,kind,val_date,land_value,building_value,basis,note,created_by) values ($1,$2,'initial',$3,$4,$5,$6,'القيمة عند إضافة العقار',$7)`,
    [uid('val'), nid, vdate, v[5], v[6], v[7], u.full_name]);
  await log(u, 'إضافة عقار', 'property', nid, name!); done(`/properties/${nid}`, 'تمت إضافة العقار');
}
export async function saveUnit(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id'), pid = s(fd, 'property_id')!, code = s(fd, 'code');
  if (!code) back(`/properties/${pid}`, 'رقم/اسم الوحدة مطلوب');
  const v = [code, s(fd, 'kind') ?? 'lease', s(fd, 'unit_type'), s(fd, 'floor'), s(fd, 'rooms'), s(fd, 'occupant'), n(fd, 'monthly_rent'), s(fd, 'note'), n(fd, 'area'), s(fd, 'elec_meter'), s(fd, 'water_meter'), s(fd, 'features')];
  const back_ = s(fd, 'back') || `/properties/${pid}`;
  if (v.some((x) => Number.isNaN(x))) back(back_, 'تحقق من القيم الرقمية للوحدة');
  if (id) { const [ub] = await q('select * from units where id=$1', [id]); await trackChanges(q, u, 'unit', id, ub, { code: v[0], kind: v[1], unit_type: v[2], floor: v[3], rooms: v[4], occupant: v[5], monthly_rent: v[6], note: v[7], area: v[8], elec_meter: v[9], water_meter: v[10], features: v[11] }, LABELS); }
  if (id) await q('update units set code=$1,kind=$2,unit_type=$3,floor=$4,rooms=$5,occupant=$6,monthly_rent=$7,note=$8,area=$9,elec_meter=$10,water_meter=$11,features=$12 where id=$13', [...v, id]);
  const unitId = id ?? uid('u');
  if (!id) await q('insert into units (code,kind,unit_type,floor,rooms,occupant,monthly_rent,note,area,elec_meter,water_meter,features,id,property_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [...v, unitId, pid]);
  const nf = await attachFrom(fd, 'unit', unitId, u, back_);
  await log(u, id ? 'تعديل وحدة' : 'إضافة وحدة', 'unit', unitId, code!); done(back_, 'تم حفظ الوحدة' + (nf ? ` وإرفاق ${nf} ملف` : ''));
}
export async function deleteUnit(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!, pid = s(fd, 'property_id')!;
  const [{ c }] = await q('select count(*)::int c from contracts where unit_id=$1', [id]);
  if (c > 0) back(`/properties/${pid}`, 'لا يمكن حذف وحدة مرتبطة بعقود');
  await q('delete from units where id=$1', [id]); await log(u, 'حذف وحدة', 'unit', id); done(`/properties/${pid}`, 'تم حذف الوحدة');
}

// ---------- المستأجرون ----------
const TENANT_COLS = ['name', 'tenant_type', 'phone', 'phone2', 'email', 'national_id', 'nationality', 'id_expiry', 'cr_no', 'cr_expiry', 'vat_no', 'contact_person', 'address', 'guarantor_name', 'guarantor_phone', 'guarantor_id', 'notes'];
export async function saveTenant(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id'), name = s(fd, 'name');
  const path = id ? `/tenants/${id}/edit` : '/tenants/new';
  if (!name) back(path, 'اسم المستأجر مطلوب');
  for (const k of ['phone', 'phone2', 'guarantor_phone']) { const v = s(fd, k); if (v && !/^[0-9+\s-]{7,20}$/.test(v)) back(path, 'رقم جوال غير صحيح'); }
  for (const k of ['id_expiry', 'cr_expiry']) { const v = s(fd, k); if (v && !isDate(v)) back(path, 'تاريخ انتهاء غير صحيح'); }
  const nid = s(fd, 'national_id'); if (nid && s(fd, 'tenant_type') !== 'company' && !/^[12]\d{9}$/.test(nid)) back(path, 'رقم الهوية/الإقامة 10 أرقام يبدأ بـ 1 أو 2');
  const vat = s(fd, 'vat_no'); if (vat && !/^3\d{13}3$/.test(vat)) back(path, 'الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3');
  const v = TENANT_COLS.map((k) => (k === 'tenant_type' ? s(fd, k) ?? 'individual' : s(fd, k)));
  if (id) {
    const [tb] = await q('select * from tenants where id=$1', [id]);
    await trackChanges(q, u, 'tenant', id, tb, Object.fromEntries(TENANT_COLS.map((k, i) => [k, v[i]])), LABELS);
    await q(`update tenants set ${TENANT_COLS.map((k, i) => `${k}=$${i + 1}`).join(',')} where id=$${TENANT_COLS.length + 1}`, [...v, id]);
    const nf = await attachFrom(fd, 'tenant', id, u, `/tenants/${id}`);
    await log(u, 'تعديل مستأجر', 'tenant', id, name!); done(`/tenants/${id}`, 'تم حفظ بيانات المستأجر' + (nf ? ` وإرفاق ${nf} ملف` : ''));
  }
  const newId = uid('t');
  await q(`insert into tenants (${TENANT_COLS.join(',')},id) values (${TENANT_COLS.map((_, i) => '$' + (i + 1)).join(',')},$${TENANT_COLS.length + 1})`, [...v, newId]);
  const nf = await attachFrom(fd, 'tenant', newId, u, `/tenants/${newId}`);
  await log(u, 'إضافة مستأجر', 'tenant', newId, name!); done(`/tenants/${newId}`, 'تمت إضافة المستأجر' + (nf ? ` مع ${nf} ملف` : ''));
}

// ---------- العقود ----------
const CX = ['trade_name', 'usage', 'signed_on', 'ejar_property_id', 'broker', 'deposit', 'deposit_status', 'vat_rate', 'escalation_pct', 'ejar_fees', 'brokerage', 'utilities', 'notice_days'] as const;
const CX_NUM = new Set(['deposit', 'vat_rate', 'escalation_pct', 'ejar_fees', 'brokerage', 'notice_days']);
function contractExtras(fd: FormData, path: string) {
  const vals = CX.map((k) => (CX_NUM.has(k) ? n(fd, k) : s(fd, k)));
  if (vals.some((x) => Number.isNaN(x))) back(path, 'تحقق من القيم الرقمية في بيانات العقد');
  const vat = n(fd, 'vat_rate'), esc = n(fd, 'escalation_pct');
  if (vat != null && (vat < 0 || vat > 30)) back(path, 'نسبة الضريبة بين 0 و30');
  if (esc != null && (esc < 0 || esc > 50)) back(path, 'نسبة الزيادة السنوية بين 0 و50');
  if (s(fd, 'signed_on') && !isDate(s(fd, 'signed_on'))) back(path, 'تاريخ التوقيع غير صحيح');
  return [...vals, !!fd.get('auto_renew')];
}
const CX_SQL = [...CX, 'auto_renew'];
async function insertSchedule(t: Q, cid: string, start: string, end: string, rent: number, freq: Frequency, fromNo = 1, opt: { escalation?: number | null; vat?: number | null } = {}) {
  for (const i of buildSchedule(start, end, rent, freq, opt))
    await t('insert into installments (id,contract_id,no,period_from,period_to,due_date,amount) values ($1,$2,$3,$4,$5,$6,$7)',
      [uid('i'), cid, i.no + fromNo - 1, i.period_from, i.period_to, i.due_date, i.amount]);
}
export async function createContract(fd: FormData) {
  const u = await requireAction('accountant');
  const unit = s(fd, 'unit_id'), tenant = s(fd, 'tenant_id'), start = s(fd, 'start_date'), end = s(fd, 'end_date');
  const rent = n(fd, 'annual_rent'), freq = s(fd, 'frequency') as Frequency;
  const path = '/contracts/new';
  if (!unit || !tenant) back(path, 'اختر الوحدة والمستأجر');
  if (!isDate(start) || !isDate(end) || end! <= start!) back(path, 'تحقق من تاريخي البداية والنهاية');
  if (rent == null || Number.isNaN(rent) || rent < 0) back(path, 'أدخل قيمة الإيجار السنوي');
  const [un] = await q('select property_id from units where id=$1', [unit]);
  const [busy] = await q(`select id from contracts where unit_id=$1 and status='active' and start_date<=$3 and end_date>=$2`, [unit, start, end]);
  if (busy) back(path, 'يوجد عقد ساري على هذه الوحدة في نفس الفترة');
  const cno = s(fd, 'contract_no'); if (cno) { const [dup] = await q('select 1 from contracts where contract_no=$1', [cno]); if (dup) back(path, 'رقم عقد إيجار مسجل لعقد آخر'); }
  const extras = contractExtras(fd, path);
  const id = uid('c');
  await tx(async (t) => {
    await t(`insert into contracts (id,property_id,unit_id,tenant_id,start_date,end_date,annual_rent,frequency,status,contract_no,notes,${CX_SQL.join(',')}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,${CX_SQL.map((_, i) => '$' + (i + 12)).join(',')})`,
      [id, un.property_id, unit, tenant, start, end, rent, freq, 'active', s(fd, 'contract_no'), s(fd, 'notes') ?? '', ...extras]);
    if (freq !== 'special') await insertSchedule(t, id, start!, end!, rent!, freq, 1, { escalation: n(fd, 'escalation_pct'), vat: n(fd, 'vat_rate') });
  });
  const nf = await attachFrom(fd, 'contract', id, u, `/contracts/${id}`);
  await log(u, 'إضافة عقد', 'contract', id, `إيجار ${money(rent!)}`); done(`/contracts/${id}`, 'تم إنشاء العقد وجدول أقساطه' + (nf ? ` مع ${nf} ملف` : ''));
}
export async function updateContract(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!, path = `/contracts/${id}`;
  const cno = s(fd, 'contract_no');
  const [cur] = await q('select contract_no from contracts where id=$1', [id]);
  // يُمنع إدخال رقم مكرر جديد؛ الرقم المكرر القديم لا يمنع تعديل باقي البيانات (يظهر في التدقيق)
  if (cno && cno !== cur?.contract_no) { const [dup] = await q('select 1 from contracts where contract_no=$1 and id<>$2', [cno, id]); if (dup) back(path, 'رقم عقد إيجار مسجل لعقد آخر'); }
  const extras = contractExtras(fd, path);
  const prev = s(fd, 'renewed_from'); if (prev === id) back(path, 'لا يمكن ربط العقد بنفسه');
  const [cb] = await q('select * from contracts where id=$1', [id]);
  await trackChanges(q, u, 'contract', id, cb, { contract_no: cno, notes: s(fd, 'notes') ?? '', renewed_from: prev, ...Object.fromEntries(CX_SQL.map((k, i) => [k, extras[i]])) }, LABELS);
  await q(`update contracts set contract_no=$1, notes=$2, renewed_from=$3, ${CX_SQL.map((k, i) => `${k}=$${i + 4}`).join(',')} where id=$${CX_SQL.length + 4}`,
    [cno, s(fd, 'notes') ?? '', prev, ...extras, id]);
  const nf = await attachFrom(fd, 'contract', id, u, path);
  await log(u, 'تعديل بيانات عقد', 'contract', id); done(path, 'تم حفظ بيانات العقد' + (nf ? ` وإرفاق ${nf} ملف` : ''));
}
/** تعديل فترة العقد وقيمته؛ يعيد توليد الأقساط غير المسددة اللاحقة فقط. */
export async function rescheduleContract(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!, path = `/contracts/${id}`;
  const end = s(fd, 'end_date'), rent = n(fd, 'annual_rent'), freq = s(fd, 'frequency') as Frequency, from = s(fd, 'from_date');
  if (!isDate(end) || !isDate(from) || rent == null || Number.isNaN(rent) || rent < 0) back(path, 'أكمل تاريخ النهاية والإيجار وتاريخ بدء التطبيق');
  const [c] = await q('select * from contracts where id=$1', [id]);
  if (end! <= c.start_date) back(path, 'تاريخ النهاية قبل بداية العقد');
  await trackChanges(q, u, 'contract', id, c, { end_date: end, annual_rent: rent, frequency: freq }, LABELS);
  await tx(async (t) => {
    await t(`delete from installments i where contract_id=$1 and due_date>=$2 and opening_paid=0
      and not exists (select 1 from payment_allocations a where a.installment_id=i.id)
      and not exists (select 1 from adjustments d where d.installment_id=i.id)`, [id, from]);
    await t('update contracts set end_date=$1, annual_rent=$2, frequency=$3 where id=$4', [end, rent, freq, id]);
  });
  await fillSchedule(id);
  await log(u, 'تعديل فترة/قيمة عقد', 'contract', id, `حتى ${end} بإيجار ${money(rent!)}`); done(path, 'تم تعديل العقد وإعادة توليد الأقساط اللاحقة غير المسددة');
}
async function fillSchedule(id: string) {
  const { missingSchedule } = await import('./calc');
  const [c] = await q('select * from contracts where id=$1', [id]);
  const ex = await q('select no, period_to, due_date, kind from installments where contract_id=$1', [id]);
  const miss = missingSchedule(c as any, ex as any);
  for (const i of miss) await q('insert into installments (id,contract_id,no,period_from,period_to,due_date,amount,note) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [uid('i'), id, i.no, i.period_from, i.period_to, i.due_date, i.amount, 'مولّد آلياً لاستكمال جدول العقد']);
  return miss;
}
export async function completeSchedule(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!;
  const miss = await fillSchedule(id);
  if (!miss.length) back(`/contracts/${id}`, 'جدول الأقساط مكتمل حتى نهاية العقد');
  await log(u, 'استكمال جدول أقساط', 'contract', id, `${miss.length} أقساط بقيمة ${money(miss.reduce((x, i) => x + i.amount, 0))}`);
  done(`/contracts/${id}`, `أضيف ${miss.length} أقساط حتى نهاية العقد`);
}
export async function completeAllSchedules() {
  const u = await requireAction('admin');
  const cs = await q(`select id from contracts where status='active'`);
  let n = 0, amt = 0;
  for (const c of cs) { const m = await fillSchedule(c.id); n += m.length; amt += m.reduce((x, i) => x + i.amount, 0); }
  await log(u, 'استكمال جداول الأقساط', 'contract', undefined, `${n} أقساط بقيمة ${money(amt)}`);
  done('/contracts', n ? `أضيف ${n} أقساط بقيمة ${money(amt)} ريال لاستكمال جداول العقود السارية` : 'كل جداول العقود السارية مكتملة');
}
export async function terminateContract(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!, d = s(fd, 'date'), reason = s(fd, 'reason');
  if (!isDate(d)) back(`/contracts/${id}`, 'أدخل تاريخ الإنهاء');
  await tx(async (t) => {
    await t(`update contracts set status='terminated', end_date=$1, notes=trim(notes||' '||$2) where id=$3`, [d, 'إنهاء: ' + (reason ?? ''), id]);
    await t(`delete from installments i where contract_id=$1 and due_date>$2 and opening_paid=0
      and not exists (select 1 from payment_allocations a where a.installment_id=i.id)`, [id, d]);
  });
  await log(u, 'إنهاء عقد', 'contract', id, reason ?? ''); done(`/contracts/${id}`, 'تم إنهاء العقد وحذف الأقساط اللاحقة غير المسددة');
}
export async function renewContract(fd: FormData) {
  const u = await requireAction('accountant'); const old = s(fd, 'id')!;
  const start = s(fd, 'start_date'), end = s(fd, 'end_date'), rent = n(fd, 'annual_rent'), freq = s(fd, 'frequency') as Frequency;
  if (!isDate(start) || !isDate(end) || end! <= start!) back(`/contracts/${old}/renew`, 'تحقق من التواريخ');
  if (rent == null || Number.isNaN(rent)) back(`/contracts/${old}/renew`, 'أدخل الإيجار السنوي');
  const [c] = await q('select * from contracts where id=$1', [old]);
  const extras = contractExtras(fd, `/contracts/${old}/renew`);
  const cno = s(fd, 'contract_no'); if (cno) { const [dup] = await q('select 1 from contracts where contract_no=$1', [cno]); if (dup) back(`/contracts/${old}/renew`, 'رقم عقد إيجار مسجل لعقد آخر'); }
  const id = uid('c');
  await tx(async (t) => {
    await t(`update contracts set status='renewed' where id=$1`, [old]);
    await t(`insert into contracts (id,property_id,unit_id,tenant_id,start_date,end_date,annual_rent,frequency,status,contract_no,renewed_from,notes,${CX_SQL.join(',')}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,${CX_SQL.map((_, i) => '$' + (i + 13)).join(',')})`,
      [id, c.property_id, c.unit_id, c.tenant_id, start, end, rent, freq, 'active', s(fd, 'contract_no'), old, s(fd, 'notes') ?? '', ...extras]);
    if (freq !== 'special') await insertSchedule(t, id, start!, end!, rent!, freq, 1, { escalation: n(fd, 'escalation_pct'), vat: n(fd, 'vat_rate') });
  });
  const nf = await attachFrom(fd, 'contract', id, u, `/contracts/${id}`);
  await log(u, 'تجديد عقد', 'contract', id, `من العقد ${old} بإيجار ${money(rent!)}`); done(`/contracts/${id}`, 'تم تجديد العقد' + (nf ? ` مع ${nf} ملف` : ''));
}

// ---------- الأقساط ----------
export async function addInstallment(fd: FormData) {
  const u = await requireAction('accountant'); const cid = s(fd, 'contract_id')!, due = s(fd, 'due_date'), amt = n(fd, 'amount');
  if (!isDate(due) || !amt || Number.isNaN(amt)) back(`/contracts/${cid}`, 'أدخل تاريخ الاستحقاق والمبلغ');
  const [{ m }] = await q('select coalesce(max(no),0)::int m from installments where contract_id=$1', [cid]);
  await q('insert into installments (id,contract_id,no,period_from,period_to,due_date,amount,note) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [uid('i'), cid, m + 1, s(fd, 'period_from'), s(fd, 'period_to'), due, amt, s(fd, 'note') ?? '']);
  await log(u, 'إضافة قسط', 'contract', cid, money(amt!)); done(`/contracts/${cid}`, 'تمت إضافة القسط');
}
export async function updateInstallment(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!, due = s(fd, 'due_date'), amt = n(fd, 'amount');
  if (!isDate(due) || amt == null || Number.isNaN(amt)) back(`/installments/${id}`, 'تحقق من التاريخ والمبلغ');
  const [ib] = await q('select * from installments where id=$1', [id]);
  await trackChanges(q, u, 'installment', id, ib, { due_date: due, amount: amt, note: s(fd, 'note') ?? '' }, LABELS);
  await q('update installments set due_date=$1, amount=$2, note=$3 where id=$4', [due, amt, s(fd, 'note') ?? '', id]);
  await log(u, 'تعديل قسط', 'installment', id, money(amt!)); done(`/installments/${id}`, 'تم حفظ القسط');
}
export async function confirmInstallment(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!, kind = s(fd, 'kind');
  const [i] = await q('select * from installments where id=$1', [id]);
  if (kind === 'paid') {
    const ref = [s(fd, 'bank_date') && `إيداع ${s(fd, 'bank_date')}`, s(fd, 'bank_ref') && `مرجع ${s(fd, 'bank_ref')}`, s(fd, 'receipt') && `سند ${s(fd, 'receipt')}`].filter(Boolean).join(' • ');
    await q(`update installments set opening_paid=amount, needs_confirmation=false, note=$1 where id=$2`, ['ثبت سداده بالمطابقة مع البنك' + (ref ? ': ' + ref : ''), id]);
    await log(u, 'تأكيد سداد قسط', 'installment', id, `${money(i.amount)} ${ref}`); done(`/installments/${id}`, 'تم تأكيد سداد القسط');
  }
  await q(`update installments set needs_confirmation=false, note=$1 where id=$2`, ['لم يثبت سداده بالمطابقة مع البنك', id]);
  await log(u, 'قسط لم يثبت سداده', 'installment', id, money(i.amount)); done(`/installments/${id}`, 'تحوّل القسط إلى المتأخرات');
}
export async function deleteInstallment(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!;
  const [i] = await q('select contract_id, opening_paid from installments where id=$1', [id]);
  const [a] = await q('select 1 from payment_allocations where installment_id=$1', [id]);
  if (a || Number(i.opening_paid) > 0) back(`/installments/${id}`, 'لا يمكن حذف قسط عليه مدفوعات');
  await q('delete from installments where id=$1', [id]); await log(u, 'حذف قسط', 'installment', id); done(`/contracts/${i.contract_id}`, 'تم حذف القسط');
}

// ---------- المقبوضات ----------
export async function recordPayment(fd: FormData) {
  const u = await requireAction('accountant');
  const tenant = s(fd, 'tenant_id'), contract = s(fd, 'contract_id'), first = s(fd, 'installment_id'), date = s(fd, 'paid_on'), amt = n(fd, 'amount'), method = s(fd, 'method');
  const path = `/payments/new?tenant=${encodeURIComponent(tenant ?? '')}${contract ? '&contract=' + encodeURIComponent(contract) : ''}${first ? '&inst=' + encodeURIComponent(first) : ''}`;
  if (!tenant || !contract) back(path, 'اختر المستأجر والعقد');
  if (!isDate(date) || date! > todayRiyadh()) back(path, 'تاريخ السداد غير صحيح');
  if (!amt || Number.isNaN(amt) || amt <= 0) back(path, 'أدخل مبلغاً صحيحاً');
  if (Math.abs(amt! * 100 - Math.round(amt! * 100)) > 0.000001) back(path, 'المبلغ يقبل منزلتين عشريتين فقط');
  if (!method || !METHODS.includes(method)) back(path, 'اختر طريقة السداد');
  if (method !== 'نقدي' && !s(fd, 'bank_ref')) back(path, 'أدخل رقم الحوالة/المرجع لغير النقدي');
  await assertOpenPeriod(date, path);
  const id = uid('pay');
  const receipt = await tx(async (t) => {
    const [owner] = await t('select tenant_id from contracts where id=$1 for update', [contract]);
    if (!owner || owner.tenant_id !== tenant) throw new Error('العقد لا يخص المستأجر المختار');
    const bals = (await openBalances(t, contract!)).filter((r) => Number(r.bal) > 0);
    if (first && !bals.some((r) => r.id === first)) throw new Error('القسط المختار غير متاح للسداد؛ حدّث الصفحة وراجع الأرصدة');
    const plan = planPayment(bals.map((r) => ({ id: r.id, no: Number(r.no), due_date: String(r.due_date), balance: Number(r.bal) })), amt!, first ?? undefined);
    if (plan.excess > 0) throw new Error(`المبلغ أكبر من الرصيد المتبقي على العقد (${money(plan.total)})`);
    const [st] = await t(`update settings set value=(value::int+1)::text where key='receipt_seq' returning value`);
    const [pf] = await t(`select value from settings where key='receipt_prefix'`);
    const rno = `${pf?.value ?? 'R'}-${date!.slice(0, 4)}-${String(st.value).padStart(4, '0')}`;
    await t('insert into payments (id,receipt_no,tenant_id,contract_id,paid_on,amount,method,bank_ref,note,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, rno, tenant, contract, date, amt, method, s(fd, 'bank_ref'), s(fd, 'note'), u.full_name]);
    for (const b of plan.allocations) {
      await t('insert into payment_allocations (payment_id,installment_id,amount) values ($1,$2,$3)', [id, b.id, b.amount]); }
    return rno;
  }).catch((e: Error) => back(path, e.message));
  const files = fd.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length) { try { await saveFiles('payment', id, files, u, 'إشعار الحوالة'); } catch (e: any) { done(`/payments/${id}`, `سُجّل السند لكن تعذّر إرفاق الملف: ${e.message}`); } }
  await log(u, 'تسجيل مقبوضات', 'payment', id, `${receipt} — ${money(amt!)}`);
  done(`/payments/${id}`, `تم تسجيل السند ${receipt}`);
}
export async function voidPayment(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!, reason = s(fd, 'reason');
  if (!reason) back(`/payments/${id}`, 'سبب الإلغاء مطلوب');
  const [pp] = await q('select paid_on, created_by from payments where id=$1', [id]); await assertOpenPeriod(pp?.paid_on, `/payments/${id}`);
  try { const f = JSON.parse((await q(`select value from settings where key='features'`))[0]?.value || '{}'); if (f.maker_checker && pp?.created_by === u.full_name) back(`/payments/${id}`, 'الرقابة المزدوجة مفعّلة: لا يلغي السند من سجّله؛ يلزم مستخدم آخر'); } catch (e: any) { if (String(e?.digest ?? '').startsWith('NEXT_REDIRECT')) throw e; }
  await q(`update bank_lines set status='open', payment_id=null where payment_id=$1`, [id]);
  await trackChanges(q, u, 'payment', id, { voided: false, void_reason: null }, { voided: true, void_reason: reason }, LABELS);
  await q('update payments set voided=true, void_reason=$1 where id=$2', [reason, id]);
  await log(u, 'إلغاء سند قبض', 'payment', id, reason!); done(`/payments/${id}`, 'تم إلغاء السند وإرجاع الأقساط لرصيدها');
}

// ---------- الخصومات والمتابعة ----------
export async function addAdjustment(fd: FormData) {
  const u = await requireAction('accountant'); const iid = s(fd, 'installment_id')!, amt = n(fd, 'amount'), type = s(fd, 'type');
  if (!amt || Number.isNaN(amt) || amt <= 0 || !type) back(`/installments/${iid}`, 'أدخل نوع الخصم ومبلغه');
  const [i] = await q('select i.*, c.tenant_id, c.property_id from installments i join contracts c on c.id=i.contract_id where i.id=$1', [iid]);
  await assertOpenPeriod(todayRiyadh(), `/installments/${iid}`);
  await q(`insert into adjustments (id,tenant_id,property_id,contract_id,installment_id,installment_no,type,amount,decision_no,date,note,created_by,requested_by,status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,'pending')`,
    [uid('a'), i.tenant_id, i.property_id, i.contract_id, iid, i.no, type, amt, s(fd, 'decision_no'), todayRiyadh(), [s(fd, 'approved_by') && 'الجهة المقترحة للاعتماد: ' + s(fd, 'approved_by'), s(fd, 'note')].filter(Boolean).join(' • ') || null, u.full_name]);
  await log(u, 'طلب خصم/إعفاء', 'installment', iid, `${type} ${money(amt!)}`); done(`/installments/${iid}`, 'أُرسل طلب الخصم للاعتماد؛ لا يؤثر في الرصيد قبل اعتماده');
}
export async function addFollowUp(fd: FormData) {
  const u = await requireAction('accountant'); const tid = s(fd, 'tenant_id')!, d = s(fd, 'date'), type = s(fd, 'type');
  if (!isDate(d) || !type) back(`/tenants/${tid}`, 'أدخل تاريخ المتابعة ونوعها');
  await q('insert into followups (id,tenant_id,date,type,details,next_date,created_by) values ($1,$2,$3,$4,$5,$6,$7)',
    [uid('f'), tid, d, type, s(fd, 'details'), s(fd, 'next_date'), u.full_name]);
  await log(u, 'متابعة مستأجر', 'tenant', tid, type!); done(`/tenants/${tid}`, 'تم تسجيل المتابعة');
}

// ---------- المصروفات ----------
export async function saveExpense(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id'), pid = s(fd, 'property_id'), d = s(fd, 'date'), amt = n(fd, 'amount'), cat = s(fd, 'category');
  const path = id ? `/expenses/${id}` : '/expenses/new';
  if (!pid || !isDate(d) || !cat || !amt || Number.isNaN(amt) || amt <= 0) back(path, 'أكمل العقار والتاريخ والبند والمبلغ');
  await assertOpenPeriod(d, path);
  const v = [pid, d, cat, amt, s(fd, 'vendor'), s(fd, 'ref'), s(fd, 'description')];
  if (id) { const [eb] = await q('select * from expenses where id=$1', [id]); await trackChanges(q, u, 'expense', id, eb, { property_id: v[0], date: v[1], category: v[2], amount: v[3], vendor: v[4], ref: v[5], description: v[6] }, LABELS); }
  if (id) await q('update expenses set property_id=$1,date=$2,category=$3,amount=$4,vendor=$5,ref=$6,description=$7 where id=$8', [...v, id]);
  else await q('insert into expenses (property_id,date,category,amount,vendor,ref,description,id,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [...v, uid('e'), u.full_name]);
  await log(u, id ? 'تعديل مصروف' : 'إضافة مصروف', 'expense', id ?? undefined, `${cat} ${money(amt!)}`); done('/expenses', 'تم حفظ المصروف');
}
export async function deleteExpense(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!;
  await q('delete from expenses where id=$1', [id]); await log(u, 'حذف مصروف', 'expense', id); done('/expenses', 'تم حذف المصروف');
}

// ---------- ملاحظات التدقيق ----------
export async function resolveNote(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!, res = s(fd, 'resolution'), back_ = s(fd, 'back') ?? '/audit';
  if (s(fd, 'reopen')) { await q(`update audit_notes set status='open', resolution=null, resolved_by=null, resolved_at=null where id=$1`, [id]); await log(u, 'إعادة فتح ملاحظة', 'note', id); done(back_, 'أُعيد فتح الملاحظة'); }
  if (!res) back(back_, 'اكتب الإجراء المتخذ لإغلاق الملاحظة');
  await q(`update audit_notes set status='resolved', resolution=$1, resolved_by=$2, resolved_at=now() where id=$3`, [res, u.full_name, id]);
  await log(u, 'إغلاق ملاحظة تدقيق', 'note', id, res!); done(back_, 'تم إغلاق الملاحظة');
}

// ---------- الإعدادات والمستخدمون ----------
export async function saveSettings(fd: FormData) {
  const u = await requireAction('admin');
  const grace = n(fd, 'grace_days');
  if (grace == null || Number.isNaN(grace) || grace < 0 || grace > 60) back('/settings', 'مهلة السداد بين 0 و60 يوماً');
  for (const k of ['org', 'receipt_prefix']) { const v = s(fd, k); if (v) await q('update settings set value=$1 where key=$2', [v, k]); }
  await q(`update settings set value=$1 where key='grace_days'`, [String(grace)]);
  await log(u, 'تعديل الإعدادات'); done('/settings', 'تم حفظ الإعدادات');
}
export async function saveUser(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id'), username = s(fd, 'username')?.toLowerCase(), name = s(fd, 'full_name'), role = s(fd, 'role'), pass = s(fd, 'password');
  if (!username || !/^[a-z0-9._-]{3,30}$/.test(username) || !name || !role) back('/settings/users', 'اسم المستخدم (حروف إنجليزية وأرقام) والاسم والصلاحية مطلوبة');
  if (!id && (!pass || pass.length < 8)) back('/settings/users', 'كلمة المرور المؤقتة 8 أحرف على الأقل');
  if (id) {
    if (id === u.id && (role !== 'admin' || !fd.get('active'))) back('/settings/users', 'لا يمكنك إزالة صلاحية المدير عن حسابك');
    await q('update users set full_name=$1, role=$2, active=$3 where id=$4', [name, role, !!fd.get('active'), id]);
    if (pass) { if (pass.length < 8) back('/settings/users', 'كلمة المرور 8 أحرف على الأقل'); await q('update users set pass_hash=$1, must_change=true where id=$2', [hashPassword(pass), id]); }
  } else {
    const [ex] = await q('select 1 from users where lower(username)=$1', [username]);
    if (ex) back('/settings/users', 'اسم المستخدم مستخدم من قبل');
    if (MULTI && currentOrg() !== MAIN) {
      const [o] = await pq('select max_users from orgs where slug=$1', [currentOrg()]); const [{ n }] = await q('select count(*)::int as n from users where active');
      if (o && n >= o.max_users) back('/settings/users', `وصلت للحد الأقصى للمستخدمين في باقتكم (${o.max_users}). تواصل مع مزود الخدمة لزيادته`);
    }
    await q('insert into users (id,username,full_name,role,pass_hash,must_change) values ($1,$2,$3,$4,$5,true)', [uid('u'), username, name, role, hashPassword(pass!)]);
  }
  await log(u, id ? 'تعديل مستخدم' : 'إضافة مستخدم', 'user', id ?? undefined, `${username} (${role})`); done('/settings/users', 'تم حفظ المستخدم');
}
