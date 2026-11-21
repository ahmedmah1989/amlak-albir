import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import { getSettings } from '@/lib/data';
import { q } from '@/lib/db';
import { ZATCA_ENVS } from '@/lib/zatca2';
import { missingSeller, zatcaActive } from '@/lib/zatca-engine';
import { saveZatcaInfo, connectZatca, disconnectZatca } from '@/lib/zatca-actions';
export const dynamic = 'force-dynamic';
export default async function ZatcaPage() {
  const { org, asOf } = await ctx('admin');
  const S = await getSettings(); const miss = missingSeller(S); const on = zatcaActive(S);
  const [k] = await q(`select count(*) filter (where zatca_status in ('reported','cleared'))::int sent, count(*) filter (where zatca_status='failed')::int failed, count(*) filter (where zatca_status='pending')::int pending from invoices`);
  const F = (k2: string, l: string, hint?: string, extra: Record<string, unknown> = {}) => <label className="fld"><span>{l}</span><input name={k2} defaultValue={S[k2] ?? ''} {...extra} />{hint && <small>{hint}</small>}</label>;
  return (
    <Page title="الربط مع منصة فاتورة (المرحلة الثانية)" sub="توقيع الفواتير إلكترونياً وإرسالها لهيئة الزكاة والضريبة والجمارك: إبلاغ للمبسطة، واعتماد للقياسية." org={org} asOf={asOf} back={['/invoices', 'الفواتير الضريبية']}>
      <div className="card"><h2>الحالة</h2>
        <p>{on ? <Tag tone="ok">مربوط — {ZATCA_ENVS[S.zatca_env || 'sandbox']?.label}</Tag> : S.zatca_stage === 'compliance' ? <Tag tone="warn">شهادة امتثال فقط — أكمل الربط</Tag> : <Tag tone="mute">غير مربوط (المرحلة الأولى فقط)</Tag>}
          {S.zatca_onboarded && <span className="muted"> • {S.zatca_onboarded}</span>}</p>
        {on && <p>أُرسل {k.sent} • بانتظار الإرسال {k.pending} • مرفوض {k.failed} {k.failed > 0 && <Link href="/invoices?z=failed">عرض المرفوض</Link>}</p>}
        <ol className="steps-ol"><li>أكمل بيانات الجهة والعنوان الوطني تحت.</li><li>اختر البيئة: ابدأ بـ<b>المحاكاة</b> ثم الإنتاج.</li><li>ادخل بوابة فاتورة (fatoora.zatca.gov.sa) بحساب الجمعية ← «إضافة جهاز جديد» واحصل على رمز OTP (صالح ساعة).</li><li>اكتب الرمز واضغط «ربط». البرنامج يطلب الشهادة ويجري فحوص الامتثال ويفعّل الربط.</li></ol></div>
      <form action={saveZatcaInfo} className="card frm"><h2>بيانات الجهة والعنوان الوطني</h2>
        {miss.length > 0 && <p className="note warn">ناقص: {miss.join('، ')}</p>}
        <div className="grid">{F('org_vat_no', 'الرقم الضريبي', '15 رقماً يبدأ وينتهي بـ 3', { dir: 'ltr', required: true })}{F('org_cr', 'السجل التجاري / رقم الترخيص', undefined, { dir: 'ltr' })}
          {F('org_street', 'اسم الشارع')}{F('org_building', 'رقم المبنى', '4 أرقام', { dir: 'ltr' })}{F('org_district', 'الحي')}{F('org_city', 'المدينة')}{F('org_postal', 'الرمز البريدي', '5 أرقام', { dir: 'ltr' })}{F('zatca_branch', 'اسم الفرع / الوحدة', 'مثل: الإدارة الرئيسية')}
          <label className="fld"><span>البيئة</span><select name="zatca_env" defaultValue={S.zatca_env || 'simulation'}>{Object.entries(ZATCA_ENVS).map(([k2, v]) => <option key={k2} value={k2}>{v.label}</option>)}</select></label></div>
        <div className="fa"><button className="btn" type="submit">حفظ</button></div></form>
      {!on ? <form action={connectZatca} className="card frm"><h2>الربط</h2><div className="grid"><label className="fld"><span>رمز OTP من بوابة فاتورة</span><input name="otp" inputMode="numeric" maxLength={6} dir="ltr" required disabled={miss.length > 0} /></label></div>
        <div className="fa"><button className="btn" type="submit" disabled={miss.length > 0}>ربط</button></div><p className="muted">يُنشأ مفتاح التوقيع على جهاز البرنامج ولا يخرج منه، ولا يدخل في النسخ الاحتياطي. احتفظ بنسخة من الإعدادات عند نقل البرنامج.</p></form>
      : <details className="box"><summary>إلغاء الربط</summary><div className="in"><form action={disconnectZatca} className="frm"><p className="note warn">يتوقف التوقيع والإرسال؛ الفواتير المرسلة تبقى كما هي. للربط مرة أخرى تحتاج OTP جديد.</p><label className="fld"><span>اكتب «إلغاء الربط»</span><input name="confirm" required /></label><div className="fa"><button className="btn danger" type="submit">إلغاء الربط</button></div></form></div></details>}
    </Page>
  );
}
