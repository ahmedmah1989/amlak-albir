import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi, Tag } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { money, date, CSTATUS } from '@/lib/fmt';
import { parseReport, type SP } from '@/lib/report-params';

const ST: [string, string][] = [['held', 'محتجز'], ['settled', 'تمت تسويته'], ['none', 'بدون تأمين مسجل']];
export default async function Deposits({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf);
  const rows = db.contracts.filter((c) => (!rp.props.length || rp.props.includes(c.property_id)) && (!rp.tenant || c.tenant_id === rp.tenant)).map((c) => {
    const dep = c.deposit ?? 0, ref = c.deposit_refund ?? 0, ded = c.deposit_deduction ?? 0, settled = ref + ded > 0 || !!c.vacated_on;
    return { c, dep, ref, ded, held: dep > 0 && !settled ? dep : Math.max(0, dep - ref - ded), state: dep <= 0 ? 'none' : settled ? 'settled' : 'held' };
  }).filter((r) => (rp.status ? r.state === rp.status : r.state !== 'none'));
  const S = (k: 'dep' | 'ref' | 'ded' | 'held') => rows.reduce((n, r) => n + r[k], 0);
  const noDep = db.contracts.filter((c) => c.status === 'active' && !(c.deposit && c.deposit > 0)).length;
  return (
    <ReportFrame id="deposits" title="تقرير التأمينات" sub="التأمين المستلم من كل عقد، وما رُدّ منه أو استُقطع عند الإخلاء، والمتبقي محتجزاً لدى الجمعية" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['property', 'tenant', 'status']} statuses={ST}>
      <div className="kpis">
        <Kpi l="التأمينات المستلمة" v={money(S('dep'))} unit="ريال" s={`${rows.length} عقداً`} />
        <Kpi l="المحتجز حالياً" v={money(S('held'))} unit="ريال" tone="info" s="التزام على الجمعية حتى التسوية" />
        <Kpi l="المسترد للمستأجرين" v={money(S('ref'))} unit="ريال" />
        <Kpi l="المستقطع" v={money(S('ded'))} unit="ريال" tone="warn" s={noDep ? `${noDep} عقود سارية بدون تأمين مسجل` : undefined} />
      </div>
      <div className="card"><div className="tbl"><table>
        <thead><tr><th>العقار</th><th>الوحدة</th><th>المستأجر</th><th>حالة العقد</th><th className="n">التأمين</th><th className="n">المسترد</th><th className="n">المستقطع</th><th className="n">المحتجز</th><th>الحالة</th><th className="n">الإخلاء</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.c.id}><td>{a.P.get(r.c.property_id)?.short}</td><td><Link href={`/contracts/${r.c.id}`}>{a.U.get(r.c.unit_id)?.code}</Link></td><td>{a.T.get(r.c.tenant_id)?.name}</td><td>{CSTATUS[r.c.status]}</td>
          <td className="n">{money(r.dep)}</td><td className="n">{r.ref ? money(r.ref) : '—'}</td><td className="n">{r.ded ? money(r.ded) : '—'}</td><td className="n"><b>{money(r.held)}</b></td>
          <td><Tag tone={r.state === 'held' ? 'info' : r.state === 'settled' ? 'ok' : 'mute'}>{ST.find((s) => s[0] === r.state)?.[1]}</Tag>{r.c.deposit_status && <div className="cell-sub">{r.c.deposit_status}</div>}</td><td className="n">{date(r.c.vacated_on)}</td></tr>)}
          <tr className="tot"><td colSpan={4}>الإجمالي</td><td className="n">{money(S('dep'))}</td><td className="n">{money(S('ref'))}</td><td className="n">{money(S('ded'))}</td><td className="n">{money(S('held'))}</td><td colSpan={2}></td></tr></tbody></table></div></div>
    </ReportFrame>
  );
}
