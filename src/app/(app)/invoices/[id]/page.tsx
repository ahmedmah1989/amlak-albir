import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import { creditInvoice } from '@/lib/actions7';
import { sendInvoiceZatca } from '@/lib/zatca-actions';
import { qrSvg } from '@/lib/zatca';
import { money, date } from '@/lib/fmt';
import { tafqit } from '@/lib/tafqit';

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const { db, org, asOf, isAdmin } = await ctx();
  const i = db.invoices.find((x) => x.id === params.id); if (!i) notFound();
  const S = db.meta.settings, credit = i.kind === 'credit';
  const title = credit ? 'إشعار دائن' : i.buyer_vat ? 'فاتورة ضريبية' : 'فاتورة ضريبية مبسطة';
  return (
    <Page title={`${title} ${i.invoice_no}`} org={org} asOf={asOf} print back={['/invoices', 'الفواتير الضريبية']}>
      {i.status === 'credited' && <p className="note warn noprint">صدر على هذه الفاتورة إشعار دائن؛ لم تعد سارية.</p>}
      <div className="card invoice-doc">
        <div className="inv-head">
          <div><h2>{title}<br /><small>{credit ? 'Credit Note' : i.buyer_vat ? 'Tax Invoice' : 'Simplified Tax Invoice'}</small></h2>
            <div className="facts"><div><span>رقم الفاتورة</span><b dir="ltr">{i.invoice_no}</b></div><div><span>تاريخ الإصدار</span><b>{date(i.issue_date)}</b></div>
              <div><span>تاريخ التوريد</span><b>{date(i.supply_date)}</b></div>{i.ref_invoice && <div><span>الفاتورة الأصلية</span><b dir="ltr">{i.ref_invoice}</b></div>}</div></div>
          <div className="inv-qr" dangerouslySetInnerHTML={{ __html: i.qr ? qrSvg(i.qr, 150) : '' }} />
        </div>
        <div className="g2">
          <div className="inv-party"><h3>البائع</h3><p><b>{i.seller_name}</b></p><p>الرقم الضريبي: <b dir="ltr">{i.seller_vat}</b></p>{S.org_cr && <p>السجل/الترخيص: {S.org_cr}</p>}{S.org_address && <p>العنوان: {S.org_address}</p>}</div>
          <div className="inv-party"><h3>المشتري</h3><p><b>{i.buyer_name}</b></p><p>الرقم الضريبي: <b dir="ltr">{i.buyer_vat ?? '—'}</b></p></div>
        </div>
        <div className="tbl"><table><thead><tr><th>البيان</th><th className="n">المبلغ قبل الضريبة</th><th className="n">نسبة الضريبة</th><th className="n">الضريبة</th><th className="n">الإجمالي</th></tr></thead>
          <tbody><tr><td>{i.description}</td><td className="n">{money(i.net)}</td><td className="n">{i.vat_rate}%</td><td className="n">{money(i.vat)}</td><td className="n">{money(i.total)}</td></tr>
            <tr className="tot"><td>الإجمالي المستحق</td><td className="n">{money(i.net)}</td><td></td><td className="n">{money(i.vat)}</td><td className="n">{money(i.total)} ريال</td></tr></tbody></table></div>
        <p className="tafqit">{tafqit(i.total)}{i.vat_rate === 0 ? ' — معفاة/خاضعة للنسبة الصفرية' : ''}</p>
        <p className="inv-tech">UUID: <span dir="ltr">{i.uuid}</span> • ICV: {i.icv} • حالة الإرسال للهيئة: {(() => { const z = (i as any).zatca_status as string; const m: Record<string, [string, string]> = { reported: ['تم الإبلاغ', 'ok'], cleared: ['معتمدة من الهيئة', 'ok'], pending: ['بانتظار الإرسال', 'warn'], failed: ['مرفوضة', 'bad'], not_sent: ['غير مُرسلة (المرحلة الأولى)', 'mute'] }; const [l, t] = m[z] ?? [z, 'mute']; return <Tag tone={t}>{l}</Tag>; })()}</p>
        {(i as any).zatca_response && <p className="inv-tech noprint">رد الهيئة: {(i as any).zatca_response}</p>}
        {(i as any).signed && <div className="noprint inv-links"><a href={`/api/invoice-xml?id=${i.id}`}>تنزيل XML الموقّع</a>{['pending', 'failed'].includes((i as any).zatca_status) && <form action={sendInvoiceZatca} className="inline"><input type="hidden" name="id" value={i.id} /><button className="btn sm" type="submit">إرسال للهيئة الآن</button></form>}</div>}
        <div className="noprint inv-links">{i.installment_id && <Link href={`/installments/${i.installment_id}`}>القسط المرتبط</Link>}{i.contract_id && <Link href={`/contracts/${i.contract_id}`}>العقد</Link>}</div>
      </div>
      {isAdmin && !credit && i.status === 'issued' && <details className="box noprint"><summary>إصدار إشعار دائن (إلغاء الفاتورة)</summary><div className="in">
        <form action={creditInvoice} className="frm"><input type="hidden" name="id" value={i.id} /><label className="fld wide"><span>سبب الإشعار</span><input name="reason" required placeholder="مثل: خصم معتمد، فاتورة صدرت بالخطأ" /></label>
          <button className="btn danger" type="submit">إصدار إشعار دائن</button></form><p className="muted">الفاتورة لا تُحذف ولا تُعدّل؛ يصدر إشعار دائن مقابلها بنفس المبلغ وتبقى في السجل.</p></div></details>}
    </Page>
  );
}
