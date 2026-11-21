import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi, Tag } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import { money, date } from '@/lib/fmt';

const ST: [string, string][] = [['30', 'متأخر أكثر من 30 يوماً'], ['90', 'أكثر من 90 يوماً'], ['180', 'أكثر من 180 يوماً'], ['365', 'أكثر من سنة'], ['nofollow', 'بدون متابعة خلال 30 يوماً']];
export default async function Arrears({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { detail: 'detail' });
  const lastF = (tid: string) => db.followups.filter((f) => f.tenant_id === tid).sort((x, y) => y.date.localeCompare(x.date))[0];
  const minDays = /^\d+$/.test(rp.status) ? Number(rp.status) : 0;
  const rows = a.overdue.filter((r) => (!rp.props.length || rp.props.includes(r.contract.property_id)) && (!rp.tenant || r.contract.tenant_id === rp.tenant) && r.daysLate > minDays
    && (rp.status !== 'nofollow' || !lastF(r.contract.tenant_id) || lastF(r.contract.tenant_id)!.date < new Date(Date.parse(asOf) - 30 * 864e5).toISOString().slice(0, 10)));
  const byT = new Map<string, typeof rows>();
  rows.forEach((r) => byT.set(r.contract.tenant_id, [...(byT.get(r.contract.tenant_id) ?? []), r]));
  const groups = [...byT.entries()].map(([tid, rs]) => ({ tid, rs: rs.sort((x, y) => x.due_date.localeCompare(y.due_date)), total: rs.reduce((x, r) => x + r.balance, 0) }))
    .sort((x, y) => y.total - x.total);
  const total = rows.reduce((x, r) => x + r.balance, 0);
  const last = (tid: string) => db.followups.filter((f) => f.tenant_id === tid).sort((x, y) => y.date.localeCompare(x.date))[0];
  return (
    <ReportFrame id="arrears" title="تقرير المتأخرات المؤكدة" sub={`القسط متأخر إذا مرّت ${a.grace} أيام على استحقاقه دون سداد كامل`} sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['property', 'tenant', 'status', 'detail']} statuses={ST} xl={{ r: 'arrears' }}>
      <div className="kpis">
        <Kpi l="إجمالي المتأخرات" v={money(total)} unit="ريال" tone="bad" />
        <Kpi l="عدد الأقساط المتأخرة" v={String(rows.length)} tone="warn" />
        <Kpi l="عدد المستأجرين" v={String(groups.length)} tone="info" />
        <Kpi l="أقدم تأخير" v={`${Math.max(0, ...rows.map((r) => r.daysLate))} يوماً`} />
      </div>
      <div className="card"><h2>الملخص حسب المستأجر</h2><div className="tbl"><table>
        <thead><tr><th>المستأجر</th><th className="n">عدد الأقساط</th><th className="n">المتأخر</th><th className="n">أقدم تأخير</th><th>آخر متابعة</th></tr></thead>
        <tbody>{groups.map((g) => { const f = last(g.tid); return (
          <tr key={g.tid}><td><Link href={`/tenants/${g.tid}`}>{a.T.get(g.tid)?.name}</Link></td><td className="n">{g.rs.length}</td><td className="n">{money(g.total)}</td>
            <td className="n">{Math.max(...g.rs.map((r) => r.daysLate))} يوماً</td><td>{f ? `${date(f.date)} — ${f.type}` : <Tag tone="bad">لا توجد</Tag>}</td></tr>); })}
          <tr className="tot"><td>الإجمالي</td><td className="n">{rows.length}</td><td className="n">{money(total)}</td><td></td><td></td></tr>
        </tbody></table></div></div>
      {rp.detail === 'detail' && <div className="card"><h2>التفصيل حسب القسط</h2><div className="tbl"><table>
        <thead><tr><th>العقار</th><th>الوحدة</th><th>المستأجر</th><th className="n">#</th><th>الفترة</th><th className="n">الاستحقاق</th><th className="n">القيمة</th><th className="n">المسدَّد</th><th className="n">المتبقي</th><th className="n">أيام التأخير</th></tr></thead>
        <tbody>{groups.flatMap((g) => g.rs).map((r) => (
          <tr key={r.id}><td>{r.propertyShort}</td><td><Link href={`/contracts/${r.contract_id}`}>{r.unitCode}</Link></td><td>{r.tenantName}</td><td className="n">{r.no}</td>
            <td className="n">{date(r.period_from)} – {date(r.period_to)}</td><td className="n">{date(r.due_date)}</td><td className="n">{money(r.amount)}</td>
            <td className="n">{r.paidTotal ? money(r.paidTotal) : '—'}</td><td className="n">{money(r.balance)}</td><td className="n">{r.daysLate}</td></tr>))}
          <tr className="tot"><td>الإجمالي</td><td></td><td></td><td></td><td></td><td></td><td className="n">{money(rows.reduce((x, r) => x + r.amount, 0))}</td>
            <td className="n">{money(rows.reduce((x, r) => x + r.paidTotal, 0))}</td><td className="n">{money(total)}</td><td></td></tr>
        </tbody></table></div></div>}
    </ReportFrame>
  );
}
