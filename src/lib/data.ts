import 'server-only';
import { q, qAll } from './db';
import type { DB } from './types';
import { parseFeatures } from './features';

export function todayRiyadh() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export async function getSettings(): Promise<Record<string, string>> {
  return Object.fromEntries((await q('select key,value from settings')).map((r) => [r.key, r.value]));
}
export async function loadDB(): Promise<DB> {
  // One round trip on hosted postgres (qAll batches via the simple protocol); locally PGlite runs them in order.
  const [sr, properties, units, tenants, contracts, installments, payments, allocations, adjustments, followups, expenses, notes,
    attachments, ejar, bankLines, exceptions, maintenance, tasks, taskStates, meters, budgets, users, valuations, vouchers, invoices] = await qAll([
    { s: 'select key,value from settings' },
    { s: 'select * from properties order by created_at, id' },
    { s: 'select * from units order by property_id, kind, code' },
    { s: 'select * from tenants order by name' },
    { s: 'select * from contracts order by start_date, id' },
    { s: 'select * from installments order by contract_id, no' },
    { s: 'select * from payments order by paid_on desc, receipt_no desc' },
    { s: 'select a.* from payment_allocations a join payments p on p.id=a.payment_id where not p.voided' },
    { s: 'select * from adjustments order by id' },
    { s: 'select * from followups order by date desc, id desc' },
    { s: 'select * from expenses order by date desc, created_at desc' },
    { s: 'select * from audit_notes order by status, category, id' },
    { s: 'select id,entity,entity_id,category,file_name,mime,size,expires_on,created_by,created_at from attachments order by created_at desc' },
    { s: 'select * from ejar_installments order by contract_no, issue_date' },
    { s: 'select * from bank_lines order by date desc, id' },
    { s: 'select * from exceptions order by created_at desc' },
    { s: 'select * from maintenance order by opened_on desc, created_at desc' },
    { s: "select * from tasks where status='open' order by due nulls last, created_at" },
    { s: 'select * from task_states where until is null or until >= $1', p: [todayRiyadh()] },
    { s: 'select * from meter_readings order by unit_id, kind, read_on' },
    { s: 'select * from property_budgets order by year, property_id' },
    { s: 'select id, full_name, role, active from users order by full_name' },
    { s: 'select * from property_valuations order by property_id, val_date nulls first, created_at' },
    { s: 'select * from vouchers order by date desc, voucher_no desc' },
    { s: 'select id,invoice_no,kind,issue_date,supply_date,tenant_id,contract_id,installment_id,payment_id,ref_invoice,buyer_name,buyer_vat,description,net,vat_rate,vat,total,seller_name,seller_vat,qr,uuid,prev_hash,hash,icv,status,zatca_status,zatca_response,zatca_sent_at,standard,(xml is not null) as signed,created_by,created_at from invoices order by issue_date desc, invoice_no desc' },
  ]);
  const s = Object.fromEntries(sr.map((r) => [r.key, r.value]));
  return {
    meta: { org: s.org, today: todayRiyadh(), grace_days: Number(s.grace_days ?? 10), opening_date: s.opening_date, date_format: s.date_format || 'dd/MM/yyyy', locked_until: s.locked_until || '', features: parseFeatures(s.features), settings: s },
    properties, units, tenants, contracts, installments, payments, allocations, adjustments, followups, expenses, notes,
    attachments, ejar, bankLines, exceptions, maintenance, tasks, taskStates, meters, budgets, users, valuations, vouchers, invoices,
  } as unknown as DB;
}
