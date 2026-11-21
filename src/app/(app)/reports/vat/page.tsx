import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Empty, XL } from '@/components/ui';
import { vatReport } from '@/lib/accounting';
import { money, date } from '@/lib/fmt';

export default async function Vat({ searchParams }: { searchParams: { y?: string; qt?: string } }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { orient: 'p' });
  if (!db.meta.features.accounting) return <Page title="إقرار الضريبة" org={org} asOf={asOf}><Empty>الميزة غير مفعّلة. فعّلها من الإدارة ← الميزات.</Empty></Page>;
  const y = Number(searchParams.y ?? asOf.slice(0, 4)), qt = Number(searchParams.qt ?? Math.ceil(Number(asOf.slice(5, 7)) / 3));
  const from = `${y}-${String((qt - 1) * 3 + 1).padStart(2, '0')}-01`, toM = qt * 3, to = `${y}-${String(toM).padStart(2, '0')}-${new Date(Date.UTC(y, toM, 0)).getUTCDate()}`;
  const v = vatReport(a, from, to);
  const S = db.meta.settings;
  return (
    <ReportFrame id="vat" title={`ضريبة القيمة المضافة — الربع ${qt} / ${y}`} sub={`${date(from)} — ${date(to)} • الرقم الضريبي للجهة: ${S.org_vat_no || 'غير مسجل في الإعدادات'}`} sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={[]} xl={{ r: 'vat', q: `&from=${from}&to=${to}` }}>
      <div className="filters">{[1, 2, 3, 4].map((k) => <Link key={k} href={`?y=${y}&qt=${k}`} className={k === qt ? 'on' : ''}>الربع {k}</Link>)}<Link href={`?y=${y - 1}&qt=${qt}`}>{y - 1}</Link><Link href={`?y=${y + 1}&qt=${qt}`}>{y + 1}</Link></div>
      <div className="kpis"><Kpi l="الإيرادات الخاضعة (صافي)" v={money(v.net)} unit="ريال" /><Kpi tone="info" l="ضريبة المخرجات المستحقة" v={money(v.tax)} unit="ريال" s="على أساس الاستحقاق" />
        <Kpi l="الضريبة على المحصّل فعلاً" v={money(v.collectedTax)} unit="ريال" /><Kpi l="عدد الأقساط" v={String(v.rows.length)} /></div>
      <div className="card">{!v.rows.length ? <Empty>لا توجد أقساط خاضعة للضريبة في الربع. حدّد نسبة الضريبة في بيانات العقود التجارية.</Empty> : <div className="tbl"><table><thead><tr><th className="n">الاستحقاق</th><th>المستأجر</th><th>الرقم الضريبي</th><th>الوحدة</th><th className="n">%</th><th className="n">الصافي</th><th className="n">الضريبة</th><th className="n">الإجمالي</th><th className="n">المحصّل</th></tr></thead>
        <tbody>{v.rows.map(({ r, rate, net, tax }) => <tr key={r.id}><td className="n">{date(r.due_date)}</td><td>{r.tenantName}</td><td dir="ltr">{a.T.get(r.contract.tenant_id)?.vat_no ?? '—'}</td><td>{r.unitCode}</td><td className="n">{rate}</td><td className="n">{money(net)}</td><td className="n">{money(tax)}</td><td className="n">{money(r.amount)}</td><td className="n">{money(r.amount - r.balance)}</td></tr>)}
          <tr className="tot"><td>الإجمالي</td><td></td><td></td><td></td><td></td><td className="n">{money(v.net)}</td><td className="n">{money(v.tax)}</td><td className="n">{money(v.net + v.tax)}</td><td></td></tr></tbody></table></div>}</div>
      <p className="muted">تقرير مساعد لإعداد الإقرار؛ الإقرار الرسمي يُقدَّم عبر بوابة هيئة الزكاة والضريبة والجمارك.</p>
    </ReportFrame>
  );
}
