import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import { ctx } from '@/lib/ctx';
import { Page, Empty, XL } from '@/components/ui';
import { journal } from '@/lib/accounting';
import { money, date } from '@/lib/fmt';

export default async function Journal({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'month' });
  if (!db.meta.features.accounting) return <Page title="القيود اليومية" org={org} asOf={asOf}><Empty>الميزة غير مفعّلة. فعّلها من الإدارة ← الميزات.</Empty></Page>;
  const from = rp.from, to = rp.to;
  const j = journal(db, a, from, to);
  return (
    <ReportFrame id="journal" title="القيود اليومية للإيجارات" sub="أساس الاستحقاق: القسط يُثبت إيراداً في تاريخ استحقاقه، والسند يُقفل الذمة في تاريخ استلامه" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['period']} xl={{ r: 'journal', q: `&from=${from}&to=${to}` }}>
      <div className="card"><h2>ملخص الحسابات</h2><div className="tbl"><table><thead><tr><th>الحساب</th><th className="n">مدين</th><th className="n">دائن</th><th className="n">الصافي</th></tr></thead>
        <tbody>{j.byAcc.map(([k, v]) => <tr key={k}><td>{k}</td><td className="n">{money(v.debit)}</td><td className="n">{money(v.credit)}</td><td className="n">{money(v.debit - v.credit)}</td></tr>)}
          <tr className="tot"><td>الإجمالي {j.debit === j.credit ? '✓ متوازن' : '✗ غير متوازن'}</td><td className="n">{money(j.debit)}</td><td className="n">{money(j.credit)}</td><td></td></tr></tbody></table></div></div>
      <div className="card"><h2>القيود ({j.lines.length} سطراً)</h2>{!j.lines.length ? <Empty>لا توجد حركات في الفترة.</Empty> : <div className="tbl"><table><thead><tr><th className="n">التاريخ</th><th>المرجع</th><th>الحساب</th><th>البيان</th><th>المستأجر</th><th className="n">مدين</th><th className="n">دائن</th></tr></thead>
        <tbody>{j.lines.map((l, i) => <tr key={i}><td className="n">{date(l.date)}</td><td>{l.ref}</td><td>{l.account}</td><td className="muted">{l.desc}</td><td>{l.tenant}</td><td className="n">{l.debit ? money(l.debit) : ''}</td><td className="n">{l.credit ? money(l.credit) : ''}</td></tr>)}</tbody></table></div>}</div>
      <p className="muted">أسماء الحسابات قابلة للربط بدليل حسابات برنامج المحاسبة عند الاستيراد من ملف الإكسل.</p>
    </ReportFrame>
  );
}
