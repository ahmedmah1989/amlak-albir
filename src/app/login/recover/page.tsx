import { Suspense } from 'react';
import Link from 'next/link';
import { recoverPassword, sendRecoveryOtp } from '@/lib/recovery';
import { getSettings } from '@/lib/data';
import { q, MULTI, currentOrg, orgSource } from '@/lib/db';
import { chooseOrg } from '@/lib/actions';
import { smtpFrom } from '@/lib/mailer';
import { smsReady } from '@/lib/sms';
import Flash from '@/components/Flash';
import SubmitButton from '@/components/SubmitButton';
export const dynamic = 'force-dynamic';

const maskEmail = (e: string) => { const [a, d] = e.split('@'); return `${a.slice(0, 2)}${'•'.repeat(Math.max(2, a.length - 2))}@${d}`; };
const maskPhone = (p: string) => `${p.slice(0, 3)}${'•'.repeat(Math.max(2, p.length - 5))}${p.slice(-2)}`;
function NewPass() {
  return <>
    <label className="fld"><span>كلمة المرور الجديدة</span><input name="new" type="password" required minLength={8} dir="ltr" autoComplete="new-password" /></label>
    <label className="fld"><span>تأكيد كلمة المرور</span><input name="confirm" type="password" required minLength={8} dir="ltr" autoComplete="new-password" /></label>
  </>;
}
export default async function Recover({ searchParams }: { searchParams: { u?: string; m?: string; sent?: string } }) {
  const S = await getSettings();
  const username = (searchParams.u ?? '').trim().toLowerCase();
  const [row] = username ? await q('select username, email, phone, secret_q, secret_a, recovery, recovery_word from users where lower(username)=$1 and active', [username]) : [];
  const codes = (() => { try { return JSON.parse(row?.recovery || '[]').length as number; } catch { return 0; } })();
  const M = row ? {
    code: codes > 0 || !!row.recovery_word, question: !!row.secret_q && !!row.secret_a,
    email: !!row.email && !!smtpFrom(S), phone: !!row.phone && smsReady(S),
  } : { code: true, question: false, email: false, phone: false };
  const any = Object.values(M).some(Boolean);
  const m = searchParams.m && (M as Record<string, boolean>)[searchParams.m] ? searchParams.m : '';
  const hidden = <input type="hidden" name="username" value={username} />;
  return (
    <div className="login">
      <div className="lbox recover-box">
        <img src="/api/logo" alt={S.org} />
        <h1>استعادة كلمة المرور</h1>
        <p>اختر أي طريقة من الطرق المتاحة لحسابك. بياناتك في البرنامج لا تتأثر؛ تتغير كلمة المرور فقط.</p>
        <Suspense><Flash /></Suspense>
        {MULTI && orgSource() !== 'host' && <form action={chooseOrg} className="recover-step recover-org"><input type="hidden" name="back" value="/login/recover" />
          <label className="fld"><span>رمز الجهة</span><input name="org" defaultValue={orgSource() === 'cookie' ? currentOrg() : ''} required dir="ltr" /></label><button className="btn ghost sm" type="submit">اختيار الجهة</button></form>}
        {MULTI && orgSource() === 'none' ? null : !username ? <form method="get" className="recover-step">
          <label className="fld"><span>اسم المستخدم</span><input name="u" required dir="ltr" autoComplete="username" autoFocus /></label>
          <button className="btn" type="submit">متابعة</button>
        </form> : <>
          <p className="recover-user">الحساب: <b dir="ltr">{username}</b> • <Link href="/login/recover">تغيير</Link></p>
          {!any && <p className="note warn">لا توجد طريقة استعادة مفعّلة لهذا الحساب. اطلب من مدير النظام تعيين كلمة مرور مؤقتة لك من «الإعدادات ← المستخدمون».</p>}
          <div className="recover-methods">
            {M.code && <details className="recover-m" open={m === 'code' || (!m && !M.question)}><summary>رمز الاستعادة أو الكلمة المحفوظة</summary>
              <form action={recoverPassword}>{hidden}<input type="hidden" name="method" value="code" />
                <label className="fld"><span>أحد رموز الاستعادة المطبوعة أو كلمتك المحفوظة</span><input name="secret" required dir="auto" autoComplete="one-time-code" placeholder="XXXX-XXXX-XXXX أو الكلمة" /></label>
                <NewPass /><SubmitButton label="تعيين كلمة المرور" /></form></details>}
            {M.question && <details className="recover-m" open={m === 'question' || !m}><summary>السؤال السري</summary>
              <form action={recoverPassword}>{hidden}<input type="hidden" name="method" value="question" />
                <label className="fld"><span>{row.secret_q}</span><input name="secret" required autoComplete="off" /></label>
                <NewPass /><SubmitButton label="تعيين كلمة المرور" /></form></details>}
            {(['email', 'phone'] as const).filter((ch) => M[ch]).map((ch) => <details key={ch} className="recover-m" open={m === ch}>
              <summary>{ch === 'email' ? `رمز على البريد ${maskEmail(row.email)}` : `رمز برسالة على الجوال ${maskPhone(row.phone)}`}</summary>
              <form action={sendRecoveryOtp} className="recover-send">{hidden}<input type="hidden" name="channel" value={ch} />
                <button className="btn ghost" type="submit">{searchParams.sent && m === ch ? 'إعادة إرسال الرمز' : 'أرسل الرمز'}</button></form>
              {searchParams.sent && m === ch && <form action={recoverPassword}>{hidden}<input type="hidden" name="method" value={ch} />
                <label className="fld"><span>الرمز المرسل (6 أرقام)</span><input name="secret" required inputMode="numeric" dir="ltr" autoComplete="one-time-code" maxLength={6} /></label>
                <NewPass /><SubmitButton label="تعيين كلمة المرور" /></form>}
            </details>)}
          </div>
          <p className="login-help">طرق الاستعادة يضبطها كل مستخدم من «حسابي» بعد الدخول. المدير يستطيع تعيين كلمة مؤقتة لأي مستخدم، وإن نسيها المدير نفسه وليست لديه طريقة فأداة <b>RESET-PASSWORD.cmd</b> في مجلد البرنامج على الجهاز الرئيسي.</p>
        </>}
        <Link href="/login">رجوع لتسجيل الدخول</Link>
      </div>
    </div>
  );
}
