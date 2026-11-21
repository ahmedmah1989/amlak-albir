'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx, uid } from './db';
import { requireUser, log } from './auth';
import { todayRiyadh, getSettings } from './data';
import { assertOpenPeriod } from './guard';
import { parseFeatures } from './features';
import { zatcaQr, newUuid, invoiceHash, FIRST_PIH } from './zatca';
import { zatcaActive, signForInvoice, submitInvoice } from './zatca-engine';

type Q = (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>;
const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
function back(path: string, err: string): never { redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(err)}`); }
function done(path: string, ok: string): never { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(ok)}`); }
const r2 = (x: number) => Math.round(x * 100) / 100;

async function guard(path: string) {
  const S = await getSettings();
  if (!parseFeatures(S.features).e_invoice) back(path, 'ميزة الفاتورة الضريبية غير مفعّلة. فعّلها من الإدارة ← الميزات الاختيارية');
  if (!S.org_vat_no || !/^3\d{13}3$/.test(S.org_vat_no)) back(path, 'أدخل الرقم الضريبي للجمعية (15 رقماً يبدأ وينتهي بـ 3) في الإعدادات ← بيانات الجهة قبل إصدار الفواتير');
  return S;
}
/** ينشئ فاتورة داخل معاملة: رقم متسلسل، عداد ICV، تجزئة متسلسلة PIH، ورمز QR للمرحلة الأولى */
async function insertInvoice(t: Q, S: Record<string, string>, u: { full_name: string }, f: { kind: 'invoice' | 'credit'; tenant_id: string | null; contract_id: string | null; installment_id: string | null; ref_invoice: string | null;
  buyer_name: string; buyer_vat: string | null; description: string; total: number; vat_rate: number; supply_date: string | null }) {
  const [seqR] = await t(`update settings set value=(coalesce(nullif(value,''),'0')::int+1)::text where key='invoice_seq' returning value`);
  const icv = seqR ? Number(seqR.value) : 1;
  const [prev] = await t(`select hash from invoices order by icv desc nulls last limit 1`);
  const net = f.vat_rate ? r2(f.total / (1 + f.vat_rate / 100)) : r2(f.total), vat = r2(f.total - net);
  const no = `${f.kind === 'credit' ? 'CN' : 'INV'}-${todayRiyadh().slice(0, 4)}-${String(icv).padStart(6, '0')}`;
  const at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), id = uid('inv'), uuid = newUuid();
  const qr = zatcaQr({ seller: S.org, vat: S.org_vat_no, at, total: f.total, tax: vat });
  const body = { invoice_no: no, uuid, icv, issue_date: todayRiyadh(), issued_at: at, kind: f.kind, seller_vat: S.org_vat_no, buyer_name: f.buyer_name, buyer_vat: f.buyer_vat, net, vat, total: f.total, ref: f.ref_invoice, pih: prev?.hash ?? FIRST_PIH };
  const hash = invoiceHash(body);
  await t(`insert into invoices (id,invoice_no,kind,issue_date,supply_date,tenant_id,contract_id,installment_id,ref_invoice,buyer_name,buyer_vat,description,net,vat_rate,vat,total,seller_name,seller_vat,qr,uuid,prev_hash,hash,icv,status,created_by)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'issued',$24)`,
    [id, no, f.kind, todayRiyadh(), f.supply_date, f.tenant_id, f.contract_id, f.installment_id, f.ref_invoice, f.buyer_name, f.buyer_vat, f.description, net, f.vat_rate, vat, f.total, S.org, S.org_vat_no, qr, uuid, prev?.hash ?? FIRST_PIH, hash, icv, u.full_name]);
  if (zatcaActive(S)) { const [tn] = f.tenant_id ? await t('select address from tenants where id=$1', [f.tenant_id]) : [];
    await signForInvoice(t, S, { id, no, uuid, icv, at, kind: f.kind, buyer_name: f.buyer_name, buyer_vat: f.buyer_vat, buyer_address: tn?.address ?? null, description: f.description, net, vat, total: f.total, vat_rate: f.vat_rate, supply_date: f.supply_date, ref_no: f.ref_invoice, reason: f.kind === 'credit' ? f.description : null }); }
  return { id, no };
}

