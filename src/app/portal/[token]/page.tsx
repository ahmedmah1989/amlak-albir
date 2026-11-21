import { notFound } from 'next/navigation';
import { q } from '@/lib/db';
import { loadDB } from '@/lib/data';
import { analyze } from '@/lib/calc';
import { tenantLedger } from '@/lib/statement';
import { portalUpload } from '@/lib/actions4';
import { money, date } from '@/lib/fmt';
import { addMonths } from '@/lib/calc';
export const dynamic = 'force-dynamic';

/** بوابة المستأجر العامة — بدون تسجيل دخول، بالرابط الخاص فقط */
export default async function Portal({ params, searchParams }: { params: { token: string }; searchParams: { ok?: string; err?: string } }) {
  const token = params.token;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  const db = await loadDB();
  if (!db.meta.features.portal) notFound();
  const [row] = await q('select id from tenants where portal_token=$1', [token]); if (!row) notFound();
  const a = analyze(db); const s = a.tenantStats.find((x) => x.t.id === row.id); if (!s) notFound();
  const led = tenantLedger(db, a, s.t.id, { from: addMonths(a.today, -12) });
  const dueNow = s.rows.filter((r) => r.balance > 0 && r.due_date <= a.today).reduce((x, r) => x + r.balance, 0);
  const next = s.rows.filter((r) => r.balance > 0 && r.due_date > a.today).sort((x, y) => x.due_date.localeCompare(y.due_date))[0];
  return (
    <main className="portal">
      <header><img src="/api/logo" alt="" /><div><b style={{ fontSize: '1.2rem', color: 'var(--g-d)' }}>{db.meta.org}</b><div>بوابة المستأجر — {s.t.name}</div></div></header>
      {searchParams.ok && <p className="note">{searchParams.ok}</p>}{searchParams.err && <p className="note warn">{searchParams.err}</p>}
      <div className="kpis">
        <div className="kpi bad"><div className="l">المستحق حتى اليوم</div><div className="v">{money(dueNow)} <small>ريال</small></div></div>
        <div className="kpi"><div className="l">القسط القادم</div><div className="v">{next ? money(next.balance) : '—'}</div><div className="s">{next ? `بتاريخ ${date(next.due_date)}` : ''}</div></div>
        <div className="kpi"><div className="l">آخر سداد</div><div className="v" style={{ fontSize: '1.2rem' }}>{s.lastPayment ? date(s.lastPayment.paid_on) : '—'}</div><div className="s">{s.lastPayment ? `${money(s.lastPayment.amount)} ريال` : ''}</div></div>
      </div>
      <div className="card"><h2>رفع إشعار تحويل</h2>
        <form action={portalUpload} className="frm"><input type="hidden" name="token" value={token} /><div className="grid">
          <label className="fld"><span>المبلغ المحوّل (ريال)</span><input type="number" name="amount" min="1" step="0.01" required /></label>
          <label className="fld"><span>تاريخ التحويل</span><input type="date" name="paid_on" max={a.today} defaultValue={a.today} required /></label>
          <label className="fld"><span>رقم المرجع (اختياري)</span><input name="ref" dir="ltr" /></label>
          <label className="fld wide"><span>صورة الإشعار أو PDF</span><input type="file" name="files" accept="application/pdf,image/*" multiple required /></label></div>
          <div className="fa"><button className="btn" type="submit">إرسال</button></div></form>
        <p className="muted">يُراجع الإشعار مع كشف البنك ثم يصدر سند القبض.</p></div>
      <div className="card"><h2>كشف الحساب — آخر 12 شهراً</h2><div className="tbl"><table><thead><tr><th className="n">التاريخ</th><th>البيان</th><th className="n">مستحق</th><th className="n">مسدد</th><th className="n">الرصيد</th></tr></thead>
        <tbody><tr className="tot"><td className="n">{date(led.from)}</td><td>رصيد سابق</td><td></td><td></td><td className="n">{money(led.opening)}</td></tr>
          {led.lines.map((l, i) => <tr key={i}><td className="n">{date(l.date)}</td><td>{l.ref}{l.kind === 'inst' ? '' : ` — ${l.kind === 'pay' ? 'سند قبض' : 'تسوية'}`}</td><td className="n">{l.debit ? money(l.debit) : ''}</td><td className="n">{l.credit ? money(l.credit) : ''}</td><td className="n">{money(l.balance)}</td></tr>)}</tbody></table></div></div>
      <p className="muted" style={{ textAlign: 'center' }}>هذا الرابط خاص بكم؛ لا تشاركوه مع غيركم.</p>
    </main>
  );
}
