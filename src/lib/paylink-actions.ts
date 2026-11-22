'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q } from './db';
import { requireAction, log } from './auth';
import { createLink, verifyLink } from './paylinks';
import { money } from './fmt';
const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const go = (path: string, k: 'ok' | 'err', m: string): never => { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(m)}`); };

export async function createPayLink(fd: FormData) {
  const u = await requireAction('accountant');
  const tenant = s(fd, 'tenant_id'), contract = s(fd, 'contract_id'), insts = fd.getAll('inst').map(String).filter(Boolean);
  const amount = Number(String(s(fd, 'amount') ?? '').replace(/,/g, '')), days = Number(s(fd, 'days') ?? 7);
  const back = `/paylinks/new?tenant=${tenant ?? ''}${contract ? '&contract=' + contract : ''}`;
  if (!tenant) go(back, 'err', 'اختر المستأجر');
  if (!(amount > 0) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) go(back, 'err', 'المبلغ غير صحيح');
  const [own] = contract ? await q('select tenant_id from contracts where id=$1', [contract]) : [{ tenant_id: tenant }];
  if (!own || own.tenant_id !== tenant) go(back, 'err', 'العقد لا يخص المستأجر');
  const desc = s(fd, 'description') ?? 'سداد مستحقات إيجار';
  const { id } = await createLink({ tenantId: tenant!, contractId: contract, installmentIds: insts, amount, description: desc, by: u.full_name, days: days > 0 ? Math.min(60, days) : undefined });
  await log(u, 'إنشاء رابط دفع', 'payment_link', id, `${money(amount)} ريال`);
  go(`/paylinks?open=${id}`, 'ok', 'أُنشئ رابط الدفع. انسخه أو أرسله بواتساب');
}
export async function cancelPayLink(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id');
  await q(`update payment_links set status='cancelled' where id=$1 and status in ('pending','failed','expired')`, [id]);
  await log(u, 'إلغاء رابط دفع', 'payment_link', id ?? undefined); go('/paylinks', 'ok', 'أُلغي الرابط');
}
export async function recheckPayLink(fd: FormData) {
  await requireAction('accountant'); const [l] = await q('select token from payment_links where id=$1', [s(fd, 'id')]);
  const r = l ? await verifyLink(l.token) : { status: 'missing' };
  go('/paylinks', r.status === 'paid' ? 'ok' : 'err', r.status === 'paid' ? 'تم التأكد من الدفع وسُجّل السند' : 'لم يكتمل الدفع بعد عند البوابة');
}
export async function savePaySettings(fd: FormData) {
  const u = await requireAction('admin');
  const prov = ['moyasar', 'tap', 'sandbox'].includes(s(fd, 'pay_provider') ?? '') ? s(fd, 'pay_provider')! : '';
  const base = (s(fd, 'pay_base_url') ?? '').replace(/\/+$/, '');
  if (base && !/^https?:\/\/[^\s]+$/.test(base)) go('/paylinks?tab=settings', 'err', 'رابط البرنامج يجب أن يبدأ بـ https://');
  for (const [k, v] of [['pay_provider', prov], ['pay_base_url', base], ['pay_link_days', String(Math.max(1, Math.min(60, Number(s(fd, 'pay_link_days') ?? 7) || 7)))], ['pay_in_reminders', s(fd, 'pay_in_reminders') === '1' ? '1' : '0']] as [string, string][])
    await q('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]);
  const sec = s(fd, 'pay_secret'); if (sec === '-') await q(`update settings set value='' where key='pay_secret'`); else if (sec) await q(`insert into settings values ('pay_secret',$1) on conflict (key) do update set value=excluded.value`, [sec]);
  await log(u, 'تعديل إعدادات الدفع الإلكتروني', undefined, undefined, prov || 'موقوف'); go('/paylinks?tab=settings', 'ok', 'تم حفظ إعدادات الدفع');
}
/** بيئة التجربة: محاكاة نتيجة الدفع (لا تعمل إلا إذا كانت البوابة المختارة هي بيئة التجربة) */
export async function sandboxResult(fd: FormData) {
  const token = s(fd, 'token') ?? '', res = s(fd, 'result') === 'paid' ? 'paid' : 'failed', o = s(fd, 'o');
  const [st] = await q(`select value from settings where key='pay_provider'`); if (st?.value !== 'sandbox') redirect(`/pay/${token}`);
  await q(`update payment_links set provider_status=$2 where token=$1 and provider='sandbox'`, [token, res]);
  const r = await verifyLink(token).catch(() => ({ status: 'error' }));
  const oq = o ? `?o=${encodeURIComponent(o)}&` : '?';
  redirect(`/pay/${token}${oq}${r.status === 'paid' ? 'ok=' + encodeURIComponent('تم السداد بنجاح، وسُجّل سند القبض.') : 'err=' + encodeURIComponent('لم تكتمل عملية الدفع. يمكنك المحاولة مرة أخرى.')}`);
}
