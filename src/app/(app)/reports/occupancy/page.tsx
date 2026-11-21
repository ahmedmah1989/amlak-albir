import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi, Tag } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { money, date } from '@/lib/fmt';
import { parseReport, type SP } from '@/lib/report-params';
import { daysBetween } from '@/lib/calc';

export default async function Occupancy({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { detail: 'summary' });
  const units = db.units.filter((u) => u.kind === 'lease' && (!rp.props.length || rp.props.includes(u.property_id)));
  const info = units.map((u) => {
    const cs = db.contracts.filter((c) => c.unit_id === u.id).sort((x, y) => y.end_date.localeCompare(x.end_date));
    const cur = cs.find((c) => c.status === 'active'), last = cs[0];
    const vacant = !cur, days = vacant && last ? Math.max(0, daysBetween(last.end_date, asOf)) : null;
    const refRent = cur?.annual_rent ?? last?.annual_rent ?? (u.monthly_rent ? u.monthly_rent * 12 : null);
    return { u, cur, last, vacant, days, refRent, lost: vacant && refRent && days != null ? (refRent / 365) * days : 0 };
  });
  const byP = db.properties.filter((p) => info.some((x) => x.u.property_id === p.id)).map((p) => {
    const xs = info.filter((x) => x.u.property_id === p.id), leased = xs.filter((x) => !x.vacant).length;
    return { p, total: xs.length, leased, vacant: xs.length - leased, pct: xs.length ? (leased / xs.length) * 100 : 0, rent: xs.reduce((n, x) => n + (x.cur?.annual_rent ?? 0), 0), potential: xs.reduce((n, x) => n + (x.refRent ?? 0), 0), lost: xs.reduce((n, x) => n + x.lost, 0) };
  });
  const T = { total: info.length, leased: info.filter((x) => !x.vacant).length, rent: byP.reduce((n, x) => n + x.rent, 0), potential: byP.reduce((n, x) => n + x.potential, 0), lost: byP.reduce((n, x) => n + x.lost, 0) };
  const vac = info.filter((x) => x.vacant).sort((x, y) => (y.days ?? 0) - (x.days ?? 0));
  return (
    <ReportFrame id="occupancy" title="تقرير الإشغال والشواغر" sub="الإشغال = الوحدات بعقد ساري ÷ كل وحدات التأجير. الإيجار الضائع = آخر إيجار للوحدة ÷ 365 × أيام الشغور (تقديري)" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['property', 'detail']}>
      <div className="kpis">
        <Kpi l="نسبة الإشغال" v={T.total ? `${Math.round((T.leased / T.total) * 100)}%` : '—'} s={`${T.leased} من ${T.total} وحدة`} tone="info" />
        <Kpi l="الوحدات الشاغرة" v={String(T.total - T.leased)} tone={T.total - T.leased ? 'warn' : ''} />
        <Kpi l="الإيجار السنوي الفعلي" v={money(T.rent)} unit="ريال" s={T.potential ? `${Math.round((T.rent / T.potential) * 100)}% من الإيجار الممكن ${money(T.potential)}` : undefined} />
        <Kpi l="الإيجار الضائع التقديري" v={money(T.lost)} unit="ريال" tone="bad" s="منذ انتهاء آخر عقد لكل وحدة شاغرة" />
      </div>
      <div className="card"><h2>الإشغال حسب العقار</h2><div className="tbl"><table>
        <thead><tr><th>العقار</th><th className="n">الوحدات</th><th className="n">المؤجرة</th><th className="n">الشاغرة</th><th className="n">الإشغال</th><th className="n">الإيجار الفعلي</th><th className="n">الإيجار الممكن</th><th className="n">الضائع التقديري</th></tr></thead>
        <tbody>{byP.map((x) => <tr key={x.p.id}><td><Link href={`/units?p=${x.p.id}`}>{x.p.name}</Link></td><td className="n">{x.total}</td><td className="n">{x.leased}</td><td className="n">{x.vacant}</td>
          <td className="n"><Tag tone={x.pct >= 90 ? 'ok' : x.pct >= 70 ? 'warn' : 'bad'}>{Math.round(x.pct)}%</Tag></td><td className="n">{money(x.rent)}</td><td className="n">{money(x.potential)}</td><td className="n">{x.lost ? money(x.lost) : '—'}</td></tr>)}
          <tr className="tot"><td>الإجمالي</td><td className="n">{T.total}</td><td className="n">{T.leased}</td><td className="n">{T.total - T.leased}</td><td className="n">{T.total ? Math.round((T.leased / T.total) * 100) : 0}%</td><td className="n">{money(T.rent)}</td><td className="n">{money(T.potential)}</td><td className="n">{money(T.lost)}</td></tr></tbody></table></div></div>
      {rp.detail === 'detail' || vac.length <= 40 ? <div className="card"><h2>الوحدات الشاغرة ({vac.length})</h2>{vac.length === 0 ? <p className="muted">لا توجد وحدات شاغرة.</p> : <div className="tbl"><table>
        <thead><tr><th>العقار</th><th>الوحدة</th><th>النوع</th><th>آخر مستأجر</th><th className="n">انتهى عقده</th><th className="n">أيام الشغور</th><th className="n">آخر إيجار سنوي</th><th className="n">الضائع التقديري</th></tr></thead>
        <tbody>{vac.map((x) => <tr key={x.u.id}><td>{a.P.get(x.u.property_id)?.short}</td><td><Link href={`/units/${x.u.id}`}>{x.u.code}</Link></td><td>{x.u.unit_type ?? '—'}</td>
          <td>{x.last ? a.T.get(x.last.tenant_id)?.name : 'لم تؤجر'}</td><td className="n">{date(x.last?.end_date)}</td><td className="n">{x.days ?? '—'}</td><td className="n">{money(x.refRent)}</td><td className="n">{x.lost ? money(x.lost) : '—'}</td></tr>)}</tbody></table></div>}</div> : null}
    </ReportFrame>
  );
}
