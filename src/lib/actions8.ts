'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx, uid } from './db';
import { requireUser, log } from './auth';
import { loadDB, todayRiyadh } from './data';
import { saveFiles } from './guard';
import { buildPlan, genSchedule, LABELS, type Plan } from './importer';
import { normalizeSearch } from './table-view';
import { trackChanges } from './changes';
import type { Frequency } from './types';

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
function back(path: string, err: string): never { redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(err)}`); }
function done(path: string, ok: string): never { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(ok)}`); }
const N = (v: unknown) => normalizeSearch(String(v ?? '')).replace(/\s+/g, ' ').trim();
const COLS: Record<string, string> = { property: 'properties', unit: 'units', tenant: 'tenants', contract: 'contracts', installment: 'installments' };

export async function uploadImport(fd: FormData) {
  const u = await requireUser('admin');
  const f = fd.get('file'); if (!(f instanceof File) || !f.size) back('/imports', 'اختر ملف إكسل');
  if (!/\.xlsx?$/i.test((f as File).name)) back('/imports', 'الملف يجب أن يكون إكسل (.xlsx)');
  if ((f as File).size > 10 * 1024 * 1024) back('/imports', 'حجم الملف أكبر من 10 م.ب');
  const buf = Buffer.from(await (f as File).arrayBuffer());
  let plan: Plan;
  try { plan = buildPlan(buf, await loadDB(), (s(fd, 'kind') as 'auto' | 'template' | 'legacy') ?? 'auto'); } catch (e: any) { back('/imports', `تعذر قراءة الملف: ${e.message}`); }
  const cnt = (st: string) => plan!.rows.filter((r) => r.status === st).length;
  const [{ n }] = await q('select count(*)::int n from import_batches');
  const id = uid('imp'), no = `IMP-${String(n + 1).padStart(3, '0')}`;
  const summary = JSON.stringify({ new: cnt('new'), update: cnt('update'), same: cnt('same'), error: cnt('error'), kind: plan!.kind });
  await q(`insert into import_batches (id,batch_no,file_name,source_kind,status,summary,payload,created_by) values ($1,$2,$3,$4,'preview',$5,$6,$7)`, [id, no, (f as File).name, plan!.kind, summary, JSON.stringify(plan!), u.full_name]);
  try { await saveFiles('import', id, [f as File], u, 'ملف الاستيراد'); } catch { /* الإكسل قد لا يكون ضمن الأنواع المسموحة للمرفقات */ await q(`insert into attachments (id,entity,entity_id,category,file_name,mime,size,data,created_by) values ($1,'import',$2,'ملف الاستيراد',$3,$4,$5,$6,$7)`, [uid('f'), id, (f as File).name, (f as File).type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', (f as File).size, buf, u.full_name]); }
  await log(u, 'رفع ملف استيراد', 'import', id, `${no} — ${(f as File).name} — جديد ${cnt('new')} • تعديل ${cnt('update')} • أخطاء ${cnt('error')}`);
  done(`/imports/${id}`, `قُرئ الملف: ${cnt('new')} سجل جديد، ${cnt('update')} تعديل، ${cnt('error')} خطأ. راجع المعاينة ثم اعتمد.`);
}

export async function commitImport(fd: FormData) {
  const u = await requireUser('admin'); const id = s(fd, 'id')!; const path = `/imports/${id}`;
  const [b] = await q('select * from import_batches where id=$1', [id]); if (!b) back('/imports', 'الدفعة غير موجودة');
  if (b.status !== 'preview') back(path, 'الدفعة معتمدة أو ملغاة من قبل');
  const plan = JSON.parse(b.payload) as Plan; const today = todayRiyadh();
  const skipNew = new Set(fd.getAll('skip').map(String));
  const stats = { property: 0, unit: 0, tenant: 0, contract: 0, installment: 0, updates: 0, generated: 0 };
  await tx(async (t) => {
    const pId = new Map<string, string>(), uId = new Map<string, string>(), tId = new Map<string, string>(), cId = new Map<string, string>();
    const src = `استيراد ${b.batch_no} (${b.file_name ?? ''})`;
    plan.rows.forEach((r, i) => { if (r.existingId) ({ property: pId, unit: uId, tenant: tId, contract: cId } as Record<string, Map<string, string>>)[r.entity]?.set(r.key, r.existingId); void i; });
    const ok = (i: number) => !skipNew.has(String(i));
    for (const [i, r] of plan.rows.entries()) if (r.entity === 'property' && r.status === 'new' && ok(i)) {
      const nid = uid('p'), d = r.data; pId.set(r.key, nid); pId.set('n:' + N(d.short), nid); pId.set('n:' + N(d.name), nid);
      await t(`insert into properties (id,name,short,type,location,ownership,land_value,building_value,value_status,deed_no,land_basis,data_status,data_source,import_batch) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'provisional',$12,$13)`,
        [nid, d.name, d.short, d.type, d.location, d.ownership, d.land_basis === 'leased' ? null : d.land_value, d.land_basis === 'land_only' ? null : d.building_value, d.land_value || d.building_value ? 'دفترية' : null, d.deed_no, d.land_basis ?? 'owned', src, id]);
      if (d.land_value || d.building_value) await t(`insert into property_valuations (id,property_id,kind,land_value,building_value,basis,note,created_by) values ($1,$2,'initial',$3,$4,'دفترية',$5,$6)`, [uid('val'), nid, d.land_basis === 'leased' ? null : d.land_value, d.land_basis === 'land_only' ? null : d.building_value, src, u.full_name]);
      stats.property++;
    }
    const pOf = (key: string) => pId.get(key) ?? (key.startsWith('p:') ? key.slice(2) : undefined);
    for (const [i, r] of plan.rows.entries()) if (r.entity === 'unit' && r.status === 'new' && ok(i)) {
      const [pk] = r.key.split('|'); const pid = pOf(pk); if (!pid) continue;
      const nid = uid('u'); uId.set(r.key, nid); const d = r.data;
      await t(`insert into units (id,property_id,code,kind,unit_type,floor,rooms,area,monthly_rent,import_batch) values ($1,$2,$3,'lease',$4,$5,$6,$7,$8,$9)`, [nid, pid, d.code, d.unit_type, d.floor, d.rooms, d.area, d.monthly_rent, id]);
      stats.unit++;
    }
    for (const [i, r] of plan.rows.entries()) if (r.entity === 'tenant' && r.status === 'new' && ok(i)) {
      const nid = uid('t'); tId.set(r.key, nid); const d = r.data;
      await t(`insert into tenants (id,name,tenant_type,phone,national_id,cr_no,vat_no,contact_person,notes,import_batch) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [nid, d.name, d.tenant_type, d.phone, d.national_id, d.cr_no, d.vat_no, d.contact_person, src, id]);
      stats.tenant++;
    }
    for (const [i, r] of plan.rows.entries()) if (r.entity === 'contract' && r.status === 'new' && ok(i)) {
      const d = r.data; const parts = r.key.slice(2).split('|'); const uk = parts.slice(0, 2).join('|');
      let unit = uId.get(uk);
      if (!unit && uk.startsWith('p:')) { const [pk, code] = uk.split('|'); unit = (await t('select id, code from units where property_id=$1', [pk.slice(2)])).find((x) => N(x.code) === code)?.id; }
      const [pk] = uk.split('|'); const pid = pOf(pk);
      const tid = tId.get('t:' + N(d.tenant)) ?? (await t('select id, name from tenants')).find((x) => N(x.name) === N(d.tenant))?.id;
      if (!unit || !pid || !tid) continue;
      const nid = uid('c'); cId.set(r.key, nid);
      await t(`insert into contracts (id,property_id,unit_id,tenant_id,start_date,end_date,annual_rent,frequency,status,contract_no,trade_name,notes,import_batch) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [nid, pid, unit, tid, d.start_date, d.end_date, d.annual_rent, d.frequency, d.status, d.contract_no, d.trade_name, src, id]);
      stats.contract++;
      const hasInst = plan.rows.some((x) => x.entity === 'installment' && x.data.contract === r.key && x.status === 'new');
      if (d.gen && !hasInst && d.frequency) {
        for (const sch of genSchedule(d.start_date, d.end_date, Number(d.annual_rent), d.frequency as Frequency)) {
          await t(`insert into installments (id,contract_id,no,period_from,period_to,due_date,amount,opening_paid,needs_confirmation,note,kind,import_batch) values ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,'rent',$10)`,
            [uid('i'), nid, sch.no, sch.period_from, sch.period_to, sch.due_date, sch.amount, d.status === 'active' && sch.due_date <= today, sch.due_date <= today ? 'مولّد من الاستيراد — حالة السداد تحتاج تأكيداً' : '', id]);
          stats.generated++;
        }
      }
    }
    for (const [i, r] of plan.rows.entries()) if (r.entity === 'installment' && r.status === 'new' && ok(i)) {
      const d = r.data; const cid = cId.get(d.contract); if (!cid) continue;
      await t(`insert into installments (id,contract_id,no,period_from,period_to,due_date,amount,opening_paid,needs_confirmation,note,src_receipt,kind,import_batch) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'rent',$12)`,
        [uid('i'), cid, d.no, d.period_from, d.period_to, d.due_date, d.amount, d.opening_paid ?? 0, (d.opening_paid ?? 0) < d.amount && d.due_date <= today, d.note ?? '', d.src_receipt, id]);
      stats.installment++;
    }
    // التعديلات على السجلات الموجودة: الحقول المختارة فقط، مع سجل التغييرات
    for (const [i, r] of plan.rows.entries()) if (r.status === 'update' && r.existingId) {
      const fields = r.diffs.filter((dd) => fd.get(`ap:${i}:${dd.field}`) === '1'); if (!fields.length) continue;
      const table = COLS[r.entity]; const [before] = await t(`select * from ${table} where id=$1`, [r.existingId]); if (!before) continue;
      const after = Object.fromEntries(fields.map((dd) => [dd.field, dd.next]));
      await trackChanges(t, u, r.entity, r.existingId, before, after, LABELS);
      await t(`update ${table} set ${fields.map((dd, k) => `${dd.field}=$${k + 2}`).join(',')} where id=$1`, [r.existingId, ...fields.map((dd) => dd.next)]);
      stats.updates += fields.length;
    }
    await t(`update import_batches set status='committed', committed_by=$2, committed_at=now(), summary=$3 where id=$1`, [id, u.full_name, JSON.stringify({ ...JSON.parse(b.summary || '{}'), committed: stats })]);
  });
  await log(u, 'اعتماد دفعة استيراد', 'import', id, `${b.batch_no}: عقارات ${stats.property} • وحدات ${stats.unit} • مستأجرون ${stats.tenant} • عقود ${stats.contract} • أقساط ${stats.installment + stats.generated} • تعديل ${stats.updates} حقلاً`);
  done(path, `اعتُمدت الدفعة: ${stats.property} عقار، ${stats.unit} وحدة، ${stats.tenant} مستأجر، ${stats.contract} عقد، ${stats.installment + stats.generated} قسط، و${stats.updates} تعديل. البيانات الجديدة «مؤقتة» حتى تعتمدها من صفحة كل عقار.`);
}

export async function revertImport(fd: FormData) {
  const u = await requireUser('admin'); const id = s(fd, 'id')!; const path = `/imports/${id}`;
  const [b] = await q('select * from import_batches where id=$1', [id]); if (!b) back('/imports', 'الدفعة غير موجودة');
  if (b.status === 'preview') { await q(`update import_batches set status='discarded', reverted_by=$2, reverted_at=now() where id=$1`, [id, u.full_name]); await log(u, 'تجاهل دفعة استيراد', 'import', id, b.batch_no); done('/imports', `تم تجاهل الدفعة ${b.batch_no} دون أي تغيير`); }
  if (b.status !== 'committed') back(path, 'الدفعة ملغاة من قبل');
  const [{ pays }] = await q(`select count(*)::int pays from payments where not voided and (contract_id in (select id from contracts where import_batch=$1) or tenant_id in (select id from tenants where import_batch=$1))`, [id]);
  if (pays > 0) back(path, `سُجّل ${pays} سند قبض على بيانات هذه الدفعة؛ لا يمكن التراجع عنها`);
  const [{ other }] = await q(`select (select count(*) from expenses where property_id in (select id from properties where import_batch=$1)) + (select count(*) from maintenance where property_id in (select id from properties where import_batch=$1))
    + (select count(*) from adjustments where contract_id in (select id from contracts where import_batch=$1)) + (select count(*) from invoices where contract_id in (select id from contracts where import_batch=$1)) as other`, [id]);
  if (Number(other) > 0) back(path, 'على بيانات الدفعة مصروفات أو صيانة أو خصومات أو فواتير؛ لا يمكن التراجع عنها');
  await tx(async (t) => {
    await t(`delete from installments where import_batch=$1 or contract_id in (select id from contracts where import_batch=$1)`, [id]);
    await t(`delete from followups where tenant_id in (select id from tenants where import_batch=$1)`, [id]);
    await t(`delete from contracts where import_batch=$1`, [id]);
    await t(`delete from units where import_batch=$1 and not exists (select 1 from contracts c where c.unit_id=units.id)`, [id]);
    await t(`delete from tenants where import_batch=$1 and not exists (select 1 from contracts c where c.tenant_id=tenants.id)`, [id]);
    await t(`delete from properties where import_batch=$1 and not exists (select 1 from contracts c where c.property_id=properties.id) and not exists (select 1 from units x where x.property_id=properties.id and x.import_batch is distinct from $1)`, [id]);
    await t(`update import_batches set status='reverted', reverted_by=$2, reverted_at=now() where id=$1`, [id, u.full_name]);
  });
  await log(u, 'التراجع عن دفعة استيراد', 'import', id, `${b.batch_no} — حُذفت السجلات الجديدة. التعديلات على السجلات القديمة لا تُرجع تلقائياً (موجودة في سجل التغييرات).`);
  done(path, `تم التراجع عن الدفعة ${b.batch_no} وحذف ما أضافته`);
}
