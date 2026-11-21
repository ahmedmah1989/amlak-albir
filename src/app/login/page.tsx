import { Suspense } from 'react';
import Link from 'next/link';
import { login } from '@/lib/actions';
import { MULTI, currentOrg, orgSource } from '@/lib/db';
import { orgState } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import Flash from '@/components/Flash';
import SubmitButton from '@/components/SubmitButton';
export const dynamic = 'force-dynamic';
export default async function Login() {
  const s = await getSettings();
  const src = orgSource(), org = currentOrg(), st = MULTI ? await orgState() : null;
  return (
    <div className="login">
      <form action={login} className="lbox">
        <img src="/api/logo" alt={s.org} />
        <h1>نظام إدارة العقارات</h1>
        <p>{s.org}</p>
        <Suspense><Flash /></Suspense>
        {MULTI && src !== 'host' && <label className="fld"><span>رمز الجهة</span><input name="org" defaultValue={src === 'cookie' ? org : ''} required dir="ltr" autoComplete="organization" placeholder="مثل: albir" /></label>}
        {st?.blocked && src !== 'none' && <p className="note warn">{st.blocked}</p>}
        <label className="fld"><span>اسم المستخدم</span><input name="username" autoComplete="username" required dir="ltr" /></label>
        <label className="fld"><span>كلمة المرور</span><input name="password" type="password" autoComplete="current-password" required dir="ltr" /></label>
        <SubmitButton label="دخول" />
        <Link className="login-forgot" href="/login/recover">نسيت كلمة المرور؟</Link>
      </form>
    </div>
  );
}
