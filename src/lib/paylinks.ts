import 'server-only';
/**
 * روابط الدفع الإلكتروني:
 * - الرابط صفحة عامة في البرنامج (/pay/رمز) تعرض المبلغ وتفاصيله، وزر «ادفع الآن» ينشئ صفحة الدفع عند البوابة وقتها.
 * - البوابات: ميسر (Moyasar)، تاب (Tap)، وبيئة تجربة داخلية (sandbox) للتجربة بدون حساب.
 * - التحقق من الدفع يكون دائماً بسؤال البوابة مباشرة (لا يُعتمد على ما يصل من المتصفح)، ثم يُسجَّل سند قبض تلقائياً مرة واحدة فقط.
 */
import { randomBytes } from 'crypto';
import { q, tx, uid, currentOrg, MULTI } from './db';
import { getSettings, todayRiyadh } from './data';
import { planPayment } from './payment-plan';

export const PROVIDERS: [string, string][] = [['moyasar', 'ميسر (Moyasar)'], ['tap', 'تاب (Tap Payments)'], ['sandbox', 'بيئة تجربة داخلية — بدون دفع حقيقي']];
export const LINK_STATUS: Record<string, [string, string]> = { pending: ['بانتظار الدفع', 'warn'], processing: ['قيد التحقق', 'info'], paid: ['مدفوع', 'ok'], failed: ['فشل الدفع', 'bad'], cancelled: ['ملغى', 'mute'], expired: ['منتهي', 'mute'] };
export const payReady = (S: Record<string, string>) => !!S.pay_provider && (S.pay_provider === 'sandbox' || !!S.pay_secret);
const halalas = (n: number) => Math.round(n * 100);

/** الرابط العام للبرنامج (للعودة من البوابة) — من الإعداد أو من عنوان الطلب */
export function publicBase(S: Record<string, string>, fallback?: string) { return (S.pay_base_url || fallback || '').replace(/\/+$/, ''); }
export const orgQ = () => (MULTI ? `?o=${currentOrg()}` : '');

