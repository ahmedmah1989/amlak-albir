import { notFound } from 'next/navigation';
import { q } from '@/lib/db';
import { getSettings, todayRiyadh } from '@/lib/data';
import { money, date } from '@/lib/fmt';
import { payReady, orgQ } from '@/lib/paylinks';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'سداد إلكتروني' };
/** صفحة الدفع العامة للمستأجر — بالرابط الخاص فقط */
export default async function PayPage({ params, searchParams }: { params: { token: string }; searchParams: { ok?: string; err?: string } }) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(params.token)) notFound();
  const [l] = await q(`select l.*, t.name as tenant_name from payment_links l join tenants t on t.id=l.tenant_id where l.token=$1`, [params.token]); if (!l) notFound();
  const S = await getSettings();
  const expired = l.status === 'pending' && l.expires_on && String(l.expires_on) < todayRiyadh();
  const [pay] = l.payment_id ? await q('select receipt_no, paid_on, amount from payments where id=$1', [l.payment_id]) : [];
  const insts = String(l.installment_ids || '').split(',').filter(Boolean);
  const rows = insts.length ? await q(`select i.no, i.due_date, i.amount, u.code from installments i join contracts c on c.id=i.contract_id join units u on u.id=c.unit_id where i.id = any($1) order by i.due_date`, [insts]) : [];
  return (
    <main className="paypage">
      <div className="pay-card">
        <header><img src="/api/logo" alt="" /><div><b>{S.org}</b><span>سداد إلكتروني آمن</span></div></header>
        {searchParams.ok && <p className="note">{searchParams.ok}</p>}{searchParams.err && <p className="note bad">{searchParams.err}</p>}
        <p className="pay-who">المستأجر: <b>{l.tenant_name}</b></p>
        <p className="pay-desc">{l.description}</p>
        {rows.length > 0 && <ul className="pay-rows">{rows.map((r) => <li key={r.no + r.due_date}><span>{r.code} • قسط {r.no} — {date(String(r.due_date))}</span><b>{money(Number(r.amount))}</b></li>)}</ul>}
        <div className="pay-amt"><span>المبلغ المطلوب</span><b>{money(Number(l.amount))} <small>ريال</small></b></div>
        {l.status === 'paid' ? <div className="pay-done"><b>✓ تم السداد</b>{pay && <span>سند رقم {pay.receipt_no} بتاريخ {date(String(pay.paid_on))}</span>}<span>شكراً لكم.</span></div>
          : l.status === 'cancelled' || expired ? <p className="note warn">هذا الرابط لم يعد صالحاً. تواصل مع {S.org} لطلب رابط جديد.</p>
          : !payReady(S) ? <p className="note warn">الدفع الإلكتروني غير متاح حالياً. تواصل مع {S.org}.</p>
          : <><a className="btn pay-btn" href={`/pay/${params.token}/go${orgQ()}`}>ادفع الآن {money(Number(l.amount))} ريال</a>
            <p className="pay-note">ستنتقل لصفحة الدفع الآمنة عند {S.pay_provider === 'tap' ? 'تاب' : S.pay_provider === 'moyasar' ? 'ميسر' : 'بيئة التجربة'} (مدى، فيزا، ماستركارد، Apple Pay). يصلك سند القبض تلقائياً بعد السداد. الرابط صالح حتى {date(String(l.expires_on))}.</p></>}
      </div>
    </main>
  );
}
