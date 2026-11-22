'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx, uid } from './db';
import { requireAction, log } from './auth';
import { todayRiyadh, getSettings } from './data';
import { assertOpenPeriod } from './guard';
import { parseFeatures } from './features';
import { VOUCHER_KINDS } from './fmt';

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const n = (fd: FormData, k: string) => { const v = s(fd, k); if (v == null) return null; const x = Number(v.replace(/,/g, '')); return Number.isFinite(x) ? x : NaN; };
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const msg = (path: string, k: string, m: string) => { const [b, h] = path.split('#'); return `${b}${b.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(m)}${h ? '#' + h : ''}`; };
function back(path: string, err: string): never { redirect(msg(path, 'err', err)); }
function done(path: string, ok: string): never { revalidatePath('/', 'layout'); redirect(msg(path, 'ok', ok)); }
const money = (x: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(x);
const feats = async () => parseFeatures((await getSettings()).features);

// ---------- مراجعة سندات القبض (الرقابة المزدوجة) ----------
export async function reviewPayment(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!, back_ = s(fd, 'back') || `/payments/${id}`;
  const [p] = await q('select * from payments where id=$1', [id]); if (!p) back('/payments', 'السند غير موجود');
  if (p.voided) back(back_, 'السند ملغى');
  if (p.reviewed_by) back(back_, 'تمت مراجعة السند من قبل');
  if (p.created_by === u.full_name) back(back_, 'لا يراجع السند من سجّله؛ يلزم مستخدم آخر');
  await q('update payments set reviewed_by=$2, reviewed_at=now() where id=$1', [id, u.full_name]);
  await log(u, 'مراجعة سند قبض', 'payment', id, `${p.receipt_no} — ${money(Number(p.amount))}`);
  done(back_, `تمت مراجعة السند ${p.receipt_no}`);
}
export async function reviewPayments(fd: FormData) {
  const u = await requireAction('accountant'); const ids = String(fd.get('ids') ?? '').split(',').filter(Boolean);
  let ok = 0, skip = 0;
  for (const id of ids.slice(0, 200)) {
    const [p] = await q('select * from payments where id=$1', [id]);
    if (!p || p.voided || p.reviewed_by || p.created_by === u.full_name) { skip++; continue; }
    await q('update payments set reviewed_by=$2, reviewed_at=now() where id=$1', [id, u.full_name]); ok++;
  }
  await log(u, 'مراجعة سندات قبض', 'payment', undefined, `${ok} سنداً${skip ? ` • تُرك ${skip} (سجّلها نفس المستخدم أو مراجعة سابقاً)` : ''}`);
  done('/approvals', `تمت مراجعة ${ok} سنداً${skip ? ` • تُرك ${skip} لا يمكنك مراجعتها` : ''}`);
}

// ---------- إقفال الفترة ----------
export async function closePeriod(fd: FormData) {
  const u = await requireAction('admin'); const until = s(fd, 'until');
  if (!isDate(until) || until! >= todayRiyadh()) back('/approvals', 'تاريخ الإقفال يجب أن يكون قبل اليوم');
  const [cur] = await q(`select value from settings where key='locked_until'`);
  if (cur?.value && until! < cur.value && fd.get('confirm_reopen') !== '1') back('/approvals', `الفترة مقفلة حتى ${cur.value}. لإعادة فتح جزء منها أكّد إعادة الفتح`);
  if (await feats().then((f) => f.maker_checker)) {
    const [{ c }] = await q(`select count(*)::int c from payments where not voided and reviewed_by is null and paid_on <= $1`, [until]);
    if (c > 0) back('/approvals', `يوجد ${c} سند قبض غير مراجع داخل الفترة؛ راجعها قبل الإقفال`);
  }
  await q(`insert into settings values ('locked_until',$1) on conflict (key) do update set value=excluded.value`, [until]);
  await log(u, until! < (cur?.value ?? '') ? 'إعادة فتح فترة' : 'إقفال فترة', undefined, undefined, `حتى ${until} (السابق: ${cur?.value || 'غير مقفلة'})`);
  done('/approvals', `أُقفلت الفترة حتى ${until!.split('-').reverse().join('/')}؛ لا تعديل على أي حركة بتاريخ داخلها`);
}

// ---------- سندات الصرف ----------
export async function createVoucher(fd: FormData) {
  const u = await requireAction('accountant'); const path = '/vouchers/new' + (s(fd, 'contract_id') ? `?contract=${s(fd, 'contract_id')}` : '');
  const date = s(fd, 'date'), amt = n(fd, 'amount'), kind = s(fd, 'kind') ?? 'other', method = s(fd, 'method') ?? 'تحويل بنكي';
  let payee = s(fd, 'payee'); const tenant = s(fd, 'tenant_id'), contract = s(fd, 'contract_id');
  if (!isDate(date) || date! > todayRiyadh()) back(path, 'تاريخ السند غير صحيح');
  if (!amt || Number.isNaN(amt) || amt <= 0) back(path, 'أدخل مبلغاً صحيحاً');
  if (!VOUCHER_KINDS[kind]) back(path, 'نوع السند غير صحيح');
  await assertOpenPeriod(date, path);
  if (contract) {
    const [c] = await q('select * from contracts where id=$1', [contract]); if (!c) back(path, 'العقد غير موجود');
    if (kind === 'deposit_refund') {
      const [{ paid }] = await q(`select coalesce(sum(amount),0)::float paid from vouchers where contract_id=$1 and kind='deposit_refund' and status<>'voided'`, [contract]);
      const dep = Number(c.deposit ?? 0);
      if (!dep) back(path, 'لا يوجد تأمين مسجل على هذا العقد');
      if (paid + amt! > dep + 0.01) back(path, `المبلغ يتجاوز التأمين المتبقي (${money(dep - paid)} ريال)`);
    }
    if (!payee) { const [t] = await q('select name from tenants where id=$1', [c.tenant_id]); payee = t?.name ?? null; }
  }
  if (!payee) back(path, 'اكتب اسم المستفيد');
  const id = uid('v');
  const no = await tx(async (t) => {
    const [r] = await t(`update settings set value=(coalesce(nullif(value,''),'0')::int+1)::text where key='voucher_seq' returning value`);
    const seq = r ? Number(r.value) : 1; const vno = `V${String(seq).padStart(5, '0')}`;
    await t(`insert into vouchers (id,voucher_no,date,kind,tenant_id,contract_id,payee,amount,method,bank_ref,note,status,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12)`,
      [id, vno, date, kind, tenant ?? (contract ? (await t('select tenant_id from contracts where id=$1', [contract]))[0]?.tenant_id : null), contract, payee, amt, method, s(fd, 'bank_ref'), s(fd, 'note'), u.full_name]);
    return vno;
  });
  await log(u, 'إنشاء سند صرف', 'voucher', id, `${no} — ${VOUCHER_KINDS[kind]} — ${money(amt!)} — ${payee}`);
  done(`/vouchers/${id}`, `أُنشئ سند الصرف ${no} وينتظر الاعتماد`);
}
export async function approveVoucher(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!;
  const [v] = await q('select * from vouchers where id=$1', [id]); if (!v) back('/vouchers', 'السند غير موجود');
  if (v.status !== 'pending') back(`/vouchers/${id}`, 'السند ليس بانتظار الاعتماد');
  if ((await feats()).maker_checker && v.created_by === u.full_name) back(`/vouchers/${id}`, 'لا يعتمد السند من أنشأه؛ يلزم مستخدم آخر');
  await q(`update vouchers set status='approved', approved_by=$2, approved_at=now() where id=$1`, [id, u.full_name]);
  if (v.kind === 'deposit_refund' && v.contract_id) await q(`update contracts set deposit_refund=coalesce(deposit_refund,0)+$2, deposit_status='مسترد' where id=$1`, [v.contract_id, v.amount]);
  await log(u, 'اعتماد سند صرف', 'voucher', id, `${v.voucher_no} — ${money(Number(v.amount))}`);
  done(`/vouchers/${id}`, `اعتُمد سند الصرف ${v.voucher_no}`);
}
export async function voidVoucher(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!, reason = s(fd, 'reason');
  const [v] = await q('select * from vouchers where id=$1', [id]); if (!v) back('/vouchers', 'السند غير موجود');
  if (!reason) back(`/vouchers/${id}`, 'سبب الإلغاء مطلوب');
  if (v.status === 'voided') back(`/vouchers/${id}`, 'السند ملغى من قبل');
  await assertOpenPeriod(String(v.date), `/vouchers/${id}`);
  if ((await feats()).maker_checker && v.created_by === u.full_name) back(`/vouchers/${id}`, 'لا يلغي السند من أنشأه؛ يلزم مستخدم آخر');
  await q(`update vouchers set status='voided', void_reason=$2 where id=$1`, [id, reason]);
  if (v.status === 'approved' && v.kind === 'deposit_refund' && v.contract_id) await q(`update contracts set deposit_refund=greatest(0,coalesce(deposit_refund,0)-$2) where id=$1`, [v.contract_id, v.amount]);
  await log(u, 'إلغاء سند صرف', 'voucher', id, `${v.voucher_no} — ${reason}`);
  done(`/vouchers/${id}`, `أُلغي سند الصرف ${v.voucher_no} (يبقى رقمه في التسلسل)`);
}
