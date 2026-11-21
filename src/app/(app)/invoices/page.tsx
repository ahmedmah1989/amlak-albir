import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Kpi, Empty } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { money, date } from '@/lib/fmt';

export default async function Invoices({ searchParams }: { searchParams: { k?: string } }) {
  const { db, a, org, asOf } = await ctx();
  if (!db.meta.features.e_invoice) return <Page title="الفواتير الضريبية" org={org} asOf={asOf}><Empty>الميزة غير مفعّلة. فعّلها من الإدارة ← الميزات الاختيارية.</Empty></Page>;
  const k = searchParams.k ?? 'all';
  const list = db.invoices.filter((i) => k === 'all' || i.kind === k);
  const inv = db.invoices.filter((i) => i.kind === 'invoice'), cn = db.invoices.filter((i) => i.kind === 'credit');
  const net = inv.reduce((n, i) => n + i.vat, 0) - cn.reduce((n, i) => n + i.vat, 0);
  const vatNo = db.meta.settings.org_vat_no;
  return (
    <Page title="الفواتير الضريبية" sub={db.meta.settings.zatca_stage === 'active' ? 'الفواتير تُوقَّع إلكترونياً وتُرسَل لمنصة فاتورة تلقائياً (المرحلة الثانية)' : 'فواتير المرحلة الأولى برمز QR. للربط مع منصة فاتورة: زر «الربط مع فاتورة»'} org={org} asOf={asOf} print
      actions={<><Link className="btn ghost" href="/installments?f=all">إصدار من الأقساط</Link><Link className="btn ghost" href="/invoices/zatca">الربط مع فاتورة</Link></>}>
      {!vatNo && <p className="note warn">الرقم الضريبي للجمعية غير مسجل. أدخله من الإعدادات قبل إصدار أي فاتورة.</p>}
      <div className="kpis">
        <Kpi l="الفواتير الصادرة" v={String(inv.length)} s={money(inv.reduce((n, i) => n + i.total, 0)) + ' ريال'} tone="info" />
        <Kpi l="إشعارات الدائن" v={String(cn.length)} s={money(cn.reduce((n, i) => n + i.total, 0)) + ' ريال'} />
        <Kpi l="صافي الضريبة المفوترة" v={money(net)} unit="ريال" tone="warn" />
        <Kpi l="حالة الربط مع فاتورة" v="غير مربوط" s="المرحلة الثانية تحتاج شهادة CSID باسم الجمعية" />
      </div>
      <div className="filters">{[['all', 'الكل'], ['invoice', 'الفواتير'], ['credit', 'إشعارات الدائن']].map(([kk, l]) => <Link key={kk} href={`?k=${kk}`} className={k === kk ? 'on' : ''}>{l}</Link>)}</div>
      <div className="card table-card"><DataTable label="الفواتير" storageKey={`invoices:${k}`} summaryColumns={[5, 6, 7]} columns={[
        { label: 'الرقم' }, { label: 'التاريخ', kind: 'date' }, { label: 'النوع' }, { label: 'المشتري', wide: true }, { label: 'البيان', wide: true, hidden: true }, { label: 'قبل الضريبة', numeric: true }, { label: 'الضريبة', numeric: true }, { label: 'الإجمالي', numeric: true }, { label: 'الحالة' }, { label: 'ICV', numeric: true, hidden: true },
      ]} rows={list.map((i) => ({
        id: i.id, search: [i.invoice_no, i.buyer_name, i.description, i.ref_invoice].join(' '),
        values: [i.invoice_no, i.issue_date, i.kind === 'credit' ? 'إشعار دائن' : i.buyer_vat ? 'فاتورة ضريبية' : 'فاتورة مبسطة', i.buyer_name, i.description, i.net, i.vat, i.total, i.status, i.icv],
        totals: { 5: i.kind === 'credit' ? -i.net : i.net, 6: i.kind === 'credit' ? -i.vat : i.vat, 7: i.kind === 'credit' ? -i.total : i.total },
        actions: [['فتح الفاتورة', `/invoices/${i.id}`], ...(i.installment_id ? [['فتح القسط', `/installments/${i.installment_id}`]] as [string, string][] : [])],
        cells: [<Link className="record-link" href={`/invoices/${i.id}`}>{i.invoice_no}</Link>, date(i.issue_date), i.kind === 'credit' ? <Tag tone="warn">إشعار دائن</Tag> : i.buyer_vat ? 'فاتورة ضريبية' : 'فاتورة مبسطة', i.buyer_name, i.description,
          money(i.net), money(i.vat), money(i.total), <Tag tone={i.status === 'issued' ? 'ok' : 'mute'}>{i.status === 'issued' ? 'سارية' : 'عليها إشعار دائن'}</Tag>, i.icv],
      }))} /></div>
    </Page>
  );
}
