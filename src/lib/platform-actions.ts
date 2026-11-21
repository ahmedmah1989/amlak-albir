'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { pq, q, runAs, uid, validSlug, driver, MAIN } from './db';
import { hashPassword, verifyPassword } from './password';
import { createPlatformSession, requirePlatform, plog, PCOOKIE, PLANS } from './platform';
import { clearOrgCache } from './auth';
import { restore } from './backup';
import { issueRenewal, markPaid } from './billing';

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const go = (path: string, k: 'ok' | 'err', m: string): never => redirect(`${path}${path.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(m)}`);
const isDate = (v: string | null) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);

/** أول تشغيل: إنشاء حساب المالك (مرة واحدة فقط) */
export async function platformSetup(fd: FormData) {
  const [{ n }] = await pq('select count(*)::int as n from platform_users'); if (n > 0) go('/platform/login', 'err', 'حساب المالك موجود بالفعل');
  const username = s(fd, 'username')?.toLowerCase(), name = s(fd, 'full_name'), pass = s(fd, 'password'), conf = s(fd, 'confirm');
  const key = process.env.PLATFORM_SETUP_KEY; if (key && s(fd, 'setup_key') !== key) go('/platform/login', 'err', 'مفتاح الإعداد غير صحيح');
  if (!username || !/^[a-z0-9._-]{3,30}$/.test(username) || !name) go('/platform/login', 'err', 'اسم المستخدم (إنجليزي) والاسم مطلوبان');
  if (!pass || pass.length < 10) go('/platform/login', 'err', 'كلمة مرور المالك 10 أحرف على الأقل');
  if (pass !== conf) go('/platform/login', 'err', 'تأكيد كلمة المرور غير مطابق');
  const id = uid('pu'); await pq('insert into platform_users (id,username,full_name,pass_hash) values ($1,$2,$3,$4)', [id, username, name, hashPassword(pass!)]);
  await plog(username!, 'إنشاء حساب المالك'); await createPlatformSession(id); go('/platform', 'ok', 'تم إنشاء حساب المالك');
}
export async function platformLogin(fd: FormData) {
  const username = s(fd, 'username')?.toLowerCase() ?? '', pass = s(fd, 'password') ?? '';
  const [{ n }] = await pq(`select count(*)::int as n from platform_log where action='دخول فاشل' and username=$1 and at > now() - interval '15 minutes'`, [username]);
  if (n >= 5) go('/platform/login', 'err', 'محاولات كثيرة. انتظر 15 دقيقة');
  const [u] = await pq('select * from platform_users where username=$1', [username]);
  if (!u || !verifyPassword(pass, u.pass_hash)) { await plog(username, 'دخول فاشل'); go('/platform/login', 'err', 'بيانات الدخول غير صحيحة'); }
  await createPlatformSession(u.id); await plog(username, 'دخول'); redirect('/platform');
}
export async function platformLogout() { cookies().delete(PCOOKIE); redirect('/platform/login'); }

