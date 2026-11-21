import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi, Empty } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { money, date } from '@/lib/fmt';
import { parseReport, type SP } from '@/lib/report-params';
import { tenantLedger } from '@/lib/statement';
import { tafqit } from '@/lib/tafqit';

export default async function Statement({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'ytd', orient: 'p' });
  const t = rp.tenant ? a.T.get(rp.tenant) : undefined;
  const L = t ? tenantLedger(db, a, t.id, { from: rp.from, to: rp.to }) : null;
  const debit = L ? L.lines.reduce((n, l) => n + l.debit, 0) : 0, credit = L ? L.lines.reduce((n, l) => n + l.credit, 0) : 0;
  const closing = L ? (L.lines.length ? L.lines[L.lines.length - 1].balance : L.opening) : 0;
  return (
    <ReportFrame id="statement" title={t ? `كشف حساب: ${t.name}` : 'كشف حساب مستأجر'} sub="مدين (أقساط مستحقة) ودائن (سداد وخصومات) ورصيد تراكمي" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id}
      params={['period', 'tenant']} xl={t ? { r: 'statement', q: `&id=${t.id}&from=${rp.from}&to=${rp.to}` } : undefined}>
      {!t || !L ? <Empty>اختر المستأجر من لوحة المعايير ثم اضغط «تطبيق».</Empty> : <>
        <div className="kpis">
          <Kpi l="الرصيد السابق" v={money(L.opening)} unit="ريال" s={`حتى ${date(rp.from)}`} />
          <Kpi l="مدين في الفترة" v={money(debit)} unit="ريال" />
          <Kpi l="دائن في الفترة" v={money(credit)} unit="ريال" tone="info" />
          <Kpi l="الرصيد الختامي" v={money(closing)} unit="ريال" tone={closing > 0 ? 'bad' : ''} s={closing > 0 ? 'مستحق على المستأجر' : 'لا يوجد رصيد مستحق'} />
        </div>
        <div className="card"><div className="facts">
          <div><span>المستأجر</span><b><Link href={`/tenants/${t.id}`}>{t.name}</Link></b></div><div><span>الجوال</span><b>{t.phone ?? '—'}</b></div>
          <div><span>الهوية / السجل</span><b>{t.national_id ?? t.cr_no ?? '—'}</b></div><div><span>العقود</span><b>{db.contracts.filter((c) => c.tenant_id === t.id).map((c) => `${a.U.get(c.unit_id)?.code ?? ''} (${a.P.get(c.property_id)?.short ?? ''})`).join('، ') || '—'}</b></div>
        </div></div>
        <div className="card"><div className="tbl"><table>
          <thead><tr><th className="n">التاريخ</th><th>المرجع</th><th>البيان</th><th className="n">مدين</th><th className="n">دائن</th><th className="n">الرصيد</th></tr></thead>
          <tbody><tr><td className="n">{date(rp.from)}</td><td>رصيد سابق</td><td></td><td></td><td></td><td className="n">{money(L.opening)}</td></tr>
            {L.lines.map((l, i) => <tr key={i}><td className="n">{date(l.date)}</td><td>{l.href ? <Link href={l.href}>{l.ref}</Link> : l.ref}</td><td>{l.desc}</td><td className="n">{l.debit ? money(l.debit) : ''}</td><td className="n">{l.credit ? money(l.credit) : ''}</td><td className="n">{money(l.balance)}</td></tr>)}
            <tr className="tot"><td colSpan={3}>الإجمالي</td><td className="n">{money(debit)}</td><td className="n">{money(credit)}</td><td className="n">{money(closing)}</td></tr></tbody></table></div>
          {closing > 0 && <p className="muted">الرصيد المستحق: {tafqit(closing)}</p>}</div>
      </>}
    </ReportFrame>
  );
}
