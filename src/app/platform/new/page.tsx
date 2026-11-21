import Link from 'next/link';
import { requirePlatform, PLANS } from '@/lib/platform';
import { createOrg } from '@/lib/platform-actions';
import SubmitButton from '@/components/SubmitButton';
export const dynamic = 'force-dynamic';
export default async function NewOrg() {
  await requirePlatform();
  const y = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  return <>
    <div className="pf-head"><h1>جهة جديدة</h1><Link className="btn ghost" href="/platform">رجوع</Link></div>
    <form action={createOrg} className="card frm"><div className="grid">
      <label className="fld"><span>اسم الجهة</span><input name="name" required placeholder="مثل: جمعية ... الخيرية" /></label>
      <label className="fld"><span>رمز الجهة (للدخول والنطاق الفرعي)</span><input name="slug" required dir="ltr" pattern="[a-z][a-z0-9\-]{1,29}" placeholder="مثل: khair" /><small>حروف إنجليزية صغيرة وأرقام وشرطة. لا يمكن تغييره لاحقاً</small></label>
      <label className="fld"><span>الباقة</span><select name="plan" defaultValue="basic">{PLANS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="fld"><span>الحد الأقصى للمستخدمين</span><input name="max_users" type="number" min={1} max={500} defaultValue={5} /></label>
      <label className="fld"><span>انتهاء الاشتراك</span><input name="expires_on" type="date" defaultValue={y} /><small>اتركه فارغاً لاشتراك مفتوح</small></label>
      <label className="fld"><span>اسم مستخدم مدير الجهة</span><input name="admin_username" required dir="ltr" defaultValue="admin" /></label>
      <label className="fld"><span>اسم المدير</span><input name="admin_name" defaultValue="مدير النظام" /></label>
      <label className="fld"><span>كلمة مرور مؤقتة للمدير</span><input name="admin_password" type="text" required minLength={8} dir="ltr" autoComplete="off" /><small>يُطلب تغييرها عند أول دخول</small></label>
      <label className="fld"><span>مسؤول التواصل</span><input name="contact_name" /></label>
      <label className="fld"><span>جوال التواصل</span><input name="contact_phone" dir="ltr" /></label>
      <label className="fld"><span>بريد التواصل</span><input name="contact_email" type="email" dir="ltr" /></label>
      <label className="fld wide"><span>ملاحظات</span><textarea name="notes" rows={2} /></label>
    </div><div className="fa"><SubmitButton label="إنشاء الجهة" /></div></form>
  </>;
}
