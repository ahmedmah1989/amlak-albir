import ReportFrame, { Delta } from '@/components/ReportFrame';
import { parseReport, inRange, type SP } from '@/lib/report-params';
import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, XL } from '@/components/ui';
import { money, pct } from '@/lib/fmt';

export default async function Performance({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport({ pr: searchParams.y ? undefined : searchParams.pr, from: searchParams.y ? `${searchParams.y}-01-01` : searchParams.from, to: searchParams.y ? `${searchParams.y}-12-31` : searchParams.to, ...searchParams }, asOf, { preset: 'year' });
  const y = rp.label;
  const calc = (pid: string, from: string, to: string) => {
    const due = a.rows.filter((r) => r.contract.property_id === pid && inRange(r.due_date, from, to));
    const dueAmt = due.reduce((x, r) => x + r.amount, 0), collected = due.reduce((x, r) => x + r.paidTotal, 0);
    const exp = db.expenses.filter((e) => e.property_id === pid && inRange(e.date, from, to)).reduce((x, e) => x + e.amount, 0);
    return { dueAmt, collected, open: due.reduce((x, r) => x + r.balance, 0), exp, net: collected - exp };
  };
  const rows = a.propStats.filter((s) => !rp.props.length || rp.props.includes(s.p.id)).map((s) => ({ s, ...calc(s.p.id, rp.from, rp.to), prevNet: rp.cFrom ? calc(s.p.id, rp.cFrom, rp.cTo!).net : null }));
  const bvT = rows.reduce((x, r) => x + r.s.bv, 0), rentT = rows.reduce((x, r) => x + r.s.rent, 0);
  const T = (k: 'dueAmt' | 'collected' | 'open' | 'exp' | 'net') => rows.reduce((x, r) => x + r[k], 0);
  return (
    <ReportFrame id="performance" title="أداء العقارات والعائد" sub="المستحق والمحصّل من أقساط الفترة، والمصروفات، وصافي الدخل والعائد على القيمة الحالية" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['period', 'compare', 'property']} xl={{ r: 'performance', q: `&y=${rp.from.slice(0, 4)}` }}>
      <div className="card"><div className="tbl"><table>
        <thead><tr><th>العقار</th><th className="n">القيمة الدفترية</th><th className="n">الإيجار السنوي الحالي</th><th className="n">المستحق في الفترة</th><th className="n">محصّل منه</th><th className="n">غير مسدد</th><th className="n">نسبة التحصيل</th><th className="n">المصروفات</th><th className="n">صافي الدخل</th><th className="n">العائد الصافي</th></tr></thead>
        <tbody>{rows.map((r) => (<tr key={r.s.p.id}><td><Link href={`/properties/${r.s.p.id}`}>{r.s.p.name}</Link>{r.s.idle && <> <Tag tone="bad">بلا دخل</Tag></>}</td>
          <td className="n">{r.s.bv ? money(r.s.bv) : '—'}</td><td className="n">{money(r.s.rent)}</td><td className="n">{money(r.dueAmt)}</td><td className="n">{money(r.collected)}</td>
          <td className="n">{r.open ? money(r.open) : '—'}</td><td className="n">{r.dueAmt ? pct((r.collected / r.dueAmt) * 100) : '—'}</td><td className="n">{money(r.exp)}</td>
          <td className="n">{money(r.net)}{r.prevNet != null && <div className="cell-sub"><Delta cur={r.net} prev={r.prevNet} money={money} /></div>}</td><td className="n">{r.s.bv ? pct((r.net / r.s.bv) * 100) : '—'}</td></tr>))}
          <tr className="tot"><td>الإجمالي</td><td className="n">{money(bvT)}</td><td className="n">{money(rentT)}</td><td className="n">{money(T('dueAmt'))}</td><td className="n">{money(T('collected'))}</td>
            <td className="n">{money(T('open'))}</td><td className="n">{T('dueAmt') ? pct((T('collected') / T('dueAmt')) * 100) : '—'}</td><td className="n">{money(T('exp'))}</td>
            <td className="n">{money(T('net'))}</td><td className="n">{bvT ? pct((T('net') / bvT) * 100) : '—'}</td></tr>
        </tbody></table></div>
        <p className="note">المحصّل يشمل الرصيد الافتتاحي (المسدد حسب الملف الأصلي) والسندات المسجلة في النظام. الأقساط ذات الجدول الخاص غير المدرجة في الملف لا تظهر في المستحق.</p></div>
    </ReportFrame>
  );
}