async function issueFor(t: Q, S: Record<string, string>, u: { full_name: string }, instId: string) {
  const [i] = await t(`select i.*, c.tenant_id, c.vat_rate, c.property_id, c.unit_id, c.id as cid from installments i join contracts c on c.id=i.contract_id where i.id=$1`, [instId]);
  if (!i) return { err: 'قسط غير موجود' };
  const [dup] = await t(`select invoice_no from invoices where installment_id=$1 and kind='invoice' and status='issued'`, [instId]);
  if (dup) return { err: `القسط له فاتورة سارية ${dup.invoice_no}` };
  const [tn] = await t('select name, vat_no from tenants where id=$1', [i.tenant_id]);
  const [p] = await t('select name from properties where id=$1', [i.property_id]); const [un] = await t('select code from units where id=$1', [i.unit_id]);
  const kind = { rent: 'إيجار', service: 'خدمات', fee: 'غرامة تأخير', plan: 'جدولة متأخرات' }[String(i.kind ?? 'rent')] ?? 'إيجار';
  const desc = `${kind} ${p?.name ?? ''} — ${un?.code ?? ''} • قسط ${i.no}${i.period_from ? ` عن الفترة ${i.period_from} إلى ${i.period_to}` : ''}`;
  return insertInvoice(t, S, u, { kind: 'invoice', tenant_id: i.tenant_id, contract_id: i.cid, installment_id: instId, ref_invoice: null, buyer_name: tn?.name ?? '—', buyer_vat: tn?.vat_no ?? null,
    description: desc, total: Number(i.amount), vat_rate: Number(i.vat_rate ?? 0), supply_date: i.period_from ?? i.due_date });
}

export async function issueInvoice(fd: FormData) {
  const u = await requireUser('accountant'); const id = s(fd, 'installment_id')!; const path = `/installments/${id}`;
  const S = await guard(path); await assertOpenPeriod(todayRiyadh(), path);
  const r = await tx((t) => issueFor(t, S, u, id));
  if ('err' in r) back(path, r.err!);
  await log(u, 'إصدار فاتورة ضريبية', 'invoice', r.id, r.no);
  const z = zatcaActive(S) ? await submitInvoice(r.id).catch((e) => ({ ok: false, msg: e.message })) : null;
  done(`/invoices/${r.id}`, `صدرت الفاتورة ${r.no}${z ? ` • ${z.msg}` : ''}`);
}
export async function issueInvoices(fd: FormData) {
  const u = await requireUser('accountant'); const ids = String(fd.get('ids') ?? '').split(',').filter(Boolean).slice(0, 200);
  const S = await guard('/invoices'); await assertOpenPeriod(todayRiyadh(), '/invoices');
  let ok = 0; const errs: string[] = [];
  for (const id of ids) { const r = await tx((t) => issueFor(t, S, u, id)); if ('err' in r) errs.push(r.err!); else { ok++; if (zatcaActive(S)) await submitInvoice(r.id).catch(() => {}); } }
  await log(u, 'إصدار فواتير ضريبية', 'invoice', undefined, `${ok} فاتورة${errs.length ? ` • تُرك ${errs.length}` : ''}`);
  done('/invoices', `صدرت ${ok} فاتورة${errs.length ? ` • تُرك ${errs.length} (لها فواتير سارية أو غير صالحة)` : ''}`);
}
export async function creditInvoice(fd: FormData) {
  const u = await requireUser('admin'); const id = s(fd, 'id')!, reason = s(fd, 'reason'); const path = `/invoices/${id}`;
  if (!reason) back(path, 'سبب إشعار الدائن مطلوب');
  const S = await guard(path);
  const [inv] = await q('select * from invoices where id=$1', [id]); if (!inv) back('/invoices', 'الفاتورة غير موجودة');
  if (inv.kind !== 'invoice' || inv.status !== 'issued') back(path, 'لا يمكن إصدار إشعار دائن لهذه الفاتورة');
  const r = await tx(async (t) => {
    const c = await insertInvoice(t, S, u, { kind: 'credit', tenant_id: inv.tenant_id, contract_id: inv.contract_id, installment_id: inv.installment_id, ref_invoice: inv.invoice_no, buyer_name: inv.buyer_name, buyer_vat: inv.buyer_vat,
      description: `إشعار دائن للفاتورة ${inv.invoice_no} — ${reason}`, total: Number(inv.total), vat_rate: Number(inv.vat_rate), supply_date: inv.supply_date });
    await t(`update invoices set status='credited' where id=$1`, [id]); return c;
  });
  await log(u, 'إصدار إشعار دائن', 'invoice', r.id, `${r.no} للفاتورة ${inv.invoice_no} — ${reason}`);
  const z = zatcaActive(S) ? await submitInvoice(r.id).catch((e) => ({ ok: false, msg: e.message })) : null;
  done(`/invoices/${r.id}`, `صدر إشعار الدائن ${r.no}${z ? ` • ${z.msg}` : ''}`);
}
