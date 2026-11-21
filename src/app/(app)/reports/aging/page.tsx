import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import { money } from '@/lib/fmt';
import { tafqit } from '@/lib/tafqit';
const B: [string, number, number][] = [['1-30', 1, 30], ['31-90', 31, 90], ['91-180', 91, 180], ['181-365', 181, 365], ['أكثر من 365', 366, 1e9]];
export default async function Aging({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { orient: 'l' });
  const ok = (r: (typeof a.rows)[number]) => r.status === 'overdue' && (!rp.props.length || rp.props.includes(r.contract.property_id)) && (!rp.tenant || r.contract.tenant_id === rp.tenant);
  const ts = a.tenantStats.map((t) => { const rs = t.rows.filter(ok); return { t, arrears: rs.reduce((x, r) => x + r.balance, 0), b: B.map(([, lo, hi]) => rs.filter((r) => r.daysLate >= lo && r.daysLate <= hi).reduce((x, r) => x + r.balance, 0)) }; })
    .filter((x) => x.arrears > 0).sort((x, y) => y.arrears - x.arrears);
  const totalAll = ts.reduce((x, r) => x + r.arrears, 0);
  const tot = B.map((_, i) => ts.reduce((x, r) => x + r.b[i], 0));
  return (
    <ReportFrame id="aging" title="تقرير أعمار الديون" sub={`المتأخرات موزعة على أعمارها بعد مهلة السداد (${a.grace} أيام)`} sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['property', 'tenant']} xl={{ r: 'aging' }}>
      <div className="kpis">{B.slice(0, 4).map(([l], i) => <Kpi key={l} tone={i > 1 ? 'bad' : 'warn'} l={`${l} يوماً`} v={money(tot[i])} unit="ريال" s={`${totalAll ? Math.round((tot[i] / totalAll) * 100) : 0}%`} />)}</div>
      <div className="card"><div className="tbl"><table><thead><tr><th>المستأجر</th>{B.map(([l]) => <th key={l} className="n">{l}</th>)}<th className="n">الإجمالي</th></tr></thead>
        <tbody>{ts.map(({ t, b, arrears }) => <tr key={t.t.id}><td><Link href={`/tenants/${t.t.id}`}>{t.t.name}</Link></td>{b.map((v, i) => <td key={i} className="n">{v ? money(v) : '—'}</td>)}<td className="n"><b>{money(arrears)}</b></td></tr>)}
          <tr className="tot"><td>الإجمالي</td>{tot.map((v, i) => <td key={i} className="n">{money(v)}</td>)}<td className="n">{money(totalAll)}</td></tr></tbody></table></div>
        <p className="muted">{tafqit(totalAll)}</p></div>
    </ReportFrame>
  );
}
