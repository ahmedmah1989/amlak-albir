import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi } from '@/components/ui';
import ReportFrame, { Delta } from '@/components/ReportFrame';
import { money } from '@/lib/fmt';
import { parseReport, inRange, type SP } from '@/lib/report-params';
import { addMonths } from '@/lib/calc';

const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const ml = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const GROUPS: [string, string][] = [['due', 'المستحق (أساس الاستحقاق)'], ['collected', 'المحصّل بسندات (أساس النقدي)']];
export default async function Revenue({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'year', group: 'due' });
  const months: string[] = []; for (let m = rp.from.slice(0, 7); m <= rp.to.slice(0, 7) && months.length < 36; m = addMonths(m + '-01', 1).slice(0, 7)) months.push(m);
  const props = db.properties.filter((p) => !rp.props.length || rp.props.includes(p.id));
  const val = (pid: string, from: string, to: string, m?: string) => rp.group === 'collected'
    ? a.payments.filter((p) => a.payProp(p) === pid && inRange(p.paid_on, from, to) && (!m || p.paid_on.startsWith(m))).reduce((n, p) => n + p.amount, 0)
    : a.rows.filter((r) => r.contract.property_id === pid && inRange(r.due_date, from, to) && (!m || r.due_date.startsWith(m))).reduce((n, r) => n + r.amount, 0);
  const grid = props.map((p) => ({ p, cells: months.map((m) => val(p.id, rp.from, rp.to, m)), total: val(p.id, rp.from, rp.to), prev: rp.cFrom ? val(p.id, rp.cFrom, rp.cTo!) : null }));
  const colT = months.map((_, i) => grid.reduce((n, g) => n + g.cells[i], 0)), all = grid.reduce((n, g) => n + g.total, 0), prevAll = rp.cFrom ? grid.reduce((n, g) => n + (g.prev ?? 0), 0) : null;
  const best = months.length ? months[colT.indexOf(Math.max(...colT))] : null;
  return (
    <ReportFrame id="revenue" title="الإيرادات الشهرية حسب العقار" sub={rp.group === 'collected' ? 'المحصّل بسندات القبض حسب تاريخ السند' : 'المستحق حسب تاريخ استحقاق القسط (إيجار وخدمات وغرامات)'} sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id}
      params={['period', 'compare', 'property', 'group']} groups={GROUPS}>
      <div className="kpis">
        <Kpi l={rp.group === 'collected' ? 'إجمالي المحصّل' : 'إجمالي المستحق'} v={money(all)} unit="ريال" tone="info" />
        <Kpi l="متوسط الشهر" v={money(months.length ? all / months.length : 0)} unit="ريال" s={`${months.length} شهراً`} />
        <Kpi l="أعلى شهر" v={best ? ml(best) : '—'} s={best ? money(Math.max(...colT)) + ' ريال' : undefined} />
        {prevAll != null ? <Kpi l="مقارنة بفترة المقارنة" v={money(prevAll)} unit="ريال" s={`التغير: ${all - prevAll >= 0 ? '+' : '−'}${money(Math.abs(all - prevAll))}`} tone={all >= prevAll ? '' : 'bad'} /> : <Kpi l="عدد العقارات" v={String(props.length)} />}
      </div>
      <div className="card"><div className="tbl"><table className="matrix">
        <thead><tr><th>العقار</th>{months.map((m) => <th key={m} className="n">{ml(m)}</th>)}<th className="n">الإجمالي</th>{rp.cFrom && <th className="n">المقارنة</th>}</tr></thead>
        <tbody>{grid.map((g) => <tr key={g.p.id}><td><Link href={`/properties/${g.p.id}`}>{g.p.short}</Link></td>{g.cells.map((v, i) => <td key={i} className="n">{v ? money(v) : '—'}</td>)}<td className="n"><b>{money(g.total)}</b></td>{rp.cFrom && <td className="n"><Delta cur={g.total} prev={g.prev} money={money} /></td>}</tr>)}
          <tr className="tot"><td>الإجمالي</td>{colT.map((v, i) => <td key={i} className="n">{money(v)}</td>)}<td className="n">{money(all)}</td>{rp.cFrom && <td className="n"><Delta cur={all} prev={prevAll} money={money} /></td>}</tr></tbody></table></div></div>
    </ReportFrame>
  );
}
