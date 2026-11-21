import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, XL } from '@/components/ui';
import { Prog } from '@/components/InstallmentBoard';
import { money, pct } from '@/lib/fmt';
import { grade } from '@/lib/score';

export default async function TenantScore({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf);
  const ts = a.tenantStats.filter((s) => s.collRate != null).map((s) => ({ s, g: grade(s.collRate, s.avgDelay, s.maxLate) }))
    .sort((x, y) => x.g.localeCompare(y.g) || (y.s.collRate ?? 0) - (x.s.collRate ?? 0));
  const cnt = (g: string) => ts.filter((x) => x.g === g).length;
  return (
    <ReportFrame id="tenant-score" title="تصنيف المستأجرين حسب الانتظام" sub="نسبة السداد من المستحق، ومتوسط أيام التأخر، وأقدم تأخير قائم" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={[]} xl={{ r: 'tenantscore' }}>
      <div className="kpis"><div className="kpi"><div className="l">A منتظم</div><div className="v">{cnt('A')}</div></div><div className="kpi"><div className="l">B تأخر بسيط</div><div className="v">{cnt('B')}</div></div>
        <div className="kpi"><div className="l">C متأخر</div><div className="v">{cnt('C')}</div></div><div className="kpi bad"><div className="l">D متعثر</div><div className="v">{cnt('D')}</div></div></div>
      <div className="card"><div className="tbl"><table><thead><tr><th>التصنيف</th><th>المستأجر</th><th>نسبة السداد</th><th className="n">متوسط التأخر</th><th className="n">أقدم تأخير قائم</th><th className="n">متأخر مؤكد</th><th className="n">الإيجار السنوي</th></tr></thead>
        <tbody>{ts.map(({ s, g }) => <tr key={s.t.id}><td><span className={`score ${g}`}>{g}</span></td><td><Link href={`/tenants/${s.t.id}`}>{s.t.name}</Link></td>
          <td><span className="complete"><Prog pct={s.collRate ?? 0} /> {pct(s.collRate ?? 0)}</span></td><td className="n">{s.avgDelay == null ? '—' : `${s.avgDelay} يوماً`}</td>
          <td className="n">{s.maxLate ? `${s.maxLate} يوماً` : '—'}</td><td className="n">{s.arrears ? money(s.arrears) : '—'}</td><td className="n">{money(s.activeContracts.reduce((x, c) => x + c.annual_rent, 0))}</td></tr>)}</tbody></table></div>
        <p className="muted">A: سداد ≥98% ومتوسط تأخر ≤15 يوماً ولا تأخير قائم • B: ≥90% ومتوسط ≤45 وأقدم تأخير ≤60 • C: ≥75% وأقدم تأخير ≤180 • D: ما عدا ذلك.</p></div>
    </ReportFrame>
  );
}