export async function createOrg(fd: FormData) {
  const me = await requirePlatform();
  const slug = s(fd, 'slug')?.toLowerCase() ?? '', name = s(fd, 'name'), au = s(fd, 'admin_username')?.toLowerCase() ?? 'admin', an = s(fd, 'admin_name') ?? 'مدير النظام', ap = s(fd, 'admin_password');
  const plan = PLANS.some((p) => p[0] === s(fd, 'plan')) ? s(fd, 'plan')! : 'basic', maxU = Math.max(1, Math.min(500, Number(s(fd, 'max_users') ?? 5) || 5)), exp = s(fd, 'expires_on');
  if (!validSlug(slug)) go('/platform/new', 'err', 'رمز الجهة: حروف إنجليزية صغيرة وأرقام وشرطة، يبدأ بحرف، من 2 إلى 30');
  if (!name) go('/platform/new', 'err', 'اسم الجهة مطلوب');
  if (!/^[a-z0-9._-]{3,30}$/.test(au)) go('/platform/new', 'err', 'اسم مستخدم المدير بالإنجليزية 3 أحرف على الأقل');
  if (!ap || ap.length < 8) go('/platform/new', 'err', 'كلمة المرور المؤقتة للمدير 8 أحرف على الأقل');
  if (!isDate(exp)) go('/platform/new', 'err', 'تاريخ انتهاء الاشتراك غير صحيح');
  const [ex] = await pq('select 1 from orgs where slug=$1', [slug]); if (ex) go('/platform/new', 'err', 'رمز الجهة مستخدم من قبل');
  await pq(`insert into orgs (slug,name,plan,max_users,expires_on,contact_name,contact_phone,contact_email,notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [slug, name, plan, maxU, exp, s(fd, 'contact_name'), s(fd, 'contact_phone'), s(fd, 'contact_email'), s(fd, 'notes') ?? '']);
  try {
    await runAs(slug, async () => {
      await driver(slug); // يُنشئ قاعدة بيانات الجهة وجداولها فارغة
      await q(`insert into settings values ('org',$1) on conflict (key) do update set value=excluded.value`, [name]);
      await q(`insert into users (id,username,full_name,role,pass_hash,must_change) values ($1,$2,$3,'admin',$4,true)`, [uid('u'), au, an, hashPassword(ap!)]);
      await q(`insert into activity_log (username,action,details) values ('مزود الخدمة','تهيئة الجهة',$1)`, [`أُنشئت الجهة ${name} بمدير ${au}`]);
    });
  } catch (e: any) { await pq('delete from orgs where slug=$1', [slug]); go('/platform/new', 'err', `تعذر إنشاء قاعدة بيانات الجهة: ${e.message}`); }
  await plog(me.username, 'إنشاء جهة', slug, `${name} • ${plan} • ${maxU} مستخدمين`);
  go(`/platform/org/${slug}`, 'ok', `أُنشئت الجهة. الدخول برمز الجهة «${slug}» ومستخدم «${au}» وكلمة المرور المؤقتة`);
}
export async function updateOrg(fd: FormData) {
  const me = await requirePlatform(); const slug = s(fd, 'slug')!; const exp = s(fd, 'expires_on');
  if (!isDate(exp)) go(`/platform/org/${slug}`, 'err', 'تاريخ غير صحيح');
  const st = s(fd, 'status') === 'suspended' ? 'suspended' : 'active';
  await pq(`update orgs set name=$2, status=$3, plan=$4, max_users=$5, expires_on=$6, contact_name=$7, contact_phone=$8, contact_email=$9, notes=$10 where slug=$1`,
    [slug, s(fd, 'name'), st, s(fd, 'plan') ?? 'basic', Math.max(1, Number(s(fd, 'max_users') ?? 5) || 5), exp, s(fd, 'contact_name'), s(fd, 'contact_phone'), s(fd, 'contact_email'), s(fd, 'notes') ?? '']);
  clearOrgCache(slug); await plog(me.username, 'تعديل جهة', slug, `${st} • انتهاء ${exp ?? '—'}`);
  go(`/platform/org/${slug}`, 'ok', 'تم حفظ بيانات الجهة');
}
export async function resetOrgAdmin(fd: FormData) {
  const me = await requirePlatform(); const slug = s(fd, 'slug')!, user = s(fd, 'username')?.toLowerCase(), pass = s(fd, 'password');
  if (!pass || pass.length < 8) go(`/platform/org/${slug}`, 'err', 'كلمة المرور المؤقتة 8 أحرف على الأقل');
  const n = await runAs(slug, async () => {
    const r = await q(`update users set pass_hash=$2, must_change=true, active=true where lower(username)=$1 returning id`, [user, hashPassword(pass!)]);
    if (r.length) await q(`insert into activity_log (username,action,details) values ('مزود الخدمة','إعادة تعيين كلمة المرور',$1)`, [`المستخدم ${user}`]);
    return r.length;
  });
  if (!n) go(`/platform/org/${slug}`, 'err', 'لا يوجد مستخدم بهذا الاسم في الجهة');
  await plog(me.username, 'إعادة تعيين كلمة مرور', slug, user); go(`/platform/org/${slug}`, 'ok', `عُيّنت كلمة مرور مؤقتة للمستخدم ${user} (يغيّرها عند أول دخول)`);
}
/** ترحيل: رفع نسخة احتياطية من البرنامج المحلي إلى قاعدة الجهة في السحابة */
export async function importOrgBackup(fd: FormData) {
  const me = await requirePlatform(); const slug = s(fd, 'slug')!; const f = fd.get('file') as File | null;
  if (s(fd, 'confirm') !== slug) go(`/platform/org/${slug}`, 'err', 'للتأكيد اكتب رمز الجهة كما هو');
  if (!f || !f.size) go(`/platform/org/${slug}`, 'err', 'اختر ملف النسخة الاحتياطية (.json)');
  try { await runAs(slug === MAIN ? MAIN : slug, async () => { await restore(await f!.text(), 'مزود الخدمة (ترحيل)'); }); }
  catch (e: any) { if (String(e?.digest ?? '').startsWith('NEXT_REDIRECT')) throw e; go(`/platform/org/${slug}`, 'err', `تعذر الاستيراد: ${e.message}`); }
  await plog(me.username, 'استيراد نسخة لجهة', slug, `${f!.name} (${Math.round(f!.size / 1024)} ك.ب)`);
  go(`/platform/org/${slug}`, 'ok', 'تم استيراد البيانات. المستخدمون وكلمات مرورهم كما في النسخة');
}

// ---------- فوترة الاشتراكات ----------
export async function savePlans(fd: FormData) {
  const me = await requirePlatform();
  for (const k of fd.getAll('key').map(String)) await pq('update plans set name=$2, monthly=$3, annual=$4, max_users=$5 where key=$1', [k, s(fd, `name_${k}`) ?? k, Number(s(fd, `monthly_${k}`) ?? 0) || 0, Number(s(fd, `annual_${k}`) ?? 0) || 0, Math.max(1, Number(s(fd, `users_${k}`) ?? 5) || 5)]);
  for (const [k, v] of [['biz_name', s(fd, 'biz_name') ?? ''], ['biz_vat', s(fd, 'biz_vat') ?? ''], ['biz_address', s(fd, 'biz_address') ?? ''], ['vat_rate', String(Number(s(fd, 'vat_rate') ?? 15) || 0)], ['bank_info', s(fd, 'bank_info') ?? '']])
    await pq('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]);
  await plog(me.username, 'تعديل الباقات والأسعار'); go('/platform/billing', 'ok', 'تم حفظ الباقات والأسعار');
}
export async function saveOrgBilling(fd: FormData) {
  const me = await requirePlatform(); const slug = s(fd, 'slug')!;
  const price = s(fd, 'price'); await pq('update orgs set billing_cycle=$2, price=$3, grace_days=$4, auto_suspend=$5 where slug=$1', [slug, s(fd, 'billing_cycle') === 'monthly' ? 'monthly' : 'annual', price == null ? null : Number(price) || 0, Math.max(0, Number(s(fd, 'grace_days') ?? 14) || 0), s(fd, 'auto_suspend') === '1']);
  await plog(me.username, 'تعديل فوترة جهة', slug); go(`/platform/org/${slug}`, 'ok', 'تم حفظ إعدادات الفوترة');
}
export async function issueRenewalAction(fd: FormData) {
  const me = await requirePlatform(); const slug = s(fd, 'slug')!;
  try { const r = await issueRenewal(slug, me.username); go(`/platform/billing/${r.id}`, 'ok', `صدرت الفاتورة ${r.no}`); }
  catch (e: any) { if (String(e?.digest ?? '').startsWith('NEXT_REDIRECT')) throw e; go(`/platform/org/${slug}`, 'err', e.message); }
}
export async function markPaidAction(fd: FormData) {
  const me = await requirePlatform(); const id = s(fd, 'id')!; const d = s(fd, 'paid_on') ?? new Date().toISOString().slice(0, 10);
  try { const to = await markPaid(id, { paid_on: d, method: s(fd, 'method') ?? 'تحويل بنكي', ref: s(fd, 'ref'), by: me.username }); go(`/platform/billing/${id}`, 'ok', `سُجّل السداد. الاشتراك مدفوع حتى ${to}`); }
  catch (e: any) { if (String(e?.digest ?? '').startsWith('NEXT_REDIRECT')) throw e; go(`/platform/billing/${id}`, 'err', e.message); }
}
export async function voidSubInvoice(fd: FormData) {
  const me = await requirePlatform(); const id = s(fd, 'id')!;
  const [r] = await pq(`update sub_invoices set status='void', notes=$2 where id=$1 and status='unpaid' returning no, org`, [id, s(fd, 'reason') ?? '']);
  if (r) await plog(me.username, 'إلغاء فاتورة اشتراك', r.org, r.no); go(`/platform/billing/${id}`, 'ok', 'أُلغيت الفاتورة');
}
