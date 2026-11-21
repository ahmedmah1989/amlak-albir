import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pq, q, runAs, MULTI } from '@/lib/db';
import { requirePlatform, PLANS } from '@/lib/platform';
import { updateOrg, resetOrgAdmin, importOrgBackup, saveOrgBilling, issueRenewalAction } from '@/lib/platform-actions';
import { priceFor, INV_STATUS } from '@/lib/billing';
import SubmitButton from '@/components/SubmitButton';
export const dynamic = 'force-dynamic';
export default async function OrgPage({ params }: { params: { slug: string } }) {
  await requirePlatform();
  const [o] = await pq('select * from orgs where slug=$1', [params.slug]); if (!o) notFound();
  let st: Record<string, any> | null = null, err = '';
  try { st = await runAs(o.slug, async () => {
    const [c] = await q(`select (select count(*)::int from properties) p, (select count(*)::int from units) un, (select count(*)::int from tenants) t, (select count(*)::int from contracts where status='active') c,
      (select count(*)::int from users where active) u, (select coalesce(sum(amount),0)::float from payments where not voided) pay, (select max(at) from activity_log where action='تسجيل دخول') last_login`);
    const users = await q('select username, full_name, role, active, must_change from users order by role, username');
    return { ...c, users };
  }); } catch (e: any) { err = e.message; }
  const base = process.env.AMLAK_BASE_DOMAIN;
  const log = await pq('select * from platform_log where org=$1 order by at desc limit 10', [o.slug]);
  const invs = await pq('select * from sub_invoices where org=$1 order by created_at desc limit 20', [o.slug]); const price = await priceFor(o);
  return <>
    <div className="pf-head"><h1>{o.name}</h1><Link className="btn ghost" href="/platform">كل الجهات</Link></div>
    <div className="card"><h2>الدخول</h2><p>رمز الجهة: <b dir="ltr">{o.slug}</b>{base && <> • الرابط: <b dir="ltr">https://{o.slug}.{base}</b></>}</p>
      {!MULTI && <p className="note warn">الخادم الحالي يعمل بوضع جهة واحدة؛ الدخول لهذه الجهة يتاح بعد التشغيل بوضع تعدد الجهات.</p>}</div>
    {st ? <div className="kpis"><div className="kpi"><div className="l">العقارات / الوحدات</div><div className="v">{st.p} / {st.un}</div></div><div className="kpi"><div className="l">المستأجرون / العقود السارية</div><div className="v">{st.t} / {st.c}</div></div>
      <div className="kpi info"><div className="l">المستخدمون النشطون</div><div className="v">{st.u} <small>من {o.max_users}</small></div></div><div className="kpi"><div className="l">آخر دخول</div><div className="v" style={{ fontSize: '1rem' }}>{st.last_login ? new Date(st.last_login).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' }) : 'لم يدخل أحد بعد'}</div></div></div>
      : <p className="note warn">تعذر قراءة قاعدة الجهة: {err}</p>}
    <form action={updateOrg} className="card frm"><h2>الاشتراك والبيانات</h2><input type="hidden" name="slug" value={o.slug} /><div className="grid">
      <label className="fld"><span>اسم الجهة</span><input name="name" defaultValue={o.name} required /></label>
      <label className="fld"><span>الحالة</span><select name="status" defaultValue={o.status}><option value="active">نشطة</option><option value="suspended">موقوفة (يُمنع الدخول)</option></select></label>
      <label className="fld"><span>الباقة</span><select name="plan" defaultValue={o.plan}>{PLANS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="fld"><span>الحد الأقصى للمستخدمين</span><input name="max_users" type="number" min={1} defaultValue={o.max_users} /></label>
      <label className="fld"><span>انتهاء الاشتراك</span><input name="expires_on" type="date" defaultValue={o.expires_on ?? ''} /></label>
      <label className="fld"><span>مسؤول التواصل</span><input name="contact_name" defaultValue={o.contact_name ?? ''} /></label>
      <label className="fld"><span>الجوال</span><input name="contact_phone" dir="ltr" defaultValue={o.contact_phone ?? ''} /></label>
      <label className="fld"><span>البريد</span><input name="contact_email" dir="ltr" defaultValue={o.contact_email ?? ''} /></label>
      <label className="fld wide"><span>ملاحظات</span><textarea name="notes" rows={2} defaultValue={o.notes} /></label>
    </div><div className="fa"><SubmitButton label="حفظ" /></div></form>
    <div className="card"><h2>الاشتراك والفوترة</h2>
      <form action={saveOrgBilling} className="frm"><input type="hidden" name="slug" value={o.slug} /><div className="grid">
        <label className="fld"><span>دورة الفوترة</span><select name="billing_cycle" defaultValue={o.billing_cycle}><option value="annual">سنوي</option><option value="monthly">شهري</option></select></label>
        <label className="fld"><span>سعر خاص قبل الضريبة (اختياري)</span><input name="price" defaultValue={o.price ?? ''} dir="ltr" placeholder={`سعر الباقة: ${price}`} /></label>
        <label className="fld"><span>مهلة السماح بعد الانتهاء (يوم)</span><input name="grace_days" type="number" min={0} defaultValue={o.grace_days} /></label>
        <label className="fld"><span>الإيقاف التلقائي بعد المهلة</span><select name="auto_suspend" defaultValue={o.auto_suspend ? '1' : '0'}><option value="1">نعم</option><option value="0">لا</option></select></label></div>
        <div className="fa"><button className="btn ghost" type="submit">حفظ</button></div></form>
      <form action={issueRenewalAction} className="inline"><input type="hidden" name="slug" value={o.slug} /><button className="btn" type="submit">إصدار فاتورة التجديد</button></form>
      {invs.length > 0 && <div className="tbl"><table><tbody>{invs.map((i) => <tr key={i.id}><td><Link href={`/platform/billing/${i.id}`}>{i.no}</Link></td><td>{String(i.period_from)} — {String(i.period_to)}</td><td className="n">{Number(i.total)}</td><td><span className={'tag t-' + INV_STATUS[i.status]?.[1]}>{INV_STATUS[i.status]?.[0]}</span></td></tr>)}</tbody></table></div>}</div>
    {st && <div className="card"><h2>مستخدمو الجهة</h2><div className="tbl"><table><thead><tr><th>المستخدم</th><th>الاسم</th><th>الصلاحية</th><th>الحالة</th></tr></thead><tbody>
      {st.users.map((u: any) => <tr key={u.username}><td dir="ltr">{u.username}</td><td>{u.full_name}</td><td>{u.role}</td><td>{u.active ? (u.must_change ? 'كلمة مؤقتة' : 'نشط') : 'موقوف'}</td></tr>)}</tbody></table></div>
      <form action={resetOrgAdmin} className="inl"><input type="hidden" name="slug" value={o.slug} /><input name="username" placeholder="اسم المستخدم" dir="ltr" required className="inp" /><input name="password" placeholder="كلمة مرور مؤقتة" dir="ltr" required minLength={8} className="inp" /><button className="btn sm ghost" type="submit">تعيين كلمة مؤقتة</button></form></div>}
    <div className="card"><h2>النسخ والترحيل</h2>
      <p><a className="btn ghost" href={`/api/platform-backup?org=${o.slug}`}>⬇ تنزيل نسخة احتياطية كاملة للجهة</a></p>
      <form action={importOrgBackup} className="frm"><input type="hidden" name="slug" value={o.slug} />
        <p className="note warn">استيراد نسخة يستبدل كل بيانات الجهة الحالية ببيانات الملف (تُؤخذ نسخة تلقائية قبلها). يُستخدم لنقل بيانات جهة من البرنامج المحلي إلى السحابة.</p>
        <div className="grid"><label className="fld"><span>ملف النسخة (.json من «النسخ الاحتياطية»)</span><input type="file" name="file" accept=".json,application/json" required /></label>
          <label className="fld"><span>للتأكيد اكتب رمز الجهة</span><input name="confirm" dir="ltr" required /></label></div>
        <div className="fa"><SubmitButton label="استيراد واستبدال البيانات" danger /></div></form></div>
    <div className="card"><h2>سجل الجهة</h2><ul className="tl">{log.map((l) => <li key={l.id}><b>{new Date(l.at).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' })}</b> — {l.username}: {l.action}{l.details ? ` • ${l.details}` : ''}</li>)}</ul></div>
  </>;
}
