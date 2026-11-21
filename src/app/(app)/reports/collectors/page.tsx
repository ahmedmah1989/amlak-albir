import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi, Empty } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { money } from '@/lib/fmt';
import { parseReport, inRange, type SP } from '@/lib/report-params';

export default async function Collectors({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'month' });
  const names = [...new Set([...db.tenants.map((t) => t.collector).filter(Boolean), ...db.followups.filter((f) => inRange(f.date, rp.from, rp.to)).map((f) => f.created_by).filter(Boolean)])] as string[];
  const rows = names.map((n) => {
    const ts = a.tenantStats.filter((s) => s.t.collector === n), tids = new Set(ts.map((s) => s.t.id));
    const fus = db.followups.filter((f) => f.created_by === n && inRange(f.date, rp.from, rp.to));
    const coll = a.payments.filter((p) => tids.has(p.tenant_id) && inRange(p.paid_on, rp.from, rp.to)).reduce((x, p) => x + p.amount, 0);
    const recorded = a.payments.filter((p) => p.created_by === n && inRange(p.paid_on, rp.from, rp.to)).reduce((x, p) => x + p.amount, 0);
    return { n, tenants: ts.length, arrears: ts.reduce((x, s) => x + s.arrears, 0), coll, recorded, fus: fus.length, promises: fus.filter((f) => /وعد/.test(f.type + (f.details ?? ''))).length, noFollow: ts.filter((s) => s.arrears > 0 && !fus.some((f) => f.tenant_id === s.t.id)).length };
  }).sort((x, y) => y.arrears - x.arrears);
  const unassigned = a.tenantStats.filter((s) => s.arrears > 0 && !s.t.collector);
  return (
    <ReportFrame id="collectors" title="أداء موظفي التحصيل" sub="المستأجرون المسندون لكل موظف (من خطة التحصيل)، والمحصّل منهم في الفترة، والمتابعات التي سجّلها" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['period']}>
      <div className="kpis">
        <Kpi l="الموظفون" v={String(rows.length)} />
        <Kpi l="المحصّل من المسندين" v={money(rows.reduce((x, r) => x + r.coll, 0))} unit="ريال" tone="info" />
        <Kpi l="المتابعات في الفترة" v={String(rows.reduce((x, r) => x + r.fus, 0))} />
        <Kpi l="متأخرون بلا موظف مسند" v={String(unassigned.length)} tone={unassigned.length ? 'warn' : ''} s={unassigned.length ? money(unassigned.reduce((x, s) => x + s.arrears, 0)) + ' ريال' : undefined} />
      </div>
      {rows.length === 0 ? <Empty>لا يوجد موظفون مسندون ولا متابعات في الفترة. يُسند الموظف من خطة التحصيل (ميزة اختيارية).</Empty> : <div className="card"><div className="tbl"><table>
        <thead><tr><th>الموظف</th><th className="n">المستأجرون المسندون</th><th className="n">متأخراتهم الحالية</th><th className="n">المحصّل منهم</th><th className="n">سندات سجّلها</th><th className="n">المتابعات</th><th className="n">وعود سداد</th><th className="n">متأخرون بلا متابعة في الفترة</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.n}><td>{r.n}</td><td className="n">{r.tenants}</td><td className="n">{money(r.arrears)}</td><td className="n">{money(r.coll)}</td><td className="n">{money(r.recorded)}</td><td className="n">{r.fus}</td><td className="n">{r.promises}</td><td className="n">{r.noFollow || '—'}</td></tr>)}</tbody></table></div></div>}
      {unassigned.length > 0 && <div className="card"><h2>متأخرون بدون موظف مسند</h2><ul className="list">{unassigned.map((s) => <li key={s.t.id}><Link href={`/tenants/${s.t.id}`}>{s.t.name}</Link><b className="n">{money(s.arrears)}</b></li>)}</ul></div>}
    </ReportFrame>
  );
}
