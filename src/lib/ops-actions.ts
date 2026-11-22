'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx, uid } from './db';
import { requireAction, log } from './auth';
import { todayRiyadh } from './data';
import { saveFiles, assertOpenPeriod } from './guard';
import { createDuePM, obligationSchedule, INSPECTION_TEMPLATE, type InspItem } from './ops';

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const n = (fd: FormData, k: string) => { const v = s(fd, k); if (v == null) return null; const x = Number(v.replace(/,/g, '')); return Number.isFinite(x) ? x : NaN; };
const isDate = (v: string | null) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
const go = (path: string, k: 'ok' | 'err', m: string): never => { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(m)}`); };
const files = (fd: FormData, k = 'files') => fd.getAll(k).filter((x): x is File => x instanceof File && x.size > 0);

// ---------- الامتثال ----------
export async function saveLicense(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id'), pid = s(fd, 'property_id'), kind = s(fd, 'kind'); const back = s(fd, 'back') || '/compliance';
  if (!pid || !kind) go(back, 'err', 'العقار ونوع المستند مطلوبان');
  if (!isDate(s(fd, 'issue_date')) || !isDate(s(fd, 'expiry_date'))) go(back, 'err', 'تاريخ غير صحيح');
  const v = [pid, kind, s(fd, 'number'), s(fd, 'issuer'), s(fd, 'issue_date'), s(fd, 'expiry_date'), s(fd, 'notes') ?? ''];
  const lid = id ?? uid('lc');
  if (id) await q('update licenses set property_id=$1,kind=$2,number=$3,issuer=$4,issue_date=$5,expiry_date=$6,notes=$7 where id=$8', [...v, id]);
  else await q('insert into licenses (property_id,kind,number,issuer,issue_date,expiry_date,notes,id,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [...v, lid, u.full_name]);
  if (files(fd).length) await saveFiles('license', lid, files(fd), u, kind, s(fd, 'expiry_date')).catch(() => {});
  await log(u, id ? 'تعديل مستند نظامي' : 'إضافة مستند نظامي', 'license', lid, `${kind} ${s(fd, 'expiry_date') ?? ''}`); go(back, 'ok', 'تم حفظ المستند');
}
export async function deleteLicense(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id'); await q('delete from licenses where id=$1', [id]); await log(u, 'حذف مستند نظامي', 'license', id ?? undefined); go(s(fd, 'back') || '/compliance', 'ok', 'حُذف');
}

// ---------- الموردون ----------
export async function saveVendor(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id'), name = s(fd, 'name'); if (!name) go('/vendors', 'err', 'اسم المورد مطلوب');
  const vat = s(fd, 'vat'); if (vat && !/^3\d{13}3$/.test(vat)) go('/vendors', 'err', 'الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3');
  const v = [name, s(fd, 'trade'), s(fd, 'phone'), s(fd, 'email'), s(fd, 'cr'), vat, s(fd, 'iban'), s(fd, 'contact'), n(fd, 'rating'), s(fd, 'notes') ?? '', s(fd, 'active') !== '0'];
  if (id) await q('update vendors set name=$1,trade=$2,phone=$3,email=$4,cr=$5,vat=$6,iban=$7,contact=$8,rating=$9,notes=$10,active=$11 where id=$12', [...v, id]);
  else await q('insert into vendors (name,trade,phone,email,cr,vat,iban,contact,rating,notes,active,id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [...v, uid('vd')]);
  await log(u, id ? 'تعديل مورد' : 'إضافة مورد', 'vendor', id ?? undefined, name!); go('/vendors', 'ok', 'تم حفظ المورد');
}

// ---------- أوامر العمل ----------
export async function issueWorkOrder(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!; const vendor = s(fd, 'vendor_id');
  const [m] = await q('select * from maintenance where id=$1', [id]); if (!m) go('/maintenance', 'err', 'الطلب غير موجود');
  if (!vendor && !m.vendor_id) go(`/maintenance/${id}`, 'err', 'اختر المورد لإصدار أمر العمل');
  const [v] = await q('select name from vendors where id=$1', [vendor ?? m.vendor_id]);
  const no = m.wo_no ?? await (async () => { const [r] = await q(`update settings set value=(coalesce(nullif(value,''),'0')::int+1)::text where key='wo_seq' returning value`); return `WO-${todayRiyadh().slice(0, 4)}-${String(r?.value ?? 1).padStart(4, '0')}`; })();
  await q(`update maintenance set vendor_id=$2, vendor=$3, wo_no=$4, wo_issued_on=coalesce(wo_issued_on,$5), est_cost=coalesce($6, est_cost), status=case when status='open' then 'progress' else status end where id=$1`, [id, vendor ?? m.vendor_id, v?.name ?? m.vendor, no, todayRiyadh(), n(fd, 'est_cost')]);
  await log(u, 'إصدار أمر عمل', 'maintenance', id, `${no} — ${v?.name ?? ''}`); go(`/maintenance/${id}/order`, 'ok', `صدر أمر العمل ${no}`);
}

// ---------- الصيانة الدورية ----------
export async function savePmPlan(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id'), pid = s(fd, 'property_id'), title = s(fd, 'title'), due = s(fd, 'next_due');
  if (!pid || !title || !due || !isDate(due)) go('/maintenance/plans', 'err', 'العقار والعنوان وتاريخ أول موعد مطلوبة');
  const every = Math.max(1, Math.min(60, n(fd, 'every_months') ?? 3));
  const v = [pid, s(fd, 'unit_id'), title, s(fd, 'trade'), s(fd, 'vendor_id'), every, due, n(fd, 'est_cost'), s(fd, 'active') !== '0'];
  if (id) await q('update pm_plans set property_id=$1,unit_id=$2,title=$3,trade=$4,vendor_id=$5,every_months=$6,next_due=$7,est_cost=$8,active=$9 where id=$10', [...v, id]);
  else await q('insert into pm_plans (property_id,unit_id,title,trade,vendor_id,every_months,next_due,est_cost,active,id,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [...v, uid('pm'), u.full_name]);
  await log(u, id ? 'تعديل خطة صيانة دورية' : 'خطة صيانة دورية', 'pm', id ?? undefined, `${title} كل ${every} أشهر`); go('/maintenance/plans', 'ok', 'تم حفظ الخطة');
}
export async function runPmNow() {
  const u = await requireAction('accountant'); const c = await createDuePM(u.full_name); await log(u, 'إنشاء طلبات الصيانة الدورية', undefined, undefined, String(c));
  go('/maintenance/plans', 'ok', c ? `أُنشئ ${c} طلب صيانة دورية` : 'لا توجد مواعيد مستحقة خلال أسبوع');
}

// ---------- أصول الوحدة ----------
export async function saveAsset(fd: FormData) {
  const u = await requireAction('accountant'); const unit = s(fd, 'unit_id'), name = s(fd, 'name'); const back = `/units/${unit}?tab=assets`;
  if (!unit || !name) go(back, 'err', 'اسم الأصل مطلوب');
  const id = s(fd, 'id'); const v = [unit, name, Math.max(1, n(fd, 'qty') ?? 1), s(fd, 'brand'), s(fd, 'serial'), s(fd, 'condition') ?? 'جيد', n(fd, 'cost'), s(fd, 'notes') ?? ''];
  if (id) await q('update unit_assets set unit_id=$1,name=$2,qty=$3,brand=$4,serial=$5,condition=$6,cost=$7,notes=$8 where id=$9', [...v, id]);
  else await q('insert into unit_assets (unit_id,name,qty,brand,serial,condition,cost,notes,id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [...v, uid('as')]);
  await log(u, 'أصل في وحدة', 'unit', unit!, name!); go(back, 'ok', 'تم الحفظ');
}
export async function deleteAsset(fd: FormData) { const u = await requireAction('accountant'); const unit = s(fd, 'unit_id'); await q('delete from unit_assets where id=$1', [s(fd, 'id')]); await log(u, 'حذف أصل', 'unit', unit ?? undefined); go(`/units/${unit}?tab=assets`, 'ok', 'حُذف'); }

// ---------- محاضر الفحص ----------
export async function saveInspection(fd: FormData) {
  const u = await requireAction('accountant'); const cid = s(fd, 'contract_id'), unit = s(fd, 'unit_id'), kind = s(fd, 'kind') === 'move_out' ? 'move_out' : 'move_in', date = s(fd, 'date') ?? todayRiyadh();
  if (!unit) go('/contracts', 'err', 'الوحدة غير محددة');
  const count = Number(s(fd, 'count') ?? 0); const items: InspItem[] = [];
  for (let i = 0; i < count && i < 300; i++) { const item = s(fd, `item_${i}`); if (!item) continue; items.push({ area: s(fd, `area_${i}`) ?? '', item, cond: s(fd, `cond_${i}`) ?? 'good', note: s(fd, `note_${i}`) ?? '', cost: Math.max(0, n(fd, `cost_${i}`) ?? 0) }); }
  const id = uid('in');
  await q('insert into inspections (id,contract_id,unit_id,kind,date,items,notes,inspector,tenant_present,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, cid, unit, kind, date, JSON.stringify(items), s(fd, 'notes') ?? '', s(fd, 'inspector') ?? u.full_name, s(fd, 'tenant_present') === '1', u.full_name]);
  if (files(fd).length) await saveFiles('inspection', id, files(fd), u, kind === 'move_in' ? 'صور الاستلام' : 'صور التسليم').catch(() => {});
  await log(u, kind === 'move_in' ? 'محضر فحص عند التسليم للمستأجر' : 'محضر فحص عند الإخلاء', 'inspection', id, `${items.filter((x) => x.cond !== 'good').length} ملاحظة`);
  go(`/inspections/${id}`, 'ok', 'تم حفظ المحضر');
}

// ---------- مستحقات المؤجرين ----------
export async function saveObligation(fd: FormData) {
  const u = await requireAction('accountant'); const pid = s(fd, 'property_id'), landlord = s(fd, 'landlord'), st = s(fd, 'start_date'), en = s(fd, 'end_date'), amt = n(fd, 'annual_amount');
  if (!pid || !landlord || !st || !en || !isDate(st) || !isDate(en) || st > en || !(amt! > 0)) go('/payables', 'err', 'أكمل العقار والمؤجر والمدة والمبلغ السنوي بشكل صحيح');
  const freq = ['monthly', 'quarterly', 'semiannual', 'annual'].includes(s(fd, 'frequency') ?? '') ? s(fd, 'frequency')! : 'annual';
  const id = uid('ob');
  await tx(async (t) => {
    await t('insert into lease_obligations (id,property_id,landlord,contract_no,start_date,end_date,annual_amount,frequency,iban,notes,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id, pid, landlord, s(fd, 'contract_no'), st, en, amt, freq, s(fd, 'iban'), s(fd, 'notes') ?? '', u.full_name]);
    for (const x of obligationSchedule(st!, en!, amt!, freq)) await t('insert into obligation_payments (id,obligation_id,due_date,amount,status) values ($1,$2,$3,$4,$5)', [uid('op'), id, x.due, x.amount, x.due < todayRiyadh() ? 'due' : 'due']);
  });
  await log(u, 'التزام لمؤجر', 'obligation', id, `${landlord} • ${amt} سنوياً`); go('/payables', 'ok', 'أُضيف الالتزام وجدول مدفوعاته');
}
export async function payObligation(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!, d = s(fd, 'paid_on') ?? todayRiyadh(), amt = n(fd, 'amount');
  if (!isDate(d)) go('/payables', 'err', 'تاريخ غير صحيح');
  await assertOpenPeriod(d, '/payables');
  const [p] = await q('select p.*, o.property_id, o.landlord from obligation_payments p join lease_obligations o on o.id=p.obligation_id where p.id=$1', [id]);
  if (!p || p.status === 'paid') go('/payables', 'err', 'الدفعة غير متاحة');
  const paid = amt && amt > 0 ? amt : Number(p.amount); const eid = uid('e');
  await tx(async (t) => {
    await t('insert into expenses (id,property_id,date,category,amount,vendor,ref,description,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [eid, p.property_id, d, 'إيجار أرض (للغير)', paid, p.landlord, s(fd, 'ref'), `دفعة للمؤجر مستحقة ${p.due_date}`, u.full_name]);
    await t(`update obligation_payments set status='paid', paid_on=$2, paid_amount=$3, ref=$4, expense_id=$5, created_by=$6 where id=$1`, [id, d, paid, s(fd, 'ref'), eid, u.full_name]);
  });
  await log(u, 'سداد للمؤجر', 'obligation', p.obligation_id, `${paid} • ${p.landlord}`); go('/payables', 'ok', 'سُجّل السداد وأُضيف للمصروفات');
}
/** قالب بنود محضر الفحص لوحدة: البنود القياسية + أصول الوحدة المسجلة */
export async function inspectionTemplate(unitId: string) {
  const assets = await q('select name, qty from unit_assets where unit_id=$1 order by name', [unitId]);
  return [...INSPECTION_TEMPLATE.flatMap(([a, xs]) => xs.map((x) => ({ area: a, item: x }))), ...assets.map((x) => ({ area: 'أصول الوحدة', item: `${x.name}${x.qty > 1 ? ` (${x.qty})` : ''}` }))];
}
