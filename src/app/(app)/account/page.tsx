import { requireUser, ROLE_LABEL } from '@/lib/auth';
import { getSettings, todayRiyadh } from '@/lib/data';
import { changePassword } from '@/lib/actions';
import { setPref } from '@/lib/actions2';
import { DATE_FORMATS } from '@/lib/fmt';
import { Page } from '@/components/ui';
import { Form, F } from '@/components/form';
import { generateRecoveryCodes, saveRecoveryMethods } from '@/lib/recovery';
import { smtpFrom } from '@/lib/mailer';
import { smsReady } from '@/lib/sms';
import { q } from '@/lib/db';
export default async function Account() {
  const u = await requireUser(); const s = await getSettings();
  const rec = await q('select recovery, email, phone, secret_q, secret_a, recovery_word from users where id=$1', [u.id]); const R = rec[0] ?? {}; const nCodes = (() => { try { return JSON.parse(rec[0]?.recovery || '[]').length as number; } catch { return 0; } })();
  return (
    <Page title="حسابي" sub={`${u.full_name} • ${ROLE_LABEL[u.role]} • اسم الدخول: ${u.username}`} org={s.org} asOf={todayRiyadh()}>
      {(() => { const p = (() => { try { return JSON.parse(u.prefs || '{}'); } catch { return {}; } })(); return <div className="card"><h2>تفضيلات العرض الخاصة بك</h2>
        <Form action={setPref} submit="حفظ التفضيلات"><input type="hidden" name="back" value="/account?ok=تم حفظ التفضيلات" />
          <F label="صيغة التاريخ" name="date_format" def={p.date_format ?? 'default'} req opts={[['default', `افتراضي الجمعية`], ...DATE_FORMATS]} />
          <F label="نوع الخط" name="font" def={p.font ?? 'default'} req opts={[['default', 'افتراضي الجمعية'], ...['Readex Pro', 'Almarai', 'Tajawal', 'Cairo', 'IBM Plex Sans Arabic', 'Noto Kufi Arabic', 'Noto Naskh Arabic'].map((f) => [f, f] as [string, string])]} />
          <F label={`حجم الخط (الحالي ${p.fz ?? 100}%)`} name="fz" type="range" def={p.fz ?? 100} min="85" max="130" step="5" />
        </Form></div>; })()}
      <div className="card"><h2>تغيير كلمة المرور</h2>
        <Form action={changePassword} submit="تغيير كلمة المرور">
          <F label="كلمة المرور الحالية" name="current" type="password" req dir="ltr" />
          <F label="كلمة المرور الجديدة" name="new" type="password" req dir="ltr" hint="8 أحرف على الأقل" />
          <F label="تأكيد كلمة المرور الجديدة" name="confirm" type="password" req dir="ltr" />
        </Form></div>
      <div className="card"><h2>طرق استعادة كلمة المرور</h2>
        <p>لو نسيت كلمة المرور، تقدر من صفحة الدخول ← «نسيت كلمة المرور؟» تستعيدها بأي طريقة من دول. يكفي إن طريقة واحدة تنجح، والبيانات ما بتتأثرش.</p>
        <div className="rec-status">
          <span className={'tag ' + (nCodes ? 't-ok' : 't-mute')}>رموز الاستعادة {nCodes ? `✓ (${nCodes} رموز)` : '— لم تُولَّد'}</span>
          <span className={'tag ' + (R.recovery_word ? 't-ok' : 't-mute')}>الكلمة المحفوظة {R.recovery_word ? '✓' : '— غير مضبوطة'}</span>
          <span className={'tag ' + (R.secret_a ? 't-ok' : 't-mute')}>السؤال السري {R.secret_a ? '✓' : '— غير مضبوط'}</span>
          <span className={'tag ' + (R.email && smtpFrom(s) ? 't-ok' : R.email ? 't-warn' : 't-mute')}>البريد {R.email ? (smtpFrom(s) ? '✓' : '— محفوظ، ينتظر إعداد البريد') : '— غير مسجل'}</span>
          <span className={'tag ' + (R.phone && smsReady(s) ? 't-ok' : R.phone ? 't-warn' : 't-mute')}>الجوال {R.phone ? (smsReady(s) ? '✓' : '— محفوظ، ينتظر بوابة الرسائل') : '— غير مسجل'}</span>
        </div>
        <p className="note">الأخضر = يعمل الآن من صفحة «نسيت كلمة المرور؟». البرتقالي = بياناتك محفوظة لكن الإرسال لم يُضبط بعد{u.role === 'admin' ? <> — اضبطه من <a href="/settings">الإعدادات ← البريد والرسائل</a></> : ' (من مدير النظام)'}. الرمادي = لم يُضبط.</p>
        <Form action={saveRecoveryMethods} submit="حفظ طرق الاستعادة">
          <F label="البريد الإلكتروني" name="email" type="email" def={R.email} dir="ltr" hint="يُرسل له رمز من 6 أرقام" />
          <F label="رقم الجوال" name="phone" def={R.phone} dir="ltr" hint="مثل 05XXXXXXXX — يُرسل له رمز برسالة" />
          <F label="السؤال السري" name="secret_q" def={R.secret_q ? (["ما اسم أول مدرسة درست فيها؟", "ما اسم مدينة ميلاد والدتك؟", "ما اسم أعز صديق في طفولتك؟", "ما اسم أول شركة عملت بها؟", "ما هو طبقك المفضل؟"].includes(R.secret_q) ? R.secret_q : 'custom') : ''} opts={[...["ما اسم أول مدرسة درست فيها؟", "ما اسم مدينة ميلاد والدتك؟", "ما اسم أعز صديق في طفولتك؟", "ما اسم أول شركة عملت بها؟", "ما هو طبقك المفضل؟"].map((x) => [x, x] as [string, string]), ['custom', 'سؤال آخر أكتبه بنفسي']]} />
          <F label="سؤالك (إن اخترت سؤالاً آخر)" name="secret_q_custom" def={R.secret_q && !["ما اسم أول مدرسة درست فيها؟", "ما اسم مدينة ميلاد والدتك؟", "ما اسم أعز صديق في طفولتك؟", "ما اسم أول شركة عملت بها؟", "ما هو طبقك المفضل؟"].includes(R.secret_q) ? R.secret_q : undefined} />
          <F label={R.secret_a ? 'إجابة جديدة (اتركها فارغة للإبقاء على الحالية)' : 'إجابة السؤال السري'} name="secret_a" type="password" autoComplete="off" hint="لا يفرق بين الهمزات والمسافات" />
          <F label={R.recovery_word ? 'كلمة محفوظة جديدة (اتركها فارغة للإبقاء)' : 'كلمة محفوظة للاستعادة'} name="recovery_word" type="password" autoComplete="off" hint="6 أحرف على الأقل، مختلفة عن كلمة المرور" />
          {R.secret_a && <label className="chk"><input type="checkbox" name="clear_q" value="1" /> إلغاء السؤال السري</label>}
          {R.recovery_word && <label className="chk"><input type="checkbox" name="clear_word" value="1" /> إلغاء الكلمة المحفوظة</label>}
          <F label="للتأكيد: كلمة المرور الحالية" name="current" type="password" req dir="ltr" />
        </Form></div>
      <div className="card"><h2>رموز استعادة كلمة المرور</h2>
        <p>{nCodes ? `لديك ${nCodes} رموز استعادة صالحة.` : 'لم تولّد رموز استعادة بعد.'} الرموز تتيح لك تعيين كلمة مرور جديدة من صفحة الدخول إذا نسيتها، دون أي تأثير على البيانات. ولّدها واطبعها واحفظها في مكان آمن.</p>
        <Form action={generateRecoveryCodes} submit="توليد 8 رموز جديدة (تُلغي السابقة)">
          <F label="للتأكيد: كلمة المرور الحالية" name="current" type="password" req dir="ltr" />
        </Form></div>
    </Page>
  );
}