export async function createLink(o: { tenantId: string; contractId?: string | null; installmentIds?: string[]; amount: number; description: string; by: string; days?: number }) {
  const S = await getSettings();
  const token = randomBytes(18).toString('base64url');
  const days = o.days ?? Math.max(1, Number(S.pay_link_days || 7));
  const exp = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  const id = uid('pl');
  await q(`insert into payment_links (id,token,tenant_id,contract_id,installment_ids,amount,description,expires_on,created_by,provider) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, token, o.tenantId, o.contractId ?? null, (o.installmentIds ?? []).join(','), Math.round(o.amount * 100) / 100, o.description, exp, o.by, S.pay_provider || null]);
  return { id, token };
}
/** رابط دفع لمستأجر ومبلغ معيّن يُعاد استخدامه إن وُجد رابط مفتوح بنفس المبلغ (حتى لا تتكرر الروابط في التذكيرات) */
export async function linkFor(o: { tenantId: string; contractId?: string | null; installmentIds?: string[]; amount: number; description: string; by: string }) {
  const [ex] = await q(`select token from payment_links where tenant_id=$1 and coalesce(contract_id,'')=$2 and installment_ids=$3 and amount=$4 and status='pending' and expires_on >= $5 limit 1`,
    [o.tenantId, o.contractId ?? '', (o.installmentIds ?? []).join(','), Math.round(o.amount * 100) / 100, todayRiyadh()]);
  return ex ? ex.token as string : (await createLink(o)).token;
}

/** يُنشئ صفحة الدفع عند البوابة ويعيد رابطها */
export async function checkout(token: string, base: string) {
  const S = await getSettings();
  const [l] = await q(`select l.*, t.name as tenant_name, t.phone, t.email from payment_links l join tenants t on t.id=l.tenant_id where l.token=$1`, [token]);
  if (!l) throw new Error('الرابط غير موجود');
  if (l.status === 'paid') throw new Error('تم سداد هذا الرابط');
  if (l.status === 'cancelled' || (l.expires_on && String(l.expires_on) < todayRiyadh())) throw new Error('انتهت صلاحية الرابط. اطلب رابطاً جديداً من الجهة');
  if (!payReady(S)) throw new Error('الدفع الإلكتروني غير مفعّل حالياً');
  const back = `${base}/pay/${token}/return${orgQ()}`;
  let url = '', pid = '';
  if (S.pay_provider === 'sandbox') { pid = 'sbx_' + randomBytes(6).toString('hex'); url = `${base}/pay/${token}/sandbox${orgQ()}`; }
  else if (S.pay_provider === 'moyasar') {
    const r = await fetch('https://api.moyasar.com/v1/invoices', { method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Basic ' + Buffer.from(S.pay_secret + ':').toString('base64'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: halalas(Number(l.amount)), currency: 'SAR', description: `${S.org} — ${l.description}`.slice(0, 250), callback_url: `${base}/api/pay/webhook${orgQ()}`, success_url: back, back_url: back, metadata: { token, org: currentOrg() } }) });
    const j: any = await r.json().catch(() => ({})); if (!r.ok || !j.url) throw new Error('بوابة ميسر رفضت الطلب: ' + (j.message || r.status));
    url = j.url; pid = j.id;
  } else if (S.pay_provider === 'tap') {
    const ph = String(l.phone ?? '').replace(/\D/g, '').replace(/^966/, '').replace(/^0/, '');
    const r = await fetch('https://api.tap.company/v2/charges', { method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + S.pay_secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(l.amount), currency: 'SAR', description: l.description, reference: { transaction: token }, metadata: { token, org: currentOrg() },
        customer: { first_name: l.tenant_name, ...(l.email ? { email: l.email } : {}), ...(ph ? { phone: { country_code: '966', number: ph } } : {}) },
        source: { id: 'src_all' }, redirect: { url: back }, post: { url: `${base}/api/pay/webhook${orgQ()}` } }) });
    const j: any = await r.json().catch(() => ({})); if (!r.ok || !j.transaction?.url) throw new Error('بوابة تاب رفضت الطلب: ' + (j.errors?.[0]?.description || r.status));
    url = j.transaction.url; pid = j.id;
  } else throw new Error('بوابة غير معروفة');
  await q(`update payment_links set provider=$2, provider_id=$3, checkout_url=$4, error=null where id=$1`, [l.id, S.pay_provider, pid, url]);
  return url;
}

/** يسأل البوابة عن حالة الدفع؛ إن كان مدفوعاً يسجل سند القبض مرة واحدة فقط */
export async function verifyLink(token: string): Promise<{ status: string; paymentId?: string; message?: string }> {
  const S = await getSettings();
  const [l] = await q('select * from payment_links where token=$1', [token]); if (!l) return { status: 'missing' };
  if (l.status === 'paid') return { status: 'paid', paymentId: l.payment_id };
  if (!l.provider_id) return { status: l.status };
  let paid = false, amount = Number(l.amount), pstat = '';
  if (l.provider === 'sandbox') { pstat = l.provider_status ?? 'initiated'; paid = pstat === 'paid'; }
  else if (l.provider === 'moyasar') {
    const r = await fetch(`https://api.moyasar.com/v1/invoices/${encodeURIComponent(l.provider_id)}`, { headers: { Authorization: 'Basic ' + Buffer.from(S.pay_secret + ':').toString('base64') }, signal: AbortSignal.timeout(20000) });
    const j: any = await r.json().catch(() => ({})); pstat = j.status ?? String(r.status); paid = j.status === 'paid'; if (paid && j.amount) amount = j.amount / 100;
  } else if (l.provider === 'tap') {
    const r = await fetch(`https://api.tap.company/v2/charges/${encodeURIComponent(l.provider_id)}`, { headers: { Authorization: 'Bearer ' + S.pay_secret }, signal: AbortSignal.timeout(20000) });
    const j: any = await r.json().catch(() => ({})); pstat = j.status ?? String(r.status); paid = j.status === 'CAPTURED'; if (paid && j.amount) amount = Number(j.amount);
  }
  await q('update payment_links set provider_status=$2 where id=$1', [l.id, pstat]);
  if (!paid) {
    if (/fail|declin|cancel|void|abandon/i.test(pstat)) { await q(`update payment_links set status='failed' where id=$1 and status in ('pending','processing')`, [l.id]); return { status: 'failed' }; }
    return { status: l.status };
  }
  // قفل الرابط حتى لا يُسجَّل السند مرتين لو وصل التحقق من مكانين في نفس اللحظة
  const [lock] = await q(`update payment_links set status='processing' where id=$1 and status in ('pending','failed','expired') returning id`, [l.id]);
  if (!lock) { const [now] = await q('select status, payment_id from payment_links where id=$1', [l.id]); return { status: now.status, paymentId: now.payment_id }; }
  try {
    const pid = await recordGatewayPayment(l, amount);
    await q(`update payment_links set status='paid', payment_id=$2, paid_amount=$3, paid_at=now() where id=$1`, [l.id, pid, amount]);
    await q(`insert into activity_log (username,action,entity,entity_id,details) values ('بوابة الدفع','سداد إلكتروني','payment',$1,$2)`, [pid, `${amount} ريال — ${l.provider} ${l.provider_id}`]);
    return { status: 'paid', paymentId: pid };
  } catch (e: any) {
    await q(`update payment_links set status='paid', paid_amount=$2, paid_at=now(), error=$3 where id=$1`, [l.id, amount, 'دُفع عند البوابة لكن تعذّر التسجيل الآلي: ' + e.message]);
    await q(`insert into exceptions (id,rule,scope,entity_id,reason,status) values ($1,'paylink_unposted','record',$2,$3,'pending') on conflict do nothing`, [uid('ex'), l.id, `دفعة إلكترونية ${amount} ريال لم تُسجَّل آلياً: ${e.message}`]).catch(() => {});
    return { status: 'paid', message: e.message };
  }
}

