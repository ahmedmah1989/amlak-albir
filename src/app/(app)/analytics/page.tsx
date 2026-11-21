import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi } from '@/components/ui';
import ReportFrame, { Delta } from '@/components/ReportFrame';
import { money, pct } from '@/lib/fmt';
import { parseReport, type SP } from '@/lib/report-params';
import { periodMetrics, monthlySeries, monthsIn, propertyTable, insights } from '@/lib/analytics';

const MON = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];
const ml = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const SORTS: [string, string][] = [['net', 'صافي الدخل'], ['yield', 'العائد الصافي'], ['coll', 'نسبة التحصيل'], ['occ', 'الإشغال'], ['arrears', 'المتأخرات']];

/** رسم أعمدة: المستحق والمحصّل والمصروف لكل شهر، وخط المحصّل في فترة المقارنة */
function Chart({ s, c }: { s: ReturnType<typeof monthlySeries>; c: ReturnType<typeof monthlySeries> | null }) {
  const W = 760, H = 230, pad = 34, n = Math.max(1, s.length), bw = (W - pad * 2) / n;
  const mx = Math.max(1, ...s.flatMap((x) => [x.due, x.collected, x.expenses]), ...(c ?? []).map((x) => x.collected));
  const y = (v: number) => H - pad - (v / mx) * (H - pad * 2);
  const line = c ? c.map((x, i) => `${i ? 'L' : 'M'}${pad + bw * i + bw / 2},${y(x.collected)}`).join(' ') : '';
  return <svg viewBox={`0 0 ${W} ${H}`} className="an-chart" role="img" aria-label="المستحق والمحصل والمصروفات شهرياً">
    {[0, .25, .5, .75, 1].map((f) => <g key={f}><line x1={pad} x2={W - pad} y1={y(mx * f)} y2={y(mx * f)} className="grid" /><text x={W - pad + 4} y={y(mx * f) + 4} className="ax">{Math.round((mx * f) / 1000)}k</text></g>)}
    {s.map((x, i) => { const x0 = pad + bw * i, w = Math.max(3, bw / 4.2); return <g key={x.m}>
      <rect x={x0 + bw * .12} y={y(x.due)} width={w} height={H - pad - y(x.due)} className="b-due"><title>{`${ml(x.m)} — المستحق ${money(x.due)}`}</title></rect>
      <rect x={x0 + bw * .12 + w + 1} y={y(x.collected)} width={w} height={H - pad - y(x.collected)} className="b-col"><title>{`${ml(x.m)} — المحصّل ${money(x.collected)}`}</title></rect>
      <rect x={x0 + bw * .12 + (w + 1) * 2} y={y(x.expenses)} width={w} height={H - pad - y(x.expenses)} className="b-exp"><title>{`${ml(x.m)} — المصروفات ${money(x.expenses)}`}</title></rect>
      <text x={x0 + bw / 2} y={H - pad + 16} className="ax" textAnchor="middle">{ml(x.m)}</text></g>; })}
    {line && <path d={line} className="l-cmp" />}
  </svg>;
}

