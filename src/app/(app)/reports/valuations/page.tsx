import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, XL, Tag } from '@/components/ui';
import { money, date, LAND_BASIS_LABEL } from '@/lib/fmt';

const tot = (v: { land_value: number | null; building_value: number | null }) => (v.land_value ?? 0) + (v.building_value ?? 0);
const signed = (x: number | null) => (x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + money(Math.abs(x)));

export default async function Valuations({ searchParams }: { searchParams: { p?: string; from?: string; to?: string } }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf);
  const pid = searchParams.p || '', from = searchParams.from || '', to = searchParams.to || '';
  const ps = a.propStats.filter((s) => !pid || s.p.id === pid);
  const log = ps.flatMap((s) => s.vals.map((v, i) => ({ s, v, prev: i ? tot(s.vals[i - 1]) : null })))
    .filter(({ v }) => (!from || (v.val_date ?? '') >= from) && (!to || (v.val_date ?? '0000') <= to))
    .sort((x, y) => (y.v.val_date ?? '').localeCompare(x.v.val_date ?? ''));
  const land = ps.reduce((n, s) => n + (s.p.land_value ?? 0), 0), bld = ps.reduce((n, s) => n + (s.p.building_value ?? 0), 0);
  const init = ps.reduce((n, s) => n + (s.initialTotal ?? 0), 0), revs = ps.reduce((n, s) => n + s.revCount, 0);
  const scope = [pid ? a.P.get(pid)?.name : 'كل العقارات', from && `من ${date(from)}`, to && `إلى ${date(to)}`].filter(Boolean).join(' • ');
  const q = new URLSearchParams(Object.entries({ p: pid, from, to }).filter(([, v]) => v)).toString();
  return (
    <ReportFrame id="valuations" title="تقرير القيم وإعادة التقييم" sub="القيمة الحالية لكل عقار (أرض ومبنى) وسجل إعادات التقييم بتواريخها" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={[]} extraScope={scope} xl={{ r: 'valuations', q: q ? '&' + q : '' }}>
      <form className="filters noprint" method="get">
        <label className="fld"><span>العقار</span><select name="p" defaultValue={pid}><option value="">كل العقارات</option>{db.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="fld"><span>التقييمات من</span><input type="date" name="from" defaultValue={from} /></label>
        <label className="fld"><span>إلى</span><input type="date" name="to" defaultValue={to} /></label>
        <button className="btn sm" type="submit" style={{ alignSelf: 'flex-end' }}>تطبيق</button></form>
      <div className="kpis">
        <Kpi l="قيمة الأراضي الحالية" v={money(land)} unit="ريال" />
        <Kpi l="قيمة المباني الحالية" v={money(bld)} unit="ريال" />
        <Kpi l="إجمالي القيمة الحالية" v={money(land + bld)} unit="ريال" tone="info" s={`مقابل ${money(init)} أول قيمة مسجلة`} />
        <Kpi l="فرق إعادة التقييم المتراكم" v={signed(land + bld - init)} unit="ريال" tone={land + bld - init < 0 ? 'bad' : ''} s={`${revs} إعادة تقييم`} />
      </div>
      <div className="card"><h2>القيمة الحالية لكل عقار</h2><div className="tbl"><table>
        <thead><tr><th>العقار</th><th>وضع الأرض</th><th className="n">الأرض</th><th className="n">المبنى</th><th className="n">الإجمالي الحالي</th><th className="n">أول قيمة</th><th className="n">الفرق</th><th className="n">آخر تقييم</th><th>الأساس</th></tr></thead>
        <tbody>{ps.map((s) => <tr key={s.p.id}>
          <td><Link href={`/properties/${s.p.id}#tab=valuation`}>{s.p.name}</Link>{s.p.data_status === 'provisional' && <> <Tag tone="est">مؤقت</Tag></>}</td>
          <td>{LAND_BASIS_LABEL[s.p.land_basis ?? 'owned']}</td>
          <td className="n">{s.p.land_basis === 'leased' ? 'لا تُقيَّم' : money(s.p.land_value)}</td><td className="n">{money(s.p.building_value)}</td>
          <td className="n"><b>{s.bv ? money(s.bv) : 'غير مدرجة'}</b></td><td className="n">{money(s.initialTotal)}</td>
          <td className={'n ' + (s.revDiff && s.revDiff < 0 ? 'amount-bad' : '')}>{s.revCount ? signed(s.revDiff) : '—'}</td>
          <td className="n">{s.lastValDate ? date(s.lastValDate) : '—'}</td><td>{s.p.value_status ?? '—'}</td></tr>)}
          <tr className="tot"><td colSpan={2}>الإجمالي</td><td className="n">{money(land)}</td><td className="n">{money(bld)}</td><td className="n">{money(land + bld)}</td><td className="n">{money(init)}</td><td className="n">{signed(land + bld - init)}</td><td colSpan={2}></td></tr>
        </tbody></table></div></div>
      <div className="card"><h2>سجل التقييمات ({log.length})</h2>{log.length === 0 ? <p className="muted empty">لا توجد سجلات تقييم في هذا النطاق.</p> :
        <div className="tbl"><table>
          <thead><tr><th className="n">التاريخ</th><th>العقار</th><th>النوع</th><th className="n">الأرض</th><th className="n">المبنى</th><th className="n">الإجمالي</th><th className="n">السابق</th><th className="n">الفرق</th><th>الأساس / المقيّم</th><th>المرجع</th></tr></thead>
          <tbody>{log.map(({ s, v, prev }) => <tr key={v.id}>
            <td className="n">{v.val_date ? date(v.val_date) : 'غير محدد'}</td><td>{s.p.short}</td><td>{v.kind === 'initial' ? 'قيمة افتتاحية' : 'إعادة تقييم'}</td>
            <td className="n">{money(v.land_value)}</td><td className="n">{money(v.building_value)}</td><td className="n">{money(tot(v))}</td>
            <td className="n">{money(prev)}</td><td className="n">{prev == null ? '—' : signed(tot(v) - prev)}</td>
            <td>{v.basis ?? '—'}{v.valuer && <div className="cell-sub">{v.valuer}</div>}</td>
            <td>{[v.ref_no && `تقرير ${v.ref_no}`, v.decision_no && `قرار ${v.decision_no}`].filter(Boolean).join(' • ') || '—'}</td></tr>)}</tbody></table></div>}</div>
      <p className="table-hint">القيمة الحالية = آخر سجل تقييم حسب التاريخ. الفرق المتراكم = القيمة الحالية − أول قيمة مسجلة. الأرض المستأجرة من الغير لا تُقيَّم.</p>
    </ReportFrame>
  );
}
