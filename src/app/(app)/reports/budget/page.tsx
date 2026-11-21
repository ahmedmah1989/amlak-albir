import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Empty } from '@/components/ui';
import { saveBudget } from '@/lib/actions4';
import { money, pct } from '@/lib/fmt';

export default async function Budget({ searchParams }: { searchParams: { y?: string } }) {
  const { db, a, org, asOf, isAdmin, user } = await ctx();
  const rp = parseReport(searchParams, asOf);
  if (!db.meta.features.accounting) return <Page title="الموازنة مقابل الفعلي" org={org} asOf={asOf}><Empty>الميزة غير مفعّلة. فعّلها من الإدارة ← الميزات.</Empty></Page>;
  const y = Number(searchParams.y ?? asOf.slice(0, 4)), ys = String(y);
  const rows = db.properties.map((p) => {
    const b = db.budgets.find((x) => x.property_id === p.id && x.year === y);
    const due = a.rows.filter((r) => r.contract.property_id === p.id && r.due_date.startsWith(ys)).reduce((x, r) => x + r.amount, 0);
    const coll = a.payments.filter((x) => x.contract_id && a.C.get(x.contract_id)?.property_id === p.id && x.paid_on.startsWith(ys)).reduce((x, z) => x + z.amount, 0);
    const exp = db.expenses.filter((e) => e.property_id === p.id && e.date.startsWith(ys)).reduce((x, e) => x + e.amount, 0);
    return { p, b, due, coll, exp };
  });
  const T = (f: (r: (typeof rows)[number]) => number) => rows.reduce((x, r) => x + f(r), 0);
  const var_ = (act: number, bud?: number | null) => bud ? <span className={act >= bud ? 'ok' : 'bad'}>{pct((act / bud) * 100)}</span> : '—';
  return (
    <ReportFrame id="budget" title={`الموازنة مقابل الفعلي — ${y}`} sub="المستحق حسب الجداول، والمحصّل بالسندات، والمصروفات المسجلة" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={[]}>
      <div className="filters"><Link href={`?y=${y - 1}`}>{y - 1}</Link><Link href={`?y=${y}`} className="on">{y}</Link><Link href={`?y=${y + 1}`}>{y + 1}</Link></div>
      <div className="card"><div className="tbl"><table><thead><tr><th>العقار</th><th className="n">موازنة الإيرادات</th><th className="n">المستحق</th><th className="n">المحصّل</th><th className="n">تحقق الموازنة</th><th className="n">موازنة المصروفات</th><th className="n">المصروفات الفعلية</th><th className="n">الصرف من الموازنة</th><th className="n">صافي الفعلي</th></tr></thead>
        <tbody>{rows.map(({ p, b, due, coll, exp }) => <tr key={p.id}><td>{p.short}</td><td className="n">{money(b?.revenue)}</td><td className="n">{money(due)}</td><td className="n">{money(coll)}</td><td className="n">{var_(coll, b?.revenue)}</td>
          <td className="n">{money(b?.expenses)}</td><td className="n">{money(exp)}</td><td className="n">{b?.expenses ? pct((exp / b.expenses) * 100) : '—'}</td><td className="n">{money(coll - exp)}</td></tr>)}
          <tr className="tot"><td>الإجمالي</td><td className="n">{money(T((r) => r.b?.revenue ?? 0))}</td><td className="n">{money(T((r) => r.due))}</td><td className="n">{money(T((r) => r.coll))}</td><td></td><td className="n">{money(T((r) => r.b?.expenses ?? 0))}</td><td className="n">{money(T((r) => r.exp))}</td><td></td><td className="n">{money(T((r) => r.coll - r.exp))}</td></tr></tbody></table></div></div>
      {isAdmin && <details className="box noprint"><summary>إدخال موازنة {y}</summary><div className="in"><form action={saveBudget} className="frm"><input type="hidden" name="year" value={y} />
        <div className="tbl"><table><thead><tr><th>العقار</th><th>موازنة الإيرادات</th><th>موازنة المصروفات</th></tr></thead><tbody>{rows.map(({ p, b }) => <tr key={p.id}><td>{p.short}</td>
          <td><input type="number" name={'rev_' + p.id} defaultValue={b?.revenue ?? ''} min="0" /></td><td><input type="number" name={'exp_' + p.id} defaultValue={b?.expenses ?? ''} min="0" /></td></tr>)}</tbody></table></div>
        <div className="fa"><button className="btn" type="submit">حفظ الموازنة</button></div></form></div></details>}
    </ReportFrame>
  );
}