async function recordGatewayPayment(l: Record<string, any>, amount: number) {
  const today = todayRiyadh(), id = uid('pay');
  await tx(async (t) => {
    const cs = l.contract_id ? [l.contract_id] : (await t(`select id from contracts where tenant_id=$1 and status='active' order by start_date`, [l.tenant_id])).map((r) => r.id);
    const firstIds = String(l.installment_ids || '').split(',').filter(Boolean);
    let left = amount; const allocs: { id: string; amount: number; c: string }[] = [];
    for (const c of cs) {
      const bals = await t(`select i.id, i.no, i.due_date, round(i.amount - i.opening_paid - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id=a.payment_id where a.installment_id=i.id and not p.voided),0) - coalesce((select sum(d.amount) from adjustments d where d.installment_id=i.id and d.status='approved'),0), 2) as bal from installments i where i.contract_id=$1`, [c]);
      const rows = bals.map((r) => ({ id: r.id, no: Number(r.no), due_date: String(r.due_date), balance: Number(r.bal) })).sort((a, b) => Number(firstIds.includes(b.id)) - Number(firstIds.includes(a.id)) || a.due_date.localeCompare(b.due_date));
      const plan = planPayment(rows, left, rows.find((r) => firstIds.includes(r.id))?.id);
      for (const x of plan.allocations) allocs.push({ id: x.id, amount: x.amount, c });
      left = plan.excess; if (left <= 0) break;
    }
    const contract = allocs[0]?.c ?? l.contract_id ?? cs[0] ?? null;
    const [st] = await t(`update settings set value=(value::int+1)::text where key='receipt_seq' returning value`);
    const [pf] = await t(`select value from settings where key='receipt_prefix'`);
    const rno = `${pf?.value ?? 'R'}-${today.slice(0, 4)}-${String(st.value).padStart(4, '0')}`;
    await t('insert into payments (id,receipt_no,tenant_id,contract_id,paid_on,amount,method,bank_ref,note,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, rno, l.tenant_id, contract, today, amount, 'دفع إلكتروني (رابط دفع)', `${l.provider}:${l.provider_id}`, left > 0.009 ? `زيادة غير موزعة ${left.toFixed(2)} ريال — راجعها` : `رابط الدفع ${l.token.slice(0, 6)}`, 'بوابة الدفع']);
    for (const a of allocs) await t('insert into payment_allocations (payment_id,installment_id,amount) values ($1,$2,$3)', [id, a.id, a.amount]);
  });
  return id;
}

/** تحقق دوري من الروابط المعلّقة (من الجدولة) */
export async function sweepLinks() {
  await q(`update payment_links set status='expired' where status='pending' and expires_on < $1 and provider_id is null`, [todayRiyadh()]);
  const rows = await q(`select token from payment_links where status in ('pending','processing') and provider_id is not null and created_at > now() - interval '30 days' limit 50`);
  for (const r of rows) await verifyLink(r.token).catch(() => {});
}
