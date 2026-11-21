import { requireUser } from '@/lib/auth';
import { getSettings, todayRiyadh } from '@/lib/data';
import { Page } from '@/components/ui';

/** تُعرض الرموز مرة واحدة بعد توليدها مباشرة (لا تُخزَّن إلا مشفّرة) */
export default async function Codes({ searchParams }: { searchParams: { c?: string } }) {
  const u = await requireUser(); const s = await getSettings();
  let codes: string[] = []; try { codes = Buffer.from(searchParams.c ?? '', 'base64url').toString().split(',').filter((x) => /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(x)); } catch {}
  return (
    <Page title="رموز استعادة كلمة المرور" sub={`${u.full_name} • اسم الدخول: ${u.username}`} org={s.org} asOf={todayRiyadh()} print back={['/account', 'حسابي']}>
      {codes.length ? <div className="card recovery-codes">
        <p className="note warn"><b>اطبع هذه الصفحة أو انسخ الرموز واحفظها في مكان آمن الآن.</b> لن تظهر مرة أخرى. كل رمز يُستخدم مرة واحدة من «نسيت كلمة المرور؟» في صفحة الدخول.</p>
        <ol className="codes">{codes.map((c) => <li key={c} dir="ltr">{c}</li>)}</ol>
        <p className="muted">توليد رموز جديدة يُلغي هذه الرموز. البيانات لا تتأثر بأي استعادة لكلمة المرور.</p>
      </div> : <p className="note">لا توجد رموز للعرض. ولّد رموزاً جديدة من صفحة «حسابي».</p>}
    </Page>
  );
}
