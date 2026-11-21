import { ctx } from '@/lib/ctx';
import { Kpi } from '@/components/ui';
import ReportFrame, { Delta } from '@/components/ReportFrame';
import { money, date } from '@/lib/fmt';
import { parseReport, inRange, type SP } from '@/lib/report-params';

const GROUPS: [string, string][] = [['category', 'البند'], ['property', 'العقار'], ['vendor', 'المورد'], ['month', 'الشهر']];
export default async function ExpensesReport({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'ytd', group: 'category' });
  const pick = (from: string, to: string) => db.expenses.filter((e) => inRange(e.date, from, to) && (!rp.props.length || rp.props.includes(e.property_id)));
  const es = pick(rp.from, rp.to), ces = rp.cFrom ? pick(rp.cFrom, rp.cTo!) : null;
  const k = (e: (typeof es)[number]) => rp.group === 'property' ? a.P.get(e.property_id)?.short ?? '—' : rp.group === 'vendor' ? e.vendor || 'بدون مورد' : rp.group === 'month' ? e.date.slice(0, 7) : e.category;
  const agg = (xs: typeof es) => { const m = new Map<string, number>(); xs.forEach((e) => m.set(k(e), (m.get(k(e)) ?? 0) + e.amount)); return m; };
  const g = agg(es), cg = ces ? agg(ces) : null, total = es.reduce((n, e) => n + e.amount, 0), cTotal = ces ? ces.reduce((n, e) => n + e.amount, 0) : null;
  const entries = [...g.entries()].sort((x, y) => rp.group === 'month' ? x[0].localeCompare(y[0]) : y[1] - x[1]);
  const label = GROUPS.find((x) => x[0] === rp.group)?.[1] ?? 'البند';
  return (
    <ReportFrame id="expenses" title="المصروفات حسب البند" sub="المصروفات المسجلة على العقارات في الفترة" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id}
      params={['period', 'compare', 'property', 'group', 'detail']} groups={GROUPS} xl={{ r: 'expenses', q: rp.props[0] ? `&p=${rp.props[0]}` : '' }}>
      <div className="kpis">
        <Kpi l="إجمالي المصروفات" v={money(total)} unit="ريال" tone="bad" s={`${es.length} قيداً`} />
        <Kpi l={`أكبر ${label}`} v={entries[0]?.[0] ?? '—'} s={entries[0] ? money(entries[0][1]) + ' ريال' : undefined} />
        <Kpi l="عدد البنود" v={String(entries.length)} />
        {cTotal != null ? <Kpi l="فترة المقارنة" v={money(cTotal)} unit="ريال" s={`التغير ${total - cTotal >= 0 ? '+' : '−'}${money(Math.abs(total - cTotal))}`} tone={total > cTotal ? 'warn' : ''} /> : <Kpi l="متوسط القيد" v={money(es.length ? total / es.length : 0)} unit="ريال" />}
      </div>
      <div className="card"><h2>حسب {label}</h2><div className="tbl"><table>
        <thead><tr><th>{label}</th><th className="n">المبلغ</th><th className="n">النسبة</th>{cg && <><th className="n">المقارنة</th><th className="n">التغير</th></>}</tr></thead>
        <tbody>{entries.map(([kk, v]) => <tr key={kk}><td>{kk}</td><td className="n">{money(v)}</td><td className="n">{total ? ((v / total) * 100).toFixed(1) : 0}%</td>{cg && <><td className="n">{money(cg.get(kk) ?? 0)}</td><td className="n"><Delta cur={v} prev={cg.get(kk) ?? 0} money={money} invert /></td></>}</tr>)}
          <tr className="tot"><td>الإجمالي</td><td className="n">{money(total)}</td><td className="n">100%</td>{cg && <><td className="n">{money(cTotal)}</td><td className="n"><Delta cur={total} prev={cTotal} money={money} invert /></td></>}</tr></tbody></table></div></div>
      {rp.detail === 'detail' && <div className="card"><h2>القيود ({es.length})</h2><div className="tbl"><table>
        <thead><tr><th className="n">التاريخ</th><th>العقار</th><th>البند</th><th>المورد</th><th>المرجع</th><th>الوصف</th><th className="n">المبلغ</th></tr></thead>
        <tbody>{es.map((e) => <tr key={e.id}><td className="n">{date(e.date)}</td><td>{a.P.get(e.property_id)?.short}</td><td>{e.category}</td><td>{e.vendor ?? '—'}</td><td>{e.ref ?? '—'}</td><td>{e.description ?? ''}</td><td className="n">{money(e.amount)}</td></tr>)}</tbody></table></div></div>}
    </ReportFrame>
  );
}
