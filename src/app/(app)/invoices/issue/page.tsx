import { ctx } from '@/lib/ctx';
import { Page, Empty } from '@/components/ui';
import { issueInvoices } from '@/lib/actions7';
import { money, date } from '@/lib/fmt';

export default async function IssueBulk({ searchParams }: { searchParams: { ids?: string } }) {
  const { db, a, org, asOf } = await ctx('accountant');
  const rows = (searchParams.ids ?? '').split(',').map((id) => a.rows.find((r) => r.id === id)).filter(Boolean) as typeof a.rows;
  const has = new Set(db.invoices.filter((i) => i.kind === 'invoice' && i.status === 'issued').map((i) => i.installment_id));
  const ok = rows.filter((r) => !has.has(r.id));
  return (
    <Page title="إصدار فواتير ضريبية" sub="فاتورة لكل قسط محدد. الأقساط التي لها فاتورة سارية تُترك." org={org} asOf={asOf} back={['/installments', 'الأقساط']}>
      {!db.meta.features.e_invoice ? <Empty>الميزة غير مفعّلة.</Empty> : !rows.length ? <Empty>حدد الأقساط من جدول الأقساط أولاً.</Empty> : <div className="card">
        <div className="tbl"><table><thead><tr><th>المستأجر</th><th>العقار / الوحدة</th><th className="n">القسط</th><th className="n">الاستحقاق</th><th className="n">المبلغ</th><th>الحالة</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.tenantName}</td><td>{r.propertyShort} — {r.unitCode}</td><td className="n">{r.no}</td><td className="n">{date(r.due_date)}</td><td className="n">{money(r.amount)}</td><td>{has.has(r.id) ? 'له فاتورة — سيُترك' : 'ستصدر فاتورة'}</td></tr>)}</tbody></table></div>
        <form action={issueInvoices}><input type="hidden" name="ids" value={ok.map((r) => r.id).join(',')} /><button className="btn" type="submit" disabled={!ok.length}>إصدار {ok.length} فاتورة</button></form></div>}
    </Page>
  );
}
