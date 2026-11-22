'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx, uid } from './db';
import { requireAction, log } from './auth';
import { todayRiyadh } from './data';
import { assertOpenPeriod, saveFiles } from './guard';
import { trackChanges, LABELS } from './changes';

type Q = (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>;
const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const n = (fd: FormData, k: string) => { const v = s(fd, k); if (v == null) return null; const x = Number(v.replace(/,/g, '')); return Number.isFinite(x) ? x : NaN; };
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
/** المسار قد يحتوي #تبويب؛ تُوضع رسالة النتيجة قبل علامة # ليقرأها البرنامج ويبقى التبويب مفتوحاً */
const withMsg = (path: string, k: string, m: string) => { const [b, h] = path.split('#'); return `${b}${b.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(m)}${h ? '#' + h : ''}`; };
function back(path: string, err: string): never { redirect(withMsg(path, 'err', err)); }
function done(path: string, ok: string): never { revalidatePath('/', 'layout'); redirect(withMsg(path, 'ok', ok)); }
const money = (x: number | null) => (x == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(x));
const ORDER = `order by (val_date is not null), val_date, created_at`;

/** يعيد القيمة الحالية للعقار = آخر سجل تقييم حسب التاريخ */
async function syncCurrent(t: Q, pid: string) {
  const vs = await t(`select * from property_valuations where property_id=$1 ${ORDER}`, [pid]);
  const last = vs[vs.length - 1];
  if (!last) return null;
  await t('update properties set land_value=$2, building_value=$3, value_status=coalesce($4, value_status) where id=$1', [pid, last.land_value, last.building_value, last.basis]);
  return last;
}

export async function addValuation(fd: FormData) {
  const u = await requireAction('admin'); const pid = s(fd, 'property_id')!; const path = `/properties/${pid}?tab=valuation`;
  const kind = s(fd, 'kind') === 'initial' ? 'initial' : 'revaluation';
  const date = s(fd, 'val_date'); const land = n(fd, 'land_value'), bld = n(fd, 'building_value');
  const [p] = await q('select * from properties where id=$1', [pid]); if (!p) back('/properties', 'العقار غير موجود');
  if (kind === 'revaluation' && !isDate(date)) back(path, 'تاريخ إعادة التقييم مطلوب');
  if (date && !isDate(date)) back(path, 'تاريخ غير صحيح');
  if (date && date > todayRiyadh()) back(path, 'لا يمكن تسجيل تقييم بتاريخ مستقبلي');
  if ([land, bld].some((x) => Number.isNaN(x) || (x != null && x < 0))) back(path, 'تحقق من مبالغ التقييم');
  if (land == null && bld == null) back(path, 'أدخل قيمة الأرض أو قيمة المبنى على الأقل');
  if (p.land_basis === 'leased' && land != null) back(path, 'الأرض مستأجرة من الغير فلا تُقيَّم؛ اترك قيمة الأرض فارغة');
  if (p.land_basis === 'land_only' && bld != null) back(path, 'العقار أرض فضاء بدون مبنى؛ اترك قيمة المبنى فارغة');
  if (date) await assertOpenPeriod(date, path);
  const prevL = p.land_value == null ? null : Number(p.land_value), prevB = p.building_value == null ? null : Number(p.building_value);
  // الحقل الفارغ في إعادة التقييم يعني: بدون تغيير
  const newL = p.land_basis === 'leased' ? null : land ?? (kind === 'revaluation' ? prevL : null);
  const newB = p.land_basis === 'land_only' ? null : bld ?? (kind === 'revaluation' ? prevB : null);
  const id = uid('val');
  await tx(async (t) => {
    await t(`insert into property_valuations (id,property_id,kind,val_date,land_value,building_value,prev_land,prev_building,basis,valuer,ref_no,decision_no,note,created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, pid, kind, date, newL, newB, prevL, prevB, s(fd, 'basis'), s(fd, 'valuer'), s(fd, 'ref_no'), s(fd, 'decision_no'), s(fd, 'note'), u.full_name]);
    const last = await syncCurrent(t, pid);
    await trackChanges(t, u, 'property', pid, p, { land_value: last?.land_value ?? null, building_value: last?.building_value ?? null }, LABELS);
  });
  const files = fd.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
  let nf = 0; if (files.length) { try { nf = await saveFiles('valuation', id, files, u, 'تقرير تقييم', null); } catch (e: any) { done(path, `حُفظ التقييم لكن تعذر إرفاق الملفات: ${e.message}`); } }
  const tot = (newL ?? 0) + (newB ?? 0), prevT = (prevL ?? 0) + (prevB ?? 0);
  await log(u, kind === 'initial' ? 'تسجيل قيمة افتتاحية' : 'إعادة تقييم عقار', 'property', pid,
    `${p.name}: ${date ?? 'بدون تاريخ'} — الأرض ${money(newL)} • المبنى ${money(newB)} • الإجمالي ${money(tot)} (السابق ${money(prevT)}، الفرق ${money(tot - prevT)})`);
  done(path, (kind === 'initial' ? 'تم تسجيل القيمة' : 'تم تسجيل إعادة التقييم') + (nf ? ` وإرفاق ${nf} ملف` : ''));
}

/** إلغاء آخر سجل تقييم فقط (لتصحيح خطأ إدخال) مع ذكر السبب */
export async function deleteValuation(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!, reason = s(fd, 'reason');
  const [v] = await q('select * from property_valuations where id=$1', [id]); if (!v) back('/properties', 'السجل غير موجود');
  const path = `/properties/${v.property_id}?tab=valuation`;
  if (!reason) back(path, 'اكتب سبب إلغاء السجل');
  const vs = await q(`select id from property_valuations where property_id=$1 ${ORDER}`, [v.property_id]);
  if (vs[vs.length - 1]?.id !== id) back(path, 'يمكن إلغاء آخر سجل تقييم فقط');
  if (v.val_date) await assertOpenPeriod(String(v.val_date), path);
  await tx(async (t) => {
    const [p] = await t('select * from properties where id=$1', [v.property_id]);
    await t('delete from property_valuations where id=$1', [id]);
    const last = await syncCurrent(t, v.property_id);
    if (!last) await t('update properties set land_value=null, building_value=null where id=$1', [v.property_id]);
    await trackChanges(t, u, 'property', v.property_id, p, { land_value: last?.land_value ?? null, building_value: last?.building_value ?? null }, LABELS);
  });
  await q(`delete from attachments where entity='valuation' and entity_id=$1`, [id]);
  await log(u, 'إلغاء سجل تقييم', 'property', v.property_id, `${v.val_date ?? 'بدون تاريخ'} — الأرض ${money(v.land_value)} • المبنى ${money(v.building_value)} — السبب: ${reason}`);
  done(path, 'تم إلغاء سجل التقييم وإرجاع القيمة السابقة');
}

export async function saveLandBasis(fd: FormData) {
  const u = await requireAction('admin'); const pid = s(fd, 'property_id')!; const path = `/properties/${pid}?tab=valuation`;
  const basis = s(fd, 'land_basis'); if (!['owned', 'leased', 'land_only'].includes(basis ?? '')) back(path, 'اختر وضع الأرض');
  const la = n(fd, 'land_area'), ba = n(fd, 'building_area');
  if ([la, ba].some((x) => Number.isNaN(x) || (x != null && x < 0))) back(path, 'تحقق من المساحات');
  const [p] = await q('select * from properties where id=$1', [pid]);
  await trackChanges(q, u, 'property', pid, p, { land_basis: basis, land_area: la, building_area: ba }, LABELS);
  await q('update properties set land_basis=$2, land_area=$3, building_area=$4 where id=$1', [pid, basis, la, ba]);
  await log(u, 'تعديل وضع الأرض والمساحات', 'property', pid, p?.name);
  done(path, 'تم الحفظ');
}

// ---------- البيانات المؤقتة ----------
export async function confirmPropertyData(fd: FormData) {
  const u = await requireAction('admin'); const pid = s(fd, 'property_id')!;
  const [p] = await q('select * from properties where id=$1', [pid]); if (!p) back('/properties', 'العقار غير موجود');
  await q(`update properties set data_status='confirmed' where id=$1`, [pid]);
  await log(u, 'اعتماد بيانات عقار', 'property', pid, `${p.name}: تحويل البيانات من «مؤقتة» إلى «معتمدة»`);
  done(`/properties/${pid}`, 'تم اعتماد بيانات العقار');
}

export async function deleteProvisionalProperty(fd: FormData) {
  const u = await requireAction('admin'); const pid = s(fd, 'property_id')!; const path = `/properties/${pid}`;
  const [p] = await q('select * from properties where id=$1', [pid]); if (!p) back('/properties', 'العقار غير موجود');
  if (p.data_status !== 'provisional') back(path, 'يمكن حذف العقارات ذات البيانات المؤقتة فقط');
  if (s(fd, 'confirm') !== p.short) back(path, `للتأكيد اكتب اسم العقار المختصر كما هو: ${p.short}`);
  const [{ pays }] = await q(`select count(*)::int pays from payments where not voided and contract_id in (select id from contracts where property_id=$1)`, [pid]);
  const [{ other }] = await q(`select (select count(*) from expenses where property_id=$1) + (select count(*) from maintenance where property_id=$1)
    + (select count(*) from adjustments where property_id=$1 or contract_id in (select id from contracts where property_id=$1)) as other`, [pid]);
  if (pays > 0) back(path, `سُجّل على عقود هذا العقار ${pays} سند قبض؛ لا يمكن حذفه. اعتمد البيانات أو عدّلها`);
  if (Number(other) > 0) back(path, 'على العقار مصروفات أو صيانة أو خصومات مسجلة؛ لا يمكن حذفه');
  const tenants = (await q('select distinct tenant_id from contracts where property_id=$1', [pid])).map((r) => r.tenant_id);
  await tx(async (t) => {
    const cids = (await t('select id from contracts where property_id=$1', [pid])).map((r) => r.id);
    const uids = (await t('select id from units where property_id=$1', [pid])).map((r) => r.id);
    await t(`delete from attachments where (entity='property' and entity_id=$1) or (entity='contract' and entity_id = any($2)) or (entity='unit' and entity_id = any($3))
      or (entity='valuation' and entity_id in (select id from property_valuations where property_id=$1))`, [pid, cids, uids]);
    await t('update ejar_installments set contract_id=null where contract_id = any($1)', [cids]);
    await t('delete from contracts where property_id=$1', [pid]);
    await t('delete from properties where id=$1', [pid]);
    for (const tid of tenants) {
      const [{ c }] = await t(`select (select count(*) from contracts where tenant_id=$1) + (select count(*) from payments where tenant_id=$1)
        + (select count(*) from followups where tenant_id=$1) + (select count(*) from adjustments where tenant_id=$1) as c`, [tid]);
      if (Number(c) === 0) { await t(`delete from attachments where entity='tenant' and entity_id=$1`, [tid]); await t('delete from tenants where id=$1', [tid]); }
    }
  });
  await log(u, 'حذف عقار مؤقت', 'property', pid, `${p.name} — حُذف العقار وعقوده ووحداته (بيانات مؤقتة لم تُعتمد)`);
  done('/properties', `تم حذف «${p.name}» وبياناته المؤقتة`);
}