export default async function Analytics({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'ytd', compare: 'yoy', orient: 'p' });
  const cur = periodMetrics(db, a, rp.from, rp.to, rp.props);
  const prev = rp.cFrom ? periodMetrics(db, a, rp.cFrom, rp.cTo!, rp.props) : null;
  const months = monthsIn(rp.from, rp.to);
  const ser = monthlySeries(db, a, months, rp.props), cser = rp.cFrom ? monthlySeries(db, a, months, rp.props, rp.compare === 'yoy' ? -12 : -months.length) : null;
  const sort = SORTS.some((x) => x[0] === searchParams.sort) ? searchParams.sort! : 'net';
  const tbl = propertyTable(db, a, rp.from, rp.to, rp.props).sort((x, y) => {
    const k = (t: typeof x) => sort === 'yield' ? t.m.netYield ?? -1e9 : sort === 'coll' ? t.m.collRate ?? -1 : sort === 'occ' ? t.m.occ.rate ?? -1 : sort === 'arrears' ? -t.arrears : t.m.net;
    return k(y) - k(x); });
  const ins = insights(cur, prev, rp.compare === 'yoy' ? 'نفس الفترة من العام السابق' : 'الفترة السابقة', tbl, a);
  const maxNet = Math.max(1, ...tbl.map((t) => Math.abs(t.m.net)));
  const d = (k: 'collected' | 'expenses' | 'net' | 'due', inv = false) => <Delta cur={cur[k]} prev={prev ? prev[k] : null} money={money} invert={inv} />;
  const sp = (k: string) => '?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]), sort: k }).toString();
  return (
    <ReportFrame id="analytics" title="تحليلات الإدارة" sub="أداء المحفظة في الفترة مقارنة بفترة سابقة، وترتيب العقارات، وملاحظات تلقائية للمجلس" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['period', 'compare', 'property']}>
      <div className="kpis an-kpis">
        <Kpi tone="hero" l="المحصّل في الفترة" v={money(cur.collected)} unit="ريال" s={`${cur.receipts} سنداً`} href="/reports/collection" />
        <Kpi l="المستحق في الفترة" v={money(cur.due)} unit="ريال" s={cur.dueToDate < cur.due ? `منه ${money(cur.dueToDate)} حلّ حتى اليوم` : undefined} />
        <Kpi tone={cur.collRate != null && cur.collRate < 80 ? 'bad' : 'info'} l="نسبة تحصيل مستحقات الفترة" v={cur.collRate == null ? '—' : pct(cur.collRate)} s={prev?.collRate != null ? `المقارنة: ${pct(prev.collRate)}` : 'ما سُدد مما حلّ موعده'} />
        <Kpi l="المصروفات" v={money(cur.expenses)} unit="ريال" href="/reports/expenses" />
        <Kpi tone={cur.net < 0 ? 'bad' : ''} l="صافي الدخل النقدي" v={money(cur.net)} unit="ريال" s="المحصّل − المصروفات" />
        <Kpi l="العائد الصافي السنوي على القيمة" v={cur.netYield == null ? '—' : pct(cur.netYield)} s={cur.value ? `قيمة المحفظة ${money(cur.value)} ريال` : 'أدخل قيم العقارات'} href="/reports/valuations" />
        <Kpi l="الإشغال في نهاية الفترة" v={cur.occ.rate == null ? '—' : pct(cur.occ.rate)} s={`${cur.occ.occupied} من ${cur.occ.units} وحدة إيجارية`} href="/reports/occupancy" />
        <Kpi tone={cur.avgDelay != null && cur.avgDelay > 30 ? 'warn' : ''} l="متوسط تأخر السداد" v={cur.avgDelay == null ? '—' : String(cur.avgDelay)} unit="يوماً" s={prev?.avgDelay != null ? `المقارنة: ${prev.avgDelay} يوماً` : 'من الاستحقاق حتى السند'} />
      </div>
      {prev && <div className="card an-cmp"><h2>المقارنة مع {rp.cLabel}</h2><div className="tbl"><table>
        <thead><tr><th>البند</th><th className="n">الفترة الحالية</th><th className="n">فترة المقارنة</th><th className="n">التغير</th></tr></thead>
        <tbody>
          <tr><td>المستحق</td><td className="n">{money(cur.due)}</td><td className="n">{money(prev.due)}</td><td className="n">{d('due')}</td></tr>
          <tr><td>المحصّل</td><td className="n">{money(cur.collected)}</td><td className="n">{money(prev.collected)}</td><td className="n">{d('collected')}</td></tr>
          <tr><td>المصروفات</td><td className="n">{money(cur.expenses)}</td><td className="n">{money(prev.expenses)}</td><td className="n">{d('expenses', true)}</td></tr>
          <tr className="tot"><td>صافي الدخل</td><td className="n">{money(cur.net)}</td><td className="n">{money(prev.net)}</td><td className="n">{d('net')}</td></tr>
          <tr><td>نسبة التحصيل</td><td className="n">{cur.collRate == null ? '—' : pct(cur.collRate)}</td><td className="n">{prev.collRate == null ? '—' : pct(prev.collRate)}</td><td className="n">{cur.collRate != null && prev.collRate != null ? `${(cur.collRate - prev.collRate) >= 0 ? '+' : ''}${(cur.collRate - prev.collRate).toFixed(1)} نقطة` : '—'}</td></tr>
          <tr><td>الوحدات المؤجرة</td><td className="n">{cur.occ.occupied} / {cur.occ.units}</td><td className="n">{prev.occ.occupied} / {prev.occ.units}</td><td className="n"><Delta cur={cur.occ.occupied} prev={prev.occ.occupied} /></td></tr>
          <tr><td>عقود جديدة / مجددة / منتهية</td><td className="n">{cur.started} / {cur.renewed} / {cur.ended}</td><td className="n">{prev.started} / {prev.renewed} / {prev.ended}</td><td className="n">—</td></tr>
        </tbody></table></div></div>}
      <div className="card"><h2>ملاحظات للإدارة <small>تُستخرج تلقائياً من البيانات</small></h2>
        <ul className="an-ins">{ins.map((x, i) => <li key={i} className={x.tone}>{x.href ? <Link href={x.href}>{x.text}</Link> : x.text}</li>)}</ul></div>
      {rp.chart && months.length > 1 && <div className="card"><h2>الاتجاه الشهري</h2>
        <Chart s={ser} c={cser} />
        <div className="legend2"><span><i className="b-due" />المستحق</span><span><i className="b-col" />المحصّل</span><span><i className="b-exp" />المصروفات</span>{cser && <span><i className="l-cmp" />المحصّل في فترة المقارنة</span>}</div>
        <div className="tbl"><table className="matrix"><thead><tr><th>الشهر</th>{ser.map((x) => <th key={x.m} className="n">{ml(x.m)}</th>)}</tr></thead><tbody>
          <tr><td>المحصّل</td>{ser.map((x) => <td key={x.m} className="n">{money(x.collected)}</td>)}</tr>
          {cser && <tr className="muted"><td>المقارنة</td>{cser.map((x) => <td key={x.m} className="n">{money(x.collected)}</td>)}</tr>}
          <tr><td>المصروفات</td>{ser.map((x) => <td key={x.m} className="n">{money(x.expenses)}</td>)}</tr>
          <tr className="tot"><td>الصافي</td>{ser.map((x) => <td key={x.m} className="n">{money(x.net)}</td>)}</tr>
          <tr><td>الإشغال</td>{ser.map((x) => <td key={x.m} className="n">{x.future || x.occ == null ? '—' : pct(x.occ)}</td>)}</tr>
        </tbody></table></div></div>}
      <div className="card"><h2>ترتيب العقارات في الفترة</h2>
        <div className="chips noprint">ترتيب حسب: {SORTS.map(([k, l]) => <a key={k} href={sp(k)} className={sort === k ? 'on' : ''}>{l}</a>)}</div>
        <div className="tbl"><table className="an-tbl">
          <thead><tr><th>#</th><th>العقار</th><th className="n">الإشغال</th><th className="n">الإيجار<br />السنوي</th><th className="n">المستحق</th><th className="n">المحصّل</th><th className="n">التحصيل</th><th className="n">المصروفات</th><th>صافي الدخل</th><th className="n">القيمة</th><th className="n">العائد الصافي</th><th className="n">المتأخرات الآن</th></tr></thead>
          <tbody>{tbl.map((t, i) => <tr key={t.p.id}>
            <td>{i + 1}</td><td><Link href={`/properties/${t.p.id}`}>{t.p.short}</Link></td>
            <td className="n">{t.m.occ.units ? `${t.m.occ.occupied}/${t.m.occ.units}` : '—'}</td>
            <td className="n">{t.rent ? money(t.rent) : <span className="tag t-bad">بلا عقد</span>}</td>
            <td className="n">{money(t.m.due)}</td><td className="n">{money(t.m.collected)}</td>
            <td className="n">{t.m.collRate == null ? '—' : <span className={t.m.collRate < 80 ? 'neg' : ''}>{pct(t.m.collRate)}</span>}</td>
            <td className="n">{money(t.m.expenses)}</td>
            <td><div className="an-net"><i className={t.m.net < 0 ? 'neg' : ''} style={{ width: `${(Math.abs(t.m.net) / maxNet) * 100}%` }} /><b>{money(t.m.net)}</b></div></td>
            <td className="n">{t.value ? money(t.value) : '—'}</td>
            <td className="n">{t.m.netYield == null ? '—' : <span className={t.m.netYield < 3 ? 'neg' : ''}>{pct(t.m.netYield)}</span>}</td>
            <td className="n">{t.arrears ? money(t.arrears) : '—'}</td></tr>)}
            <tr className="tot"><td /><td>الإجمالي</td><td className="n">{cur.occ.occupied}/{cur.occ.units}</td><td className="n">{money(tbl.reduce((n, t) => n + t.rent, 0))}</td><td className="n">{money(cur.due)}</td><td className="n">{money(cur.collected)}</td><td className="n">{cur.collRate == null ? '—' : pct(cur.collRate)}</td><td className="n">{money(cur.expenses)}</td><td><b>{money(cur.net)}</b></td><td className="n">{money(cur.value)}</td><td className="n">{cur.netYield == null ? '—' : pct(cur.netYield)}</td><td className="n">{money(tbl.reduce((n, t) => n + t.arrears, 0))}</td></tr>
          </tbody></table></div>
        <p className="muted">العائد الصافي = (المحصّل − المصروفات) في الفترة محوّلاً لسنة ÷ قيمة الأرض والمبنى. نسبة التحصيل = ما سُدد من أقساط الفترة التي حلّ موعدها.</p></div>
    </ReportFrame>
  );
}
