import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi, Tag } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import { money, date, hijri } from '@/lib/fmt';

export default async function Renewals({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport({ days: searchParams.d, ...searchParams }, asOf, { days: 365 });
  const lim = rp.days;
  const rs = a.renewals.filter((r) => r.days <= lim && (!rp.props.length || rp.props.includes(r.c.property_id)));
  return (
    <ReportFrame id="renewals" title="تقرير التجديدات والعقود المنتهية" sub="مواعيد الانتهاء وبدء التفاوض (قبل النهاية بثلاثة أشهر) والمتأخرات القائمة على كل عقد" org={org} asOf={asOf} sp={searchParams} rp={rp} db={db} userId={user.id} params={['days', 'property']} xl={{ r: 'renewals' }}>
      <div className="kpis">
        <Kpi l="عدد العقود" v={String(rs.length)} tone="info" />
        <Kpi l="إيجارها السنوي" v={money(rs.reduce((x, r) => x + r.c.annual_rent, 0))} unit="ريال" s={`${Math.round((rs.reduce((x, r) => x + r.c.annual_rent, 0) / (a.annualRent || 1)) * 100)}% من الدخل الحالي`} tone="warn" />
        <Kpi l="متأخرات قائمة عليها" v={money(rs.reduce((x, r) => x + r.arrears + r.pending, 0))} unit="ريال" s={`مؤكد ${money(rs.reduce((x, r) => x + r.arrears, 0))} + يحتاج تأكيداً ${money(rs.reduce((x, r) => x + r.pending, 0))}`} tone="bad" />
      </div>
      <div className="card"><div className="tbl"><table>
        <thead><tr><th>العقار</th><th>الوحدة</th><th>المستأجر</th><th className="n">نهاية العقد</th><th className="n">هجري</th><th className="n">الأيام المتبقية</th><th className="n">الإيجار السنوي</th><th className="n">بدء التفاوض</th><th className="n">متأخر مؤكد</th><th className="n">يحتاج تأكيداً</th></tr></thead>
        <tbody>{rs.map((r) => (
          <tr key={r.c.id}><td>{r.prop.short}</td><td><Link href={`/contracts/${r.c.id}`}>{r.unitCode}</Link></td><td><Link href={`/tenants/${r.c.tenant_id}`}>{r.tenantName}</Link></td>
            <td className="n">{date(r.c.end_date)}</td><td className="n">{hijri(r.c.end_date)}</td>
            <td className="n"><Tag tone={r.days <= 120 ? 'bad' : r.days <= 240 ? 'warn' : 'info'}>{r.days}</Tag></td>
            <td className="n">{money(r.c.annual_rent)}</td><td className="n">{r.negotiate <= asOf ? <Tag tone="bad">حان — {date(r.negotiate)}</Tag> : date(r.negotiate)}</td>
            <td className="n">{r.arrears ? money(r.arrears) : '—'}</td><td className="n">{r.pending ? money(r.pending) : '—'}</td></tr>))}
          <tr className="tot"><td>الإجمالي</td><td></td><td></td><td></td><td></td><td></td><td className="n">{money(rs.reduce((x, r) => x + r.c.annual_rent, 0))}</td><td></td>
            <td className="n">{money(rs.reduce((x, r) => x + r.arrears, 0))}</td><td className="n">{money(rs.reduce((x, r) => x + r.pending, 0))}</td></tr>
        </tbody></table></div>
        <p className="note">يُنصح بربط أي تجديد بسداد المتأخرات القائمة على العقد أو جدولتها باتفاق موقّع.</p></div>
    </ReportFrame>
  );
}
