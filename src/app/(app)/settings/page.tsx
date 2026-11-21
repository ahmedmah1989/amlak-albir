import { saveRecoverySettings, testRecoveryChannel } from '@/lib/recovery';
import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import { Form, F } from '@/components/form';
import { saveSettings } from '@/lib/actions';
import { saveSystem } from '@/lib/actions2';
import { saveOrgProfile } from '@/lib/actions3';
import { DATE_FORMATS } from '@/lib/fmt';
import { getSettings } from '@/lib/data';
import { dbKind } from '@/lib/db';
import { date } from '@/lib/fmt';

export default async function Settings() {
  const { org, asOf } = await ctx('admin'); const s = await getSettings(); const kind = await dbKind();
  return (
    <Page title="الإعدادات" org={org} asOf={asOf}>
      <div className="card"><h2>إعدادات عامة</h2>
        <Form action={saveSettings}>
          <F label="اسم الجهة (يظهر في الترويسة والسندات)" name="org" def={s.org} req wide />
          <F label="مهلة السداد قبل اعتبار القسط متأخراً (أيام)" name="grace_days" type="number" def={s.grace_days} req min="0" max="60" />
          <F label="بادئة رقم سند القبض" name="receipt_prefix" def={s.receipt_prefix} req hint={`آخر رقم مُصدَر: ${s.receipt_seq}`} />
        </Form></div>
      <div className="card"><h2>بيانات الجهة في الخطابات والإشعارات</h2>
        <Form action={saveOrgProfile}>
          <F label="الرقم الضريبي للجهة" name="org_vat_no" def={s.org_vat_no} dir="ltr" hint="يظهر في إشعارات مطالبة الأقساط الخاضعة للضريبة" />
          <F label="رقم الترخيص / السجل" name="org_cr" def={s.org_cr} dir="ltr" />
          <F label="هاتف التواصل" name="org_phone" def={s.org_phone} dir="ltr" />
          <F label="المفوض بالتوقيع" name="org_signatory" def={s.org_signatory} hint="يظهر في خانة التوقيع بالخطابات" />
          <F label="العنوان" name="org_address" def={s.org_address} wide />
        </Form></div>
      <div className="card"><h2>العرض والإقفال والنسخ</h2>
        <Form action={saveSystem}>
          <F label="صيغة التاريخ الافتراضية" name="date_format" def={s.date_format} req opts={DATE_FORMATS} hint="كل مستخدم يقدر يغيرها لنفسه من «حسابي»" />
          <F label="إقفال الفترة حتى تاريخ" name="locked_until" type="date" def={s.locked_until} hint="لا يُسجَّل أو يُعدَّل سند أو مصروف أو خصم بتاريخ داخل الفترة المقفلة. اتركه فارغاً لعدم الإقفال." />
          <F label="عدد النسخ المحفوظة في المجلد" name="backup_keep" type="number" def={s.backup_keep} hint="الأقدم يُحذف تلقائياً" />
        </Form></div>
      <div className="card"><h2>البريد والرسائل (لاستعادة كلمات المرور)</h2>
        <p className="muted">اختياري: لتفعيل استعادة كلمة المرور برمز يُرسل لبريد المستخدم أو جواله. كلمات المرور والمفاتيح لا تدخل في النسخ الاحتياطية.</p>
        <Form action={saveRecoverySettings} submit="حفظ إعدادات البريد والرسائل">
          <F label="خادم البريد SMTP" name="smtp_host" def={s.smtp_host} dir="ltr" hint="مثل smtp.gmail.com أو smtp.office365.com" />
          <F label="المنفذ" name="smtp_port" type="number" def={s.smtp_port || '465'} dir="ltr" />
          <F label="التشفير" name="smtp_secure" def={s.smtp_secure || 'ssl'} opts={[['ssl', 'SSL (منفذ 465)'], ['starttls', 'STARTTLS (منفذ 587)'], ['none', 'بدون']]} />
          <F label="اسم المستخدم (البريد)" name="smtp_user" def={s.smtp_user} dir="ltr" />
          <F label={s.smtp_pass ? 'كلمة مرور البريد (محفوظة — اكتب جديدة للتغيير أو - للحذف)' : 'كلمة مرور البريد / كلمة مرور التطبيق'} name="smtp_pass" type="password" dir="ltr" hint="في Gmail استخدم «كلمة مرور التطبيقات»" />
          <F label="المرسل" name="smtp_from" def={s.smtp_from} dir="ltr" hint="اختياري — الافتراضي نفس اسم المستخدم" />
          <F label="رابط بوابة الرسائل SMS" name="sms_url" def={s.sms_url} dir="ltr" wide hint="من مزود الرسائل. يمكن أن يحتوي {phone} و{message}" />
          <F label="طريقة الطلب" name="sms_method" def={s.sms_method || 'GET'} opts={[['GET', 'GET'], ['POST', 'POST']]} />
          <F label="جسم الطلب (لـ POST)" name="sms_body" def={s.sms_body} dir="ltr" hint='مثل {"to":"{phone}","text":"{message}"}' />
          <F label={s.sms_auth ? 'ترويسة التفويض (محفوظة — اكتب جديدة أو - للحذف)' : 'ترويسة التفويض Authorization (اختياري)'} name="sms_auth" type="password" dir="ltr" hint="مثل Bearer xxxxx" />
        </Form>
        <form action={testRecoveryChannel} className="rowact noprint" style={{ marginTop: 10 }}>
          <select name="channel" className="inp"><option value="email">تجربة البريد</option><option value="phone">تجربة الرسائل</option></select>
          <input name="to" className="inp" placeholder="البريد أو الجوال" dir="ltr" required /><button className="btn sm" type="submit">إرسال رسالة تجربة</button></form></div>
      <div className="card"><h2>معلومات النظام</h2><div className="facts">
        <div><span>قاعدة البيانات</span><b>{kind === 'postgres' ? 'PostgreSQL (سحابية)' : 'مدمجة داخل البرنامج'}</b></div>
        <div><span>الرصيد الافتتاحي حتى</span><b>{date(s.opening_date)}</b></div>
      </div>{kind === 'pglite' && <p className="note warn">البيانات محفوظة في قاعدة مدمجة. عند التشغيل على Vercel دون ربط قاعدة سحابية قد تُفقد التعديلات عند إعادة تشغيل الخادم؛ اربط DATABASE_URL قبل الاستخدام الفعلي (انظر دليل التشغيل).</p>}</div>
    </Page>
  );
}
