'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q } from './db';
import { requireUser, log } from './auth';
import { onboard, submitInvoice } from './zatca-engine';
const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const go = (path: string, k: 'ok' | 'err', m: string): never => { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(m)}`); };
const setS = (k: string, v: string) => q('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]);

export async function saveZatcaInfo(fd: FormData) {
  const u = await requireUser('admin');
  for (const k of ['org_vat_no', 'org_cr', 'org_street', 'org_building', 'org_district', 'org_city', 'org_postal', 'zatca_branch']) await setS(k, s(fd, k) ?? '');
  const env = s(fd, 'zatca_env'); if (env && ['sandbox', 'simulation', 'production'].includes(env)) await setS('zatca_env', env);
  await log(u, 'تعديل بيانات الربط مع فاتورة'); go('/invoices/zatca', 'ok', 'تم حفظ البيانات');
}
export async function connectZatca(fd: FormData) {
  const u = await requireUser('admin'); const otp = s(fd, 'otp');
  if (!otp || !/^\d{6}$/.test(otp)) go('/invoices/zatca', 'err', 'رمز OTP من بوابة فاتورة 6 أرقام');
  try { const r = await onboard(otp!, u.full_name); await log(u, 'ربط الفاتورة الإلكترونية', undefined, undefined, r.join(' • ')); }
  catch (e: any) { if (String(e?.digest ?? '').startsWith('NEXT_REDIRECT')) throw e; await log(u, 'فشل ربط الفاتورة الإلكترونية', undefined, undefined, e.message); go('/invoices/zatca', 'err', e.message); }
  go('/invoices/zatca', 'ok', 'تم الربط مع منصة فاتورة. الفواتير الجديدة تُوقَّع وتُرسَل تلقائياً');
}
export async function disconnectZatca(fd: FormData) {
  const u = await requireUser('admin'); if (s(fd, 'confirm') !== 'إلغاء الربط') go('/invoices/zatca', 'err', 'للتأكيد اكتب: إلغاء الربط');
  for (const k of ['zatca_stage', 'zatca_pcsid', 'zatca_secret', 'zatca_ccsid', 'zatca_ccsid_secret', 'zatca_private_key']) await setS(k, '');
  await log(u, 'إلغاء ربط الفاتورة الإلكترونية'); go('/invoices/zatca', 'ok', 'أُلغي الربط. الفواتير القادمة تصدر بالمرحلة الأولى فقط');
}
export async function sendInvoiceZatca(fd: FormData) {
  const u = await requireUser('accountant'); const id = s(fd, 'id')!;
  await q(`update invoices set zatca_status='pending' where id=$1 and zatca_status='failed'`, [id]);
  const r = await submitInvoice(id); await log(u, 'إرسال فاتورة للهيئة', 'invoice', id, r.msg);
  go(`/invoices/${id}`, r.ok ? 'ok' : 'err', r.msg);
}
