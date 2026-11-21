import { pq } from '@/lib/db';
import { platformLogin, platformSetup } from '@/lib/platform-actions';
import SubmitButton from '@/components/SubmitButton';
export const dynamic = 'force-dynamic';
export default async function PlatformLogin() {
  const [{ n }] = await pq('select count(*)::int as n from platform_users');
  if (!n) return (
    <form action={platformSetup} className="lbox pf-box"><h1>إعداد حساب المالك</h1>
      <p>أول تشغيل للوحة المالك. هذا الحساب يدير كل الجهات المشتركة، وهو منفصل عن مستخدمي الجهات.</p>
      {process.env.PLATFORM_SETUP_KEY && <label className="fld"><span>مفتاح الإعداد (من إعدادات الخادم)</span><input name="setup_key" required dir="ltr" /></label>}
      <label className="fld"><span>اسم المستخدم</span><input name="username" required dir="ltr" autoComplete="username" /></label>
      <label className="fld"><span>الاسم</span><input name="full_name" required /></label>
      <label className="fld"><span>كلمة المرور (10 أحرف على الأقل)</span><input name="password" type="password" required minLength={10} dir="ltr" autoComplete="new-password" /></label>
      <label className="fld"><span>تأكيد كلمة المرور</span><input name="confirm" type="password" required minLength={10} dir="ltr" autoComplete="new-password" /></label>
      <SubmitButton label="إنشاء حساب المالك" /></form>);
  return (
    <form action={platformLogin} className="lbox pf-box"><h1>دخول مالك المنظومة</h1>
      <label className="fld"><span>اسم المستخدم</span><input name="username" required dir="ltr" autoComplete="username" autoFocus /></label>
      <label className="fld"><span>كلمة المرور</span><input name="password" type="password" required dir="ltr" autoComplete="current-password" /></label>
      <SubmitButton label="دخول" /></form>);
}
