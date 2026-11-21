import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import { REPORTS } from '@/lib/reports-catalog';
import { PRESETS, parseReport, type SP } from '@/lib/report-params';
import { date } from '@/lib/fmt';
import Board from '../board/page';
import Collection from '../collection/page';
import Arrears from '../arrears/page';
import Aging from '../aging/page';
import Renewals from '../renewals/page';
import Occupancy from '../occupancy/page';
import Performance from '../performance/page';
import Revenue from '../revenue/page';
import Valuations from '../valuations/page';
import Analytics from '../../analytics/page';

const C: Record<string, (p: { searchParams: SP }) => Promise<JSX.Element>> = { board: Board, collection: Collection, arrears: Arrears, aging: Aging, renewals: Renewals, occupancy: Occupancy, performance: Performance, revenue: Revenue, valuations: Valuations, analytics: Analytics };
const DEFAULT = ['board', 'analytics', 'collection', 'arrears', 'occupancy', 'performance'];
/** حزمة تقارير المجلس: عدة تقارير بنفس الفترة تُطبع مرة واحدة بغلاف وفهرس */
export default async function Pack({ searchParams }: { searchParams: SP }) {
  const { org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'quarter', orient: 'l' });
  const avail = REPORTS.filter((r) => r.pack && C[r.id]);
  const rr = (searchParams as Record<string, string | string[] | undefined>).rr;
  const chosen = searchParams.go ? (Array.isArray(rr) ? rr : rr ? [rr] : (searchParams.r ?? '').split(',')).filter((x) => C[x]) : [];
  const sel = searchParams.go ? chosen : DEFAULT;
  const sub: SP = { pr: rp.preset === 'custom' ? undefined : rp.preset, from: rp.preset === 'custom' ? rp.from : undefined, to: rp.preset === 'custom' ? rp.to : undefined, cmp: rp.compare === 'none' ? undefined : rp.compare, d: 'summary', o: rp.orient, sig: '0' };
  return (
    <Page title="حزمة تقارير المجلس" sub="اختر التقارير والفترة، ثم اطبع الحزمة كاملة مرة واحدة: غلاف وفهرس، وكل تقرير في صفحة جديدة بترويسته، وتوقيع واحد في النهاية" org={org} asOf={asOf} print={chosen.length > 0} back={['/reports', 'مركز التقارير']}>
      <form method="get" className="card noprint pack-form"><input type="hidden" name="go" value="1" />
        <h2>محتوى الحزمة</h2>
        <div className="pack-choices">{avail.map((r) => <label key={r.id} className="chk"><input type="checkbox" defaultChecked={sel.includes(r.id)} data-r={r.id} name="rr" value={r.id} /> {r.title}</label>)}</div>
        <h2>الفترة</h2>
        <div className="chips">{PRESETS.filter(([k]) => k !== 'custom').map(([k, l]) => <label key={k} className={'chip-radio' + (rp.preset === k ? ' on' : '')}><input type="radio" name="pr" value={k} defaultChecked={rp.preset === k} />{l}</label>)}</div>
        <label className="chk"><input type="checkbox" name="cmp" value="yoy" defaultChecked={rp.compare === 'yoy'} /> مقارنة بنفس الفترة من العام السابق (حيث يتوفر)</label>
        <label className="fld"><span>عنوان الحزمة</span><input name="title" defaultValue={searchParams.title ?? `تقرير الأملاك والأوقاف المقدم لمجلس الإدارة`} maxLength={120} /></label>
        <button className="btn" type="submit">تجهيز الحزمة</button>
      </form>
      {chosen.length > 0 && <>
        <section className="pack-cover">
          <img src="/api/logo" alt="" style={{ height: '6rem' }} />
          <h1>{searchParams.title || 'تقرير الأملاك والأوقاف المقدم لمجلس الإدارة'}</h1>
          <p>{org}</p><p>الفترة: {rp.label}</p><p>تاريخ البيانات: {date(asOf)} • أعدّه: {user.full_name}</p>
          <ol>{chosen.map((id) => <li key={id}>{REPORTS.find((r) => r.id === id)?.title}</li>)}</ol>
        </section>
        {chosen.map((id) => { const R = C[id]; return <section key={id} className="pack-section"><R searchParams={sub} /></section>; })}
        <div className="sig"><div>أعدّه</div><div>راجعه</div><div>اعتمده</div></div>
      </>}
    </Page>
  );
}
