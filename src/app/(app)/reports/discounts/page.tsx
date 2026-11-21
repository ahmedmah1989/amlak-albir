import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi, Tag } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { money, date } from '@/lib/fmt';
import { parseReport, inRange, type SP } from '@/lib/report-params';

const ST: [string, string][] = [['approved', 'معتمد'], ['pending', 'بانتظار الاعتماد'], ['rejected', 'مرفوض']];
export default async function Discounts({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'ytd' });
  const xs = db.adjustments.filter((x) => (!x.date || inRange(x.date, rp.from, rp.to)) && (!rp.props.length || rp.props.includes(x.property_id ?? (x.contract_id ? a.C.get(x.contract_id)?.property_id ?? '' : '')))
    && (!rp.tenant || x.tenant_id === rp.tenant) && (!rp.status || (x.status ?? 'approved') === rp.status));
  const byType = new Map<string, number>(); xs.filter((x) => (x.status ?? 'approved') === 'approved').forEach((x) => byType.set(x.type, (byType.get(x.type) ?? 0) + x.amount));
  const appr = xs.filter((x) => (x.status ?? 'approved') === 'approved'), total = appr.reduce((n, x) => n + x.amount, 0);
  const noDecision = appr.filter((x) => !x.decision_no).length;
  return (
    <ReportFrame id="discounts" title="الخصومات والاعتمادات" sub="كل خصم أو إعفاء أو تسوية على الأقساط: النوع والمبلغ ومن طلبه ومن اعتمده ورقم القرار" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id}
      params={['period', 'property', 'tenant', 'status']} statuses={ST}>
      <div className="kpis">
        <Kpi l="الخصومات المعتمدة" v={money(total)} unit="ريال" tone="warn" s={`${appr.length} حركة`} />
        <Kpi l="بانتظار الاعتماد" v={String(xs.filter((x) => x.status === 'pending').length)} tone="info" />
        <Kpi l="بدون رقم قرار" v={String(noDecision)} tone={noDecision ? 'bad' : ''} s="ملاحظة رقابية" />
        <Kpi l="أنواع الخصم" v={String(byType.size)} s={[...byType.entries()].map(([k, v]) => `${k}: ${money(v)}`).join(' • ') || undefined} />
      </div>
      <div className="card"><div className="tbl"><table>
        <thead><tr><th className="n">التاريخ</th><th>المستأجر</th><th>العقار / القسط</th><th>النوع</th><th className="n">المبلغ</th><th>طلبه</th><th>اعتمده</th><th>رقم القرار</th><th>الحالة</th><th>ملاحظة</th></tr></thead>
        <tbody>{xs.map((x) => { const r = x.installment_id ? a.rows.find((z) => z.id === x.installment_id) : undefined; return <tr key={x.id}>
          <td className="n">{date(x.date)}</td><td>{x.tenant_id ? <Link href={`/tenants/${x.tenant_id}`}>{a.T.get(x.tenant_id)?.name}</Link> : '—'}</td>
          <td>{r ? <Link href={`/installments/${r.id}`}>{r.propertyShort} — {r.unitCode} • قسط {r.no}</Link> : x.property_id ? a.P.get(x.property_id)?.short : '—'}</td><td>{x.type}</td><td className="n">{money(x.amount)}</td>
          <td>{x.requested_by ?? '—'}</td><td>{x.approved_by ?? '—'}</td><td>{x.decision_no ?? <Tag tone="bad">بدون</Tag>}</td>
          <td><Tag tone={(x.status ?? 'approved') === 'approved' ? 'ok' : x.status === 'pending' ? 'warn' : 'mute'}>{ST.find((s) => s[0] === (x.status ?? 'approved'))?.[1]}</Tag></td><td>{x.note ?? ''}</td></tr>; })}
          <tr className="tot"><td colSpan={4}>إجمالي المعتمد</td><td className="n">{money(total)}</td><td colSpan={5}></td></tr></tbody></table></div></div>
    </ReportFrame>
  );
}
