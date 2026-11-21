import Link from 'next/link';
import type { IRow } from '@/lib/calc';
import { ISTATUS } from '@/lib/calc';
import { money, date } from '@/lib/fmt';
const KIND: Record<string, string> = { utility: 'خدمات', penalty: 'غرامة', settlement: 'جدولة' };

/** شريط تقدم السداد */
export function Prog({ pct, tone }: { pct: number; tone?: string }) {
  return <span className={`prog ${tone ?? (pct >= 100 ? 'ok' : pct > 0 ? 'part' : 'none')}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>;
}

/** حالة القسط مع إظهار السداد الجزئي */
export function InstStat({ r }: { r: IRow }) {
  if (r.status === 'paid') return <span className="tag t-ok">مسدَّد</span>;
  const s = ISTATUS[r.status];
  return <span className={`tag t-${s.tone}`}>{r.partial ? `${s.label} • جزئي` : s.label}</span>;
}

/** عرض الأقساط كبطاقات مجمّعة حسب السنة، كل بطاقة توضح المسدد والمتبقي وعدد الدفعات */
export default function InstallmentBoard({ rows, canEdit, showContract = false }: { rows: IRow[]; canEdit: boolean; showContract?: boolean }) {
  const years = new Map<string, IRow[]>();
  [...rows].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.no - b.no).forEach((r) => {
    const y = r.due_date.slice(0, 4); years.set(y, [...(years.get(y) ?? []), r]);
  });
  return <div className="iboard">{[...years.entries()].map(([y, rs]) => {
    const amt = rs.reduce((x, r) => x + r.amount, 0), bal = rs.reduce((x, r) => x + r.balance, 0);
    return <section key={y} className="iyear">
      <header><b>{y}</b><span>{rs.length} أقساط • القيمة {money(amt)} • المتبقي <em className={bal ? 'bad' : 'ok'}>{money(bal)}</em></span><Prog pct={amt ? ((amt - bal) / amt) * 100 : 100} /></header>
      <div className="itiles">{rs.map((r) => {
        const tone = r.status === 'paid' ? 'ok' : r.status === 'overdue' ? 'bad' : r.status === 'upcoming' ? 'up' : 'warn';
        return <article key={r.id} className={`itile ${tone}`}>
          <div className="ih"><Link href={`/installments/${r.id}`} className="ino">قسط {r.no}{r.kind && r.kind !== 'rent' && <small className="tag t-gold" style={{ marginInlineStart: 6 }}>{KIND[r.kind] ?? r.kind}</small>}</Link><InstStat r={r} /></div>
          {showContract && <div className="ic"><Link href={`/contracts/${r.contract_id}`}>{r.propertyShort} — {r.unitCode}</Link></div>}
          <div className="idt"><span>الاستحقاق</span><b>{date(r.due_date)}</b>{r.daysLate > 0 && <small className="bad">متأخر {r.daysLate} يوماً</small>}</div>
          {r.period_from && <div className="ipr">{date(r.period_from)} ← {date(r.period_to)}</div>}
          <div className="iam"><b>{money(r.amount)}</b><small>ريال</small></div>
          <Prog pct={r.paidPct} />
          <div className="ift"><span>مسدَّد {money(r.amount - r.balance)}</span>{r.balance > 0 && <span className="bad">متبقٍ {money(r.balance)}</span>}</div>
          <div className="iac">
            <span className="muted">{r.receipts ? `${r.receipts} ${r.receipts === 1 ? 'دفعة' : 'دفعات'}` : 'لا دفعات'}</span>
            {canEdit && r.balance > 0 && <Link className="btn sm" href={`/payments/new?tenant=${r.contract.tenant_id}&contract=${r.contract_id}&inst=${r.id}`}>تحصيل</Link>}
          </div>
        </article>;
      })}</div>
    </section>;
  })}</div>;
}
