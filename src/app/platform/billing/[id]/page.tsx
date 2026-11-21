import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pq } from '@/lib/db';
import { requirePlatform } from '@/lib/platform';
import { INV_STATUS } from '@/lib/billing';
import { markPaidAction, voidSubInvoice } from '@/lib/platform-actions';
import { zatcaQr, qrSvg } from '@/lib/zatca';
export const dynamic = 'force-dynamic';
const m = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
export default async function SubInvoice({ params }: { params: { id: string } }) {
  await requirePlatform();
  const [i] = await pq('select i.*, o.name, o.contact_name, o.contact_email, o.plan, o.billing_cycle from sub_invoices i join orgs o on o.slug=i.org where i.id=$1', [params.id]); if (!i) notFound();
  const S = Object.fromEntries((await pq('select key,value from settings')).map((x) => [x.key, x.value]));
  const qr = S.biz_vat ? qrSvg(zatcaQr({ seller: S.biz_name || 'مزود الخدمة', vat: S.biz_vat, at: new Date(i.created_at).toISOString().replace(/\.\d{3}Z$/, 'Z'), total: Number(i.total), tax: Number(i.vat) }), 130) : '';
  return <>
    <div className="pf-head noprint"><h1>فاتورة {i.no}</h1><div className="rowact"><Link className="btn ghost" href="/platform/billing">كل الفواتير</Link><button className="btn ghost" type="button">طباعة (Ctrl+P)</button></div></div>
    <div className="card invoice-doc">
      <div className="inv-head"><div><h2>فاتورة ضريبية<br /><small>اشتراك نظام الأملاك</small></h2>
        <div className="facts"><div><span>رقم الفاتورة</span><b dir="ltr">{i.no}</b></div><div><span>تاريخ الإصدار</span><b>{String(i.created_at).slice(0, 10)}</b></div><div><span>الاستحقاق</span><b>{String(i.due_on)}</b></div><div><span>الحالة</span><b><span className={'tag t-' + INV_STATUS[i.status]?.[1]}>{INV_STATUS[i.status]?.[0]}</span></b></div></div></div>
        {qr && <div className="inv-qr" dangerouslySetInnerHTML={{ __html: qr }} />}</div>
      <div className="g2"><div className="inv-party"><h3>المصدر</h3><p><b>{S.biz_name || '—'}</b></p>{S.biz_vat && <p>الرقم الضريبي: <b dir="ltr">{S.biz_vat}</b></p>}{S.biz_address && <p>{S.biz_address}</p>}</div>
        <div className="inv-party"><h3>العميل</h3><p><b>{i.name}</b></p><p>رمز الجهة: <span dir="ltr">{i.org}</span></p>{i.contact_name && <p>{i.contact_name}</p>}</div></div>
      <div className="tbl"><table><thead><tr><th>البيان</th><th className="n">المبلغ</th><th className="n">الضريبة</th><th className="n">الإجمالي</th></tr></thead><tbody>
        <tr><td>اشتراك {i.billing_cycle === 'monthly' ? 'شهري' : 'سنوي'} — باقة {i.plan} — من {String(i.period_from)} إلى {String(i.period_to)}</td><td className="n">{m(Number(i.amount))}</td><td className="n">{m(Number(i.vat))}</td><td className="n">{m(Number(i.total))}</td></tr>
        <tr className="tot"><td>الإجمالي المستحق</td><td className="n">{m(Number(i.amount))}</td><td className="n">{m(Number(i.vat))}</td><td className="n">{m(Number(i.total))} ريال</td></tr></tbody></table></div>
      {S.bank_info && <p>للسداد بالتحويل: {S.bank_info}</p>}
      {i.status === 'paid' && <p className="note">سُدّدت بتاريخ {String(i.paid_on)} • {i.method}{i.ref ? ` • مرجع ${i.ref}` : ''}</p>}
    </div>
    {i.status === 'unpaid' && <div className="g2 noprint">
      <form action={markPaidAction} className="card frm"><h2>تسجيل السداد</h2><input type="hidden" name="id" value={i.id} /><div className="grid">
        <label className="fld"><span>تاريخ السداد</span><input type="date" name="paid_on" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label className="fld"><span>الطريقة</span><select name="method"><option>تحويل بنكي</option><option>بطاقة</option><option>نقدي</option><option>أخرى</option></select></label>
        <label className="fld"><span>المرجع</span><input name="ref" /></label></div><div className="fa"><button className="btn" type="submit">تسجيل السداد وتمديد الاشتراك</button></div></form>
      <form action={voidSubInvoice} className="card frm"><h2>إلغاء الفاتورة</h2><input type="hidden" name="id" value={i.id} /><label className="fld"><span>السبب</span><input name="reason" required /></label><div className="fa"><button className="btn danger" type="submit">إلغاء</button></div></form></div>}
  </>;
}
