import { notFound } from 'next/navigation';
import { q, MULTI, currentOrg } from '@/lib/db';
import { money } from '@/lib/fmt';
import { sandboxResult } from '@/lib/paylink-actions';
export const dynamic = 'force-dynamic';
/** بوابة تجربة داخلية — لتجربة الدورة كاملة بدون حساب بوابة ولا دفع حقيقي */
export default async function Sandbox({ params }: { params: { token: string } }) {
  const [st] = await q(`select value from settings where key='pay_provider'`); if (st?.value !== 'sandbox') notFound();
  const [l] = await q('select amount, description from payment_links where token=$1', [params.token]); if (!l) notFound();
  const hid = <><input type="hidden" name="token" value={params.token} />{MULTI && <input type="hidden" name="o" value={currentOrg()} />}</>;
  return <main className="paypage"><div className="pay-card sandbox"><p className="note warn">بيئة تجربة — لا يتم أي دفع حقيقي.</p>
    <p>{l.description}</p><div className="pay-amt"><span>المبلغ</span><b>{money(Number(l.amount))} ريال</b></div>
    <form action={sandboxResult}>{hid}<input type="hidden" name="result" value="paid" /><button className="btn pay-btn" type="submit">محاكاة دفع ناجح</button></form>
    <form action={sandboxResult}>{hid}<input type="hidden" name="result" value="failed" /><button className="btn ghost" type="submit">محاكاة فشل الدفع</button></form></div></main>;
}
