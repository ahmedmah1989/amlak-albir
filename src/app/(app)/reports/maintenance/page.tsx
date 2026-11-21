import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi, Tag } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { money, date } from '@/lib/fmt';
import { parseReport, inRange, type SP } from '@/lib/report-params';
import { daysBetween } from '@/lib/calc';

const ST: [string, string][] = [['open', 'مفتوح'], ['progress', 'قيد التنفيذ'], ['done', 'منجز'], ['cancelled', 'ملغى']];
const GROUPS: [string, string][] = [['property', 'العقار'], ['vendor', 'المورد'], ['status', 'الحالة'], ['priority', 'الأولوية']];
export default async function MaintReport({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'ytd', group: 'property' });
  const ms = db.maintenance.filter((m) => inRange(m.opened_on, rp.from, rp.to) && (!rp.props.length || rp.props.includes(m.property_id)) && (!rp.status || m.status === rp.status));
  const cost = (m: (typeof ms)[number]) => m.cost ?? m.est_cost ?? 0;
  const age = (m: (typeof ms)[number]) => daysBetween(m.opened_on, m.closed_on ?? asOf);
  const k = (m: (typeof ms)[number]) => rp.group === 'vendor' ? m.vendor || 'بدون مورد' : rp.group === 'status' ? ST.find((s) => s[0] === m.status)?.[1] ?? m.status : rp.group === 'priority' ? m.priority : a.P.get(m.property_id)?.short ?? '—';
  const g = new Map<string, typeof ms>(); ms.forEach((m) => g.set(k(m), [...(g.get(k(m)) ?? []), m]));
  const open = ms.filter((m) => m.status === 'open' || m.status === 'progress'), done = ms.filter((m) => m.status === 'done');
  const total = ms.reduce((n, m) => n + cost(m), 0), avgClose = done.length ? done.reduce((n, m) => n + age(m), 0) / done.length : null;
  return (
    <ReportFrame id="maintenance" title="تقرير الصيانة وتكاليفها" sub="الطلبات المفتوحة في الفترة وتكلفتها الفعلية (أو التقديرية إن لم تُغلق)" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id}
      params={['period', 'property', 'status', 'group', 'detail']} statuses={ST} groups={GROUPS}>
      <div className="kpis">
        <Kpi l="عدد الطلبات" v={String(ms.length)} s={`${open.length} مفتوح • ${done.length} منجز`} />
        <Kpi l="التكلفة" v={money(total)} unit="ريال" tone="bad" />
        <Kpi l="متوسط مدة الإنجاز" v={avgClose == null ? '—' : `${Math.round(avgClose)} يوماً`} />
        <Kpi l="مفتوح أكثر من 30 يوماً" v={String(open.filter((m) => age(m) > 30).length)} tone="warn" />
      </div>
      <div className="card"><h2>حسب {GROUPS.find((x) => x[0] === rp.group)?.[1]}</h2><div className="tbl"><table>
        <thead><tr><th></th><th className="n">الطلبات</th><th className="n">المفتوح</th><th className="n">التكلفة</th><th className="n">على المستأجر</th></tr></thead>
        <tbody>{[...g.entries()].sort((x, y) => y[1].reduce((n, m) => n + cost(m), 0) - x[1].reduce((n, m) => n + cost(m), 0)).map(([kk, xs]) => <tr key={kk}><td>{kk}</td><td className="n">{xs.length}</td><td className="n">{xs.filter((m) => m.status === 'open' || m.status === 'progress').length}</td><td className="n">{money(xs.reduce((n, m) => n + cost(m), 0))}</td><td className="n">{money(xs.filter((m) => m.charge_to !== 'الجمعية').reduce((n, m) => n + cost(m), 0))}</td></tr>)}
          <tr className="tot"><td>الإجمالي</td><td className="n">{ms.length}</td><td className="n">{open.length}</td><td className="n">{money(total)}</td><td className="n">{money(ms.filter((m) => m.charge_to !== 'الجمعية').reduce((n, m) => n + cost(m), 0))}</td></tr></tbody></table></div></div>
      {rp.detail === 'detail' && <div className="card"><h2>الطلبات</h2><div className="tbl"><table>
        <thead><tr><th className="n">الفتح</th><th>العقار</th><th>الطلب</th><th>الأولوية</th><th>المورد</th><th>الحالة</th><th className="n">العمر</th><th className="n">التكلفة</th><th>تُحمَّل على</th></tr></thead>
        <tbody>{ms.map((m) => <tr key={m.id}><td className="n">{date(m.opened_on)}</td><td>{a.P.get(m.property_id)?.short}{m.unit_id && ` — ${a.U.get(m.unit_id)?.code}`}</td><td><Link href={`/maintenance/${m.id}`}>{m.title}</Link></td><td>{m.priority}</td><td>{m.vendor ?? '—'}</td>
          <td><Tag tone={m.status === 'done' ? 'ok' : m.status === 'cancelled' ? 'mute' : 'warn'}>{ST.find((s) => s[0] === m.status)?.[1]}</Tag></td><td className="n">{age(m)} يوماً</td><td className="n">{money(cost(m))}{m.cost == null && m.est_cost != null && <div className="cell-sub">تقديري</div>}</td><td>{m.charge_to}</td></tr>)}</tbody></table></div></div>}
    </ReportFrame>
  );
}
