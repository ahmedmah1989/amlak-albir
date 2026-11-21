import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import { money, date } from '@/lib/fmt';

export default async function Unconfirmed({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf);
  const rs = a.unconfirmed.filter((r) => (!rp.props.length || rp.props.includes(r.contract.property_id)) && (!rp.tenant || r.contract.tenant_id === rp.tenant)).sort((x, y) => x.propertyShort.localeCompare(y.propertyShort, 'ar') || x.tenantName.localeCompare(y.tenantName, 'ar') || x.no - y.no);
  const pend = rs.reduce((x, r) => x + r.balance, 0);
  return (
    <ReportFrame id="unconfirmed" title="كشف الأقساط التي تحتاج تأكيداً" sub="أقساط لم يُستدلّ على سدادها — للمطابقة مع كشف الحساب البنكي" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['property', 'tenant']} xl={{ r: 'unconfirmed' }}>
      <div className="kpis">
        <Kpi l="إجمالي الأقساط" v={money(pend)} unit="ريال" tone="warn" />
        <Kpi l="عدد الأقساط" v={String(rs.length)} tone="info" />
        <Kpi l="إذا لم يثبت سداد شيء منها" v={money(a.arrearsTotal + a.pendingTotal)} unit="ريال" s="تصبح متأخرات مؤكدة" tone="bad" />
      </div>
      <div className="card"><div className="tbl"><table>
        <thead><tr><th>العقار</th><th>الوحدة</th><th>المستأجر</th><th className="n">#</th><th>الفترة</th><th className="n">الاستحقاق</th><th className="n">المبلغ</th><th>وُجد في البنك؟</th><th>تاريخ الإيداع</th><th>رقم السند</th></tr></thead>
        <tbody>{rs.map((r) => (
          <tr key={r.id}><td>{r.propertyShort}</td><td><Link href={`/contracts/${r.contract_id}`}>{r.unitCode}</Link></td><td>{r.tenantName}</td><td className="n">{r.no}</td>
            <td className="n">{date(r.period_from)} – {date(r.period_to)}</td><td className="n">{date(r.due_date)}</td><td className="n">{money(r.balance)}</td>
            <td><span className="blank" /></td><td><span className="blank" /></td><td><span className="blank" /></td></tr>))}
          <tr className="tot"><td>الإجمالي</td><td></td><td></td><td></td><td></td><td></td><td className="n">{money(pend)}</td><td></td><td></td><td></td></tr>
        </tbody></table></div></div>
    </ReportFrame>
  );
}
