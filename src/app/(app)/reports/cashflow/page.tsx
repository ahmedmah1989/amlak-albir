import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, XL, Empty } from '@/components/ui';
import { InstStat } from '@/components/InstallmentBoard';
import { money, date, pct } from '@/lib/fmt';

const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const ml = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export default async function Cashflow({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf);
  const total = a.forecast.reduce((x, f) => x + f.amount, 0), arrears = a.arrearsTotal;
  const due12 = a.series.reduce((x, m) => x + m.due, 0), coll12 = a.series.reduce((x, m) => x + m.collected, 0);
  return (
    <ReportFrame id="cashflow" title="التحصيل والتدفق المتوقع" sub="الماضي: المستحق مقابل المحصّل • القادم: الأقساط المفتوحة حسب شهر الاستحقاق" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={[]} xl={{ r: 'cashflow' }}>
      {a.gaps.length > 0 && <p className="note warn noprint">{a.gaps.length} عقود سارية جدولها لا يصل لنهاية العقد؛ التوقع ناقص بمقدار {money(a.gaps.reduce((x, g) => x + g.missing.reduce((s, i) => s + i.amount, 0), 0))} ريال. <Link href="/contracts">استكمال الجداول</Link></p>}
      <div className="kpis">
        <Kpi tone="info" l="نسبة التحصيل الإجمالية" v={a.collRate == null ? '—' : pct(a.collRate)} s="ما سُدد من كل الأقساط المستحقة حتى اليوم" />
        <Kpi l={`نسبة التحصيل ${a.year}`} v={a.collRateYear == null ? '—' : pct(a.collRateYear)} />
        <Kpi tone="bad" l="متأخرات قائمة" v={money(arrears)} unit="ريال" href="/reports/arrears" />
        <Kpi tone="hero" l="المتوقع خلال 12 شهراً" v={money(total)} unit="ريال" s={`${a.forecast.reduce((x, f) => x + f.count, 0)} قسطاً`} />
      </div>
      <div className="card"><h2>آخر 12 شهراً</h2><div className="tbl"><table>
        <thead><tr><th>الشهر</th><th className="n">المستحق بالجدول</th><th className="n">المحصّل بسندات</th><th className="n">الفرق</th><th className="n">محصّل نفس الشهر العام السابق</th><th className="n">التغير</th></tr></thead>
        <tbody>{a.series.map((m) => <tr key={m.m}><td>{ml(m.m)}</td><td className="n">{money(m.due)}</td><td className="n">{money(m.collected)}</td><td className={'n ' + (m.collected < m.due ? 'bad' : 'ok')}>{money(m.collected - m.due)}</td><td className="n">{money(m.prevCollected)}</td><td className="n">{m.prevCollected ? pct(((m.collected - m.prevCollected) / m.prevCollected) * 100) : '—'}</td></tr>)}
          <tr className="tot"><td>الإجمالي</td><td className="n">{money(due12)}</td><td className="n">{money(coll12)}</td><td className="n">{money(coll12 - due12)}</td><td className="n">{money(a.series.reduce((x, m) => x + m.prevCollected, 0))}</td><td></td></tr></tbody></table></div>
        <p className="muted">المحصّل يشمل السندات المسجلة في البرنامج فقط؛ السداد المسجل كرصيد افتتاحي لا يحمل تاريخاً فلا يظهر هنا.</p></div>
      <div className="card"><h2>المتوقع تحصيله حسب الشهر</h2>
        {total === 0 ? <Empty>لا توجد أقساط مفتوحة قادمة.</Empty> : a.forecast.filter((f) => f.count).map((f) => <details key={f.m} className="box"><summary><b>{ml(f.m)}</b> — {f.count} أقساط — <b>{money(f.amount)}</b> ريال</summary><div className="in"><div className="tbl"><table>
          <thead><tr><th className="n">الاستحقاق</th><th>المستأجر</th><th>العقار / الوحدة</th><th className="n">#</th><th className="n">القيمة</th><th className="n">المتبقي</th><th>الحالة</th></tr></thead>
          <tbody>{f.rows.sort((x, y) => x.due_date.localeCompare(y.due_date)).map((r) => <tr key={r.id}><td className="n"><Link href={`/installments/${r.id}`}>{date(r.due_date)}</Link></td><td><Link href={`/tenants/${r.contract.tenant_id}`}>{r.tenantName}</Link></td>
            <td>{r.propertyShort} — {r.unitCode}</td><td className="n">{r.no}</td><td className="n">{money(r.amount)}</td><td className="n">{money(r.balance)}</td><td><InstStat r={r} /></td></tr>)}</tbody></table></div></div></details>)}
      </div>
    </ReportFrame>
  );
}
