'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx, uid } from './db';
import { requireUser, log } from './auth';
import { addDays, addMonths } from './calc';
import { todayRiyadh } from './data';
import { assertOpenPeriod } from './guard';
import { SCREENS, type Perms } from './perms';
import { trackChanges, LABELS } from './changes';

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const n = (fd: FormData, k: string) => { const v = s(fd, k); if (v == null) return null; const x = Number(v.replace(/,/g, '')); return Number.isFinite(x) ? x : NaN; };
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
function back(path: string, err: string): never { redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(err)}`); }
function done(path: string, ok: string): never { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(ok)}`); }
const money = (x: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(x);
const r2 = (x: number) => Math.round(x * 100) / 100;

// ---------- صلاحيات الشاشات ----------
export async function saveUserPerms(fd: FormData) {
  const u = await requireUser('admin'); const id = s(fd, 'id')!, path = '/settings/users';
  const [target] = await q('select id, role, perms, full_name from users where id=$1', [id]);
  if (!target) back(path, 'المستخدم غير موجود');
  if (s(fd, 'mode') === 'reset') {
    await q(`update users set perms='{}' where id=$1`, [id]);
    await log(u, 'إعادة صلاحيات المستخدم للافتراضي', 'user', id, target.full_name); done(path, `أُعيدت صلاحيات ${target.full_name} لصلاحيات دوره`);
  }
  const screens: Record<string, number> = {};
  for (const sc of SCREENS) { const v = Number(s(fd, 'lv_' + sc.key) ?? 0); screens[sc.key] = [0, 1, 2, 3].includes(v) ? v : 0; }
  if (!Object.values(screens).some((v) => v >= 1)) back(path, 'يجب السماح بشاشة واحدة على الأقل');
  if (id === u.id && (screens.admin ?? 0) < 3) back(path, 'لا يمكنك سحب صلاحية الإدارة من حسابك');
  const perms: Perms = { screens, export: !!fd.get('export') };
  const old = JSON.parse(target.perms || '{}');
  await q('update users set perms=$1 where id=$2', [JSON.stringify(perms), id]);
  const diff = SCREENS.filter((sc) => (old.screens?.[sc.key] ?? '-') !== screens[sc.key]).map((sc) => `${sc.label}: ${screens[sc.key]}`).join('، ');
  await log(u, 'تعديل صلاحيات الشاشات', 'user', id, `${target.full_name} • ${diff || 'بدون تغيير'} • تصدير ${perms.export ? 'مسموح' : 'ممنوع'}`);
  done(path, `تم حفظ صلاحيات ${target.full_name}`);
}

// ---------- بيانات الجهة للخطابات والإشعارات ----------
export async function saveOrgProfile(fd: FormData) {
  const u = await requireUser('admin');
  const vat = s(fd, 'org_vat_no'); if (vat && !/^3\d{13}3$/.test(vat)) back('/settings', 'الرقم الضريبي للجهة 15 رقماً يبدأ وينتهي بـ 3');
  for (const k of ['org_vat_no', 'org_cr', 'org_address', 'org_phone', 'org_signatory'])
    await q('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, s(fd, k) ?? '']);
  await log(u, 'تعديل بيانات الجهة'); done('/settings', 'تم حفظ بيانات الجهة');
}

// ---------- اتفاق جدولة المتأخرات ----------
export async function settleArrears(fd: FormData) {
  const u = await requireUser('admin'); const cid = s(fd, 'contract_id')!, path = `/contracts/${cid}/settle`;
  const ids = fd.getAll('inst').map(String).filter(Boolean);
  const count = n(fd, 'count'), every = n(fd, 'every'), first = s(fd, 'first_due'), decision = s(fd, 'decision_no');
  if (!ids.length) back(path, 'اختر الأقساط المشمولة بالاتفاق');
  if (!count || Number.isNaN(count) || count < 1 || count > 60 || !Number.isInteger(count)) back(path, 'عدد الدفعات بين 1 و60');
  if (!every || ![1, 2, 3, 6].includes(every)) back(path, 'اختر الفاصل بين الدفعات');
  if (!isDate(first)) back(path, 'أدخل تاريخ أول دفعة');
  if (!decision) back(path, 'رقم قرار/اتفاق الجدولة مطلوب');
  await assertOpenPeriod(todayRiyadh(), path);
  const res = await tx(async (t) => {
    const [c] = await t('select * from contracts where id=$1', [cid]);
    if (!c) throw new Error('العقد غير موجود');
    const bals = await t(`select i.id, i.no, round(i.amount - i.opening_paid
        - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id=a.payment_id where a.installment_id=i.id and not p.voided),0)
        - coalesce((select sum(d.amount) from adjustments d where d.installment_id=i.id and d.status='approved'),0), 2) as bal
      from installments i where i.contract_id=$1 and i.id in (${ids.map((_, k) => '$' + (k + 2)).join(',')})`, [cid, ...ids]);
    const open = bals.filter((b) => Number(b.bal) > 0);
    if (open.length !== ids.length) throw new Error('بعض الأقساط المختارة مسددة أو تغيّر رصيدها؛ حدّث الصفحة');
    const total = r2(open.reduce((x, b) => x + Number(b.bal), 0));
    for (const b of open)
      await t(`insert into adjustments (id,tenant_id,property_id,contract_id,installment_id,installment_no,type,amount,approved_by,decision_no,date,note,created_by,requested_by,status,approved_at)
        values ($1,$2,$3,$4,$5,$6,'ترحيل لاتفاق جدولة',$7,$8,$9,$10,$11,$8,$8,'approved',now())`,
        [uid('a'), c.tenant_id, c.property_id, cid, b.id, b.no, Number(b.bal), u.full_name, decision, todayRiyadh(), `رُحّل الرصيد إلى اتفاق الجدولة ${decision}`]);
    const [{ m }] = await t('select coalesce(max(no),0)::int m from installments where contract_id=$1', [cid]);
    const per = Math.floor((total / count!) * 100) / 100;
    for (let k = 0; k < count!; k++) {
      const due = addMonths(first!, k * every!), amt = k === count! - 1 ? r2(total - per * (count! - 1)) : per;
      await t(`insert into installments (id,contract_id,no,period_from,period_to,due_date,amount,note,kind) values ($1,$2,$3,$4,$5,$6,$7,$8,'settlement')`,
        [uid('i'), cid, m + k + 1, due, addDays(addMonths(due, every!), -1), due, amt, `دفعة ${k + 1}/${count} من اتفاق الجدولة ${decision}`]);
    }
    await t('insert into followups (id,tenant_id,date,type,details,next_date,created_by) values ($1,$2,$3,$4,$5,$6,$7)',
      [uid('f'), c.tenant_id, todayRiyadh(), 'اتفاق جدولة', `جدولة ${money(total)} ريال على ${count} دفعات كل ${every} شهر من ${first} • قرار ${decision}${s(fd, 'note') ? ' • ' + s(fd, 'note') : ''}`, first, u.full_name]);
    return { total, n: open.length };
  }).catch((e: Error) => back(path, e.message));
  await log(u, 'اتفاق جدولة متأخرات', 'contract', cid, `${res.n} أقساط بقيمة ${money(res.total)} • ${count} دفعات • قرار ${decision}`);
  done(`/contracts/${cid}`, `تمت جدولة ${money(res.total)} ريال على ${count} دفعات`);
}

// ---------- الإخلاء وتسليم الوحدة وتسوية التأمين ----------
export async function vacateContract(fd: FormData) {
  const u = await requireUser('admin'); const id = s(fd, 'id')!, path = `/contracts/${id}`;
  const d = s(fd, 'vacated_on'), notes = s(fd, 'handover_notes');
  const ded = n(fd, 'deposit_deduction') ?? 0, ref = n(fd, 'deposit_refund') ?? 0;
  if (!isDate(d)) back(path, 'أدخل تاريخ الإخلاء');
  if (Number.isNaN(ded) || Number.isNaN(ref) || ded < 0 || ref < 0) back(path, 'تحقق من مبالغ التأمين');
  if (!notes) back(path, 'اكتب حالة الوحدة عند التسليم (محضر التسليم)');
  const [c] = await q('select * from contracts where id=$1', [id]);
  if (!c || c.status !== 'active') back(path, 'الإخلاء متاح للعقود السارية فقط');
  if (d! < c.start_date) back(path, 'تاريخ الإخلاء قبل بداية العقد');
  const dep = Number(c.deposit ?? 0);
  if (r2(ded + ref) > r2(dep)) back(path, `مجموع المستقطع والمسترد أكبر من مبلغ التأمين (${money(dep)})`);
  const status = d! < c.end_date ? 'terminated' : 'expired';
  const depStatus = !dep ? c.deposit_status : ref >= dep ? 'مسترد' : ded >= dep ? 'مستقطع بالكامل' : 'مستقطع جزئياً';
  await tx(async (t) => {
    await trackChanges(t, u, 'contract', id, c, { status, vacated_on: d, handover_notes: notes, deposit_deduction: ded || null, deposit_refund: ref || null, deposit_status: depStatus }, LABELS);
    await t(`update contracts set status=$1, vacated_on=$2, handover_notes=$3, deposit_deduction=$4, deposit_refund=$5, deposit_status=$6, end_date=least(end_date,$2::date),
      notes=trim(notes||' '||$7) where id=$8`, [status, d, notes, ded || null, ref || null, depStatus, `إخلاء وتسليم في ${d}`, id]);
    await t(`delete from installments i where contract_id=$1 and due_date>$2 and opening_paid=0
      and not exists (select 1 from payment_allocations a where a.installment_id=i.id)
      and not exists (select 1 from adjustments x where x.installment_id=i.id)`, [id, d]);
  });
  await log(u, 'إخلاء وتسليم وحدة', 'contract', id, `${d} • مستقطع ${money(ded)} • مسترد ${money(ref)}`);
  done(`/contracts/${id}/handover`, 'تم تسجيل الإخلاء ومحضر التسليم');
}
