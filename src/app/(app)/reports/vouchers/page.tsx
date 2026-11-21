import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi, Tag } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { money, date, VOUCHER_KINDS, VOUCHER_STATUS } from '@/lib/fmt';
import { parseReport, inRange, type SP } from '@/lib/report-params';

export default async function VouchersReport({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'ytd' });
  const vs = db.vouchers.filter((v) => inRange(v.date, rp.from, rp.to) && (!rp.status || v.status === rp.status) && (!rp.props.length || (v.contract_id && rp.props.includes(a.C.get(v.contract_id)?.property_id ?? ''))));
  const by = (st: string) => vs.filter((v) => v.status === st).reduce((n, v) => n + v.amount, 0);
  const kinds = new Map<string, number>(); vs.filter((v) => v.status === 'approved').forEach((v) => kinds.set(v.kind, (kinds.get(v.kind) ?? 0) + v.amount));
  return (
    <ReportFrame id="vouchers" title="تقرير سندات الصرف" sub="سندات الصرف في الفترة حسب النوع والحالة" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['period', 'property', 'status']} statuses={Object.entries(VOUCHER_STATUS).map(([k, v]) => [k, v[0]])}>
      <div className="kpis">
        <Kpi l="المعتمد والمصروف" v={money(by('approved'))} unit="ريال" tone="info" />
        <Kpi l="بانتظار الاعتماد" v={money(by('pending'))} unit="ريال" tone="warn" />
        <Kpi l="عدد السندات" v={String(vs.length)} s={`${vs.filter((v) => v.status === 'voided').length} ملغى`} />
        <Kpi l="حسب النوع" v={String(kinds.size)} s={[...kinds.entries()].map(([k, v]) => `${VOUCHER_KINDS[k]}: ${money(v)}`).join(' • ') || undefined} />
      </div>
      <div className="card"><div className="tbl"><table>
        <thead><tr><th>السند</th><th className="n">التاريخ</th><th>النوع</th><th>المستفيد</th><th>العقد</th><th className="n">المبلغ</th><th>الطريقة</th><th>الحالة</th><th>أنشأه</th><th>اعتمده</th></tr></thead>
        <tbody>{vs.map((v) => { const c = v.contract_id ? a.C.get(v.contract_id) : undefined; return <tr key={v.id}><td><Link href={`/vouchers/${v.id}`}>{v.voucher_no}</Link></td><td className="n">{date(v.date)}</td><td>{VOUCHER_KINDS[v.kind]}</td><td>{v.payee}</td>
          <td>{c ? `${a.P.get(c.property_id)?.short} — ${a.U.get(c.unit_id)?.code}` : '—'}</td><td className="n">{money(v.amount)}</td><td>{v.method}</td><td><Tag tone={VOUCHER_STATUS[v.status][1]}>{VOUCHER_STATUS[v.status][0]}</Tag></td><td>{v.created_by ?? '—'}</td><td>{v.approved_by ?? '—'}</td></tr>; })}
          <tr className="tot"><td colSpan={5}>إجمالي غير الملغى</td><td className="n">{money(by('approved') + by('pending'))}</td><td colSpan={4}></td></tr></tbody></table></div></div>
    </ReportFrame>
  );
}
