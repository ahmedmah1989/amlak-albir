import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Tag, Empty } from '@/components/ui';
import { money, date } from '@/lib/fmt';
export default async function Recon({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf);
  const m = db.bankLines.filter((l) => l.status === 'matched'), o = db.bankLines.filter((l) => l.status === 'open'), ig = db.bankLines.filter((l) => l.status === 'ignored');
  const up = a.payments.filter((p) => !p.bank_line_id);
  const ejOpen = db.ejar.filter((e) => e.status === 'تم الدفع' && e.installment_id && (a.rows.find((r) => r.id === e.installment_id)?.balance ?? 0) > 0);
  const sum = (x: { amount: number }[]) => x.reduce((s, y) => s + y.amount, 0);
  return (
    <ReportFrame id="reconciliation" title="تقرير المطابقة الثلاثية" sub="البنك ↔ النظام ↔ منصة إيجار" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={[]}>
      <div className="kpis"><Kpi tone="hero" l="إيداعات مطابقة" v={money(sum(m))} unit="ريال" s={`${m.length} إيداعاً`} /><Kpi tone="warn" l="إيداعات مجهولة" v={money(sum(o))} unit="ريال" s={`${o.length}`} href="/bank/match" />
        <Kpi tone="bad" l="سندات بلا أثر في البنك" v={money(sum(up))} unit="ريال" s={`${up.length}`} /><Kpi tone="bad" l="مدفوع في إيجار وغير مسدد في النظام" v={String(ejOpen.length)} href="/ejar" /></div>
      <div className="g2"><div className="card"><h2>سندات بلا أثر في البنك</h2>{!up.length ? <Empty>لا يوجد.</Empty> : <table><tbody>{up.map((p) => <tr key={p.id}><td><Link href={`/payments/${p.id}`}>{p.receipt_no}</Link><div className="muted">{a.T.get(p.tenant_id)?.name}</div></td><td className="n">{date(p.paid_on)}</td><td>{p.method}</td><td className="n">{money(p.amount)}</td></tr>)}</tbody></table>}</div>
        <div className="card"><h2>إيداعات مجهولة ومستبعدة</h2>{!o.length && !ig.length ? <Empty>لا يوجد.</Empty> : <table><tbody>{[...o, ...ig].map((l) => <tr key={l.id}><td className="n">{date(l.date)}</td><td>{l.description}</td><td><Tag tone={l.status === 'open' ? 'warn' : 'mute'}>{l.status === 'open' ? 'مجهول' : 'مستبعد'}</Tag>{l.note && <div className="muted">{l.note}</div>}</td><td className="n">{money(l.amount)}</td></tr>)}</tbody></table>}</div></div>
    </ReportFrame>
  );
}
