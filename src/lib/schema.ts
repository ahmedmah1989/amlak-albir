// مخطط قاعدة البيانات — يُطبَّق تلقائياً عند أول تشغيل (آمن للتكرار)
export const SCHEMA = `
create table if not exists settings (key text primary key, value text not null);
create table if not exists users (
  id text primary key, username text unique not null, full_name text not null,
  role text not null default 'viewer' check (role in ('admin','accountant','viewer')),
  pass_hash text not null, must_change boolean not null default false, active boolean not null default true,
  created_at timestamptz not null default now());
create table if not exists properties (
  id text primary key, name text not null, short text not null, type text, location text, ownership text,
  land_value numeric(14,2), building_value numeric(14,2), value_status text, deed_no text,
  notes text not null default '', ground_lease_end date, created_at timestamptz not null default now());
create table if not exists units (
  id text primary key, property_id text not null references properties(id) on delete cascade, code text not null,
  kind text not null default 'lease' check (kind in ('lease','subunit')),
  unit_type text, floor text, rooms text, occupant text, monthly_rent numeric(12,2), note text);
create table if not exists tenants (
  id text primary key, name text not null, phone text, national_id text, email text, notes text,
  created_at timestamptz not null default now());
create table if not exists contracts (
  id text primary key, property_id text not null references properties(id), unit_id text not null references units(id),
  tenant_id text not null references tenants(id), start_date date not null, end_date date not null,
  annual_rent numeric(14,2) not null default 0,
  frequency text check (frequency in ('monthly','quarterly','semiannual','annual','special')),
  status text not null default 'active' check (status in ('active','renewed','expired','terminated')),
  contract_no text, renewed_from text, notes text not null default '', created_at timestamptz not null default now());
create table if not exists installments (
  id text primary key, contract_id text not null references contracts(id) on delete cascade, no int not null,
  period_from date, period_to date, due_date date not null, amount numeric(14,2) not null,
  opening_paid numeric(14,2) not null default 0, needs_confirmation boolean not null default false,
  note text not null default '');
create table if not exists payments (
  id text primary key, receipt_no text unique not null, tenant_id text not null references tenants(id),
  contract_id text references contracts(id), paid_on date not null, amount numeric(14,2) not null,
  method text not null, bank_ref text, note text, voided boolean not null default false, void_reason text,
  created_by text, created_at timestamptz not null default now());
create table if not exists payment_allocations (
  payment_id text not null references payments(id) on delete cascade,
  installment_id text not null references installments(id) on delete cascade, amount numeric(14,2) not null,
  primary key (payment_id, installment_id));
create table if not exists adjustments (
  id text primary key, tenant_id text references tenants(id), property_id text references properties(id),
  contract_id text references contracts(id), installment_id text references installments(id) on delete set null,
  installment_no int, type text not null, amount numeric(14,2) not null, approved_by text, decision_no text,
  date date, note text, created_by text);
create table if not exists followups (
  id text primary key, tenant_id text not null references tenants(id), date date not null, type text not null,
  details text, next_date date, created_by text);
create table if not exists expenses (
  id text primary key, property_id text not null references properties(id), date date not null,
  category text not null, amount numeric(14,2) not null, vendor text, ref text, description text,
  created_by text, created_at timestamptz not null default now());
create table if not exists audit_notes (
  id text primary key, category text not null, property_id text references properties(id), tenant_name text,
  unit text, amount numeric(14,2), ref text, ref_date date, source text, details text,
  status text not null default 'open' check (status in ('open','resolved')), resolution text,
  resolved_by text, resolved_at timestamptz);
create table if not exists activity_log (
  id bigserial primary key, at timestamptz not null default now(), username text, action text not null,
  entity text, entity_id text, details text);
alter table users add column if not exists prefs text not null default '{}';
alter table users add column if not exists perms text not null default '{}';
create table if not exists record_changes (
  id bigserial primary key, at timestamptz not null default now(), username text, entity text not null, entity_id text not null,
  field text not null, label text, old_value text, new_value text);
create index if not exists ix_rc on record_changes(entity, entity_id);
alter table adjustments add column if not exists status text not null default 'approved';
alter table adjustments add column if not exists requested_by text;
alter table adjustments add column if not exists approved_at timestamptz;
alter table payments add column if not exists bank_line_id text;
alter table contracts add column if not exists ejar_property_id text;
alter table contracts add column if not exists broker text;
alter table contracts add column if not exists trade_name text;
alter table installments add column if not exists src_receipt text;
alter table installments add column if not exists src_dates text;
alter table installments add column if not exists rating text;
alter table tenants add column if not exists tenant_type text not null default 'individual';
alter table tenants add column if not exists nationality text;
alter table tenants add column if not exists id_expiry date;
alter table tenants add column if not exists cr_no text;
alter table tenants add column if not exists cr_expiry date;
alter table tenants add column if not exists vat_no text;
alter table tenants add column if not exists phone2 text;
alter table tenants add column if not exists contact_person text;
alter table tenants add column if not exists address text;
alter table tenants add column if not exists guarantor_name text;
alter table tenants add column if not exists guarantor_phone text;
alter table tenants add column if not exists guarantor_id text;
alter table contracts add column if not exists usage text;
alter table contracts add column if not exists signed_on date;
alter table contracts add column if not exists deposit numeric(14,2);
alter table contracts add column if not exists deposit_status text;
alter table contracts add column if not exists vat_rate numeric(5,2);
alter table contracts add column if not exists escalation_pct numeric(6,2);
alter table contracts add column if not exists ejar_fees numeric(14,2);
alter table contracts add column if not exists brokerage numeric(14,2);
alter table contracts add column if not exists utilities text;
alter table contracts add column if not exists notice_days int;
alter table contracts add column if not exists auto_renew boolean not null default false;
alter table contracts add column if not exists vacated_on date;
alter table units add column if not exists area numeric(10,2);
alter table units add column if not exists elec_meter text;
alter table units add column if not exists water_meter text;
alter table units add column if not exists features text;
alter table units add column if not exists parent_id text;
alter table units add column if not exists status text;
alter table installments add column if not exists kind text not null default 'rent';
alter table tenants add column if not exists collector text;
alter table tenants add column if not exists portal_token text;
create table if not exists meter_readings (
  id text primary key, unit_id text not null references units(id) on delete cascade, kind text not null check (kind in ('elec','water')),
  read_on date not null, reading numeric(14,2) not null, consumption numeric(14,2), rate numeric(10,4), amount numeric(14,2),
  charged boolean not null default false, installment_id text, note text, created_by text, created_at timestamptz not null default now());
create index if not exists ix_meter_unit on meter_readings(unit_id, kind, read_on);
create table if not exists property_budgets (
  property_id text not null references properties(id) on delete cascade, year int not null, revenue numeric(14,2), expenses numeric(14,2), note text,
  primary key (property_id, year));
alter table contracts add column if not exists handover_notes text;
alter table contracts add column if not exists deposit_refund numeric(14,2);
alter table contracts add column if not exists deposit_deduction numeric(14,2);
create table if not exists attachments (
  id text primary key, entity text not null, entity_id text not null, category text, file_name text not null,
  mime text not null, size int not null, data bytea not null, expires_on date, note text, created_by text,
  created_at timestamptz not null default now());
create index if not exists ix_att on attachments(entity, entity_id);
create table if not exists ejar_installments (
  id text primary key, contract_no text not null, installment_no text not null unique, invoice_no text,
  issue_date date, due_date date, amount numeric(14,2), status text, contract_type text, ejar_property_id text,
  state text, start_date date, end_date date, version text, broker text, contract_id text references contracts(id) on delete set null,
  installment_id text references installments(id) on delete set null, file_name text, imported_by text, imported_at timestamptz not null default now());
create table if not exists bank_accounts (id text primary key, name text not null, bank text, iban text, mapping text);
create table if not exists bank_imports (
  id text primary key, account_id text references bank_accounts(id), file_name text, status text not null default 'pending',
  raw text, mapping text, rows int, date_from date, date_to date, created_by text, created_at timestamptz not null default now());
create table if not exists bank_lines (
  id text primary key, import_id text references bank_imports(id) on delete cascade, account_id text, date date not null,
  description text, ref text, amount numeric(14,2) not null, fingerprint text unique,
  status text not null default 'open' check (status in ('open','matched','ignored')), payment_id text, note text,
  matched_by text, matched_at timestamptz);
create table if not exists exceptions (
  id text primary key, rule text not null, scope text not null, entity_id text, property_id text, before_date date,
  reason text not null, requested_by text, approved_by text, status text not null default 'pending',
  expires_on date, created_at timestamptz not null default now());
create table if not exists maintenance (
  id text primary key, property_id text not null references properties(id), unit_id text references units(id), title text not null,
  details text, priority text not null default 'عادية', status text not null default 'open', vendor text,
  est_cost numeric(14,2), cost numeric(14,2), charge_to text not null default 'الجمعية', opened_on date not null,
  closed_on date, expense_id text, created_by text, created_at timestamptz not null default now());
create table if not exists tasks (
  id text primary key, title text not null, details text, due date, assignee text, priority text not null default 'p2',
  status text not null default 'open', created_by text, created_at timestamptz not null default now());
create table if not exists task_states (key text primary key, status text not null, until date, by_user text, at timestamptz not null default now());
create table if not exists backups_log (
  id text primary key, at timestamptz not null default now(), kind text, size int, target text, status text, note text, by_user text);
create index if not exists ix_inst_contract on installments(contract_id);
create index if not exists ix_inst_due on installments(due_date);
create index if not exists ix_alloc_inst on payment_allocations(installment_id);
create index if not exists ix_pay_tenant on payments(tenant_id);
create index if not exists ix_contract_tenant on contracts(tenant_id);
create table if not exists property_valuations (
  id text primary key, property_id text not null references properties(id) on delete cascade,
  kind text not null default 'revaluation', val_date date, land_value numeric(14,2), building_value numeric(14,2),
  prev_land numeric(14,2), prev_building numeric(14,2), basis text, valuer text, ref_no text, decision_no text, note text,
  created_by text, created_at timestamptz not null default now());
create index if not exists ix_val_prop on property_valuations(property_id, val_date);
alter table properties add column if not exists land_basis text;
alter table properties add column if not exists land_area numeric(12,2);
alter table properties add column if not exists building_area numeric(12,2);
alter table properties add column if not exists data_status text not null default 'confirmed';
alter table properties add column if not exists data_source text;
create table if not exists saved_reports (
  id text primary key, user_id text not null, kind text not null default 'saved', report_id text not null, name text not null,
  href text not null, shared boolean not null default false, created_at timestamptz not null default now());
alter table payments add column if not exists reviewed_by text;
alter table payments add column if not exists reviewed_at timestamptz;
create table if not exists vouchers (
  id text primary key, voucher_no text unique not null, date date not null, kind text not null default 'deposit_refund',
  tenant_id text references tenants(id), contract_id text references contracts(id), payee text not null, amount numeric(14,2) not null,
  method text not null, bank_ref text, note text, status text not null default 'pending', created_by text, approved_by text, approved_at timestamptz,
  void_reason text, created_at timestamptz not null default now());
create table if not exists invoices (
  id text primary key, invoice_no text unique not null, kind text not null default 'invoice', issue_date date not null, supply_date date,
  tenant_id text references tenants(id), contract_id text references contracts(id), installment_id text references installments(id) on delete set null, payment_id text,
  ref_invoice text, buyer_name text not null, buyer_vat text, description text not null, net numeric(14,2) not null, vat_rate numeric(5,2) not null, vat numeric(14,2) not null,
  total numeric(14,2) not null, seller_name text not null, seller_vat text, qr text, uuid text not null, prev_hash text, hash text, icv int, status text not null default 'issued',
  zatca_status text not null default 'not_sent', created_by text, created_at timestamptz not null default now());
create table if not exists import_batches (
  id text primary key, batch_no text not null, file_name text, source_kind text not null, status text not null default 'preview',
  summary text, payload text not null, created_by text, created_at timestamptz not null default now(), committed_by text, committed_at timestamptz, reverted_by text, reverted_at timestamptz);
alter table properties add column if not exists import_batch text;
alter table units add column if not exists import_batch text;
alter table tenants add column if not exists import_batch text;
alter table contracts add column if not exists import_batch text;
alter table installments add column if not exists import_batch text;
alter table users add column if not exists recovery text;
alter table users add column if not exists email text;
alter table users add column if not exists phone text;
alter table users add column if not exists secret_q text;
alter table users add column if not exists secret_a text;
alter table users add column if not exists recovery_word text;
create table if not exists password_otps (
  id text primary key, user_id text not null, channel text not null, code_hash text not null, expires_at timestamptz not null,
  attempts int not null default 0, used boolean not null default false, created_at timestamptz not null default now());
create table if not exists notify_rules (
  id text primary key, kind text not null, name text not null, offset_days int not null default 0, repeat_days int not null default 0,
  channels text not null default 'internal', audience text not null default 'tenant', subject text not null default '', template text not null default '',
  mode text not null default 'review', active boolean not null default true, created_by text, created_at timestamptz not null default now());
create table if not exists notify_queue (
  id text primary key, rule_id text, kind text not null, channel text not null, dedupe text not null, tenant_id text, user_id text, entity_id text,
  to_addr text, recipient text, subject text, body text not null, status text not null default 'pending', error text, scheduled_on date not null,
  approved_by text, sent_by text, sent_at timestamptz, created_at timestamptz not null default now());
create unique index if not exists notify_queue_dedupe on notify_queue(dedupe);
create table if not exists notifications (
  id text primary key, user_id text, title text not null, body text, href text, tone text not null default 'info', read_by text not null default '',
  created_at timestamptz not null default now());
alter table tenants add column if not exists notify_opt_out boolean not null default false;
alter table invoices add column if not exists xml text;
alter table invoices add column if not exists zhash text;
alter table invoices add column if not exists zatca_response text;
alter table invoices add column if not exists zatca_sent_at timestamptz;
alter table invoices add column if not exists standard boolean not null default false;
create table if not exists licenses (
  id text primary key, property_id text not null, kind text not null, number text, issuer text, issue_date date, expiry_date date, notes text not null default '',
  created_by text, created_at timestamptz not null default now());
create table if not exists vendors (
  id text primary key, name text not null, trade text, phone text, email text, cr text, vat text, iban text, contact text, rating int, notes text not null default '', active boolean not null default true,
  created_at timestamptz not null default now());
alter table maintenance add column if not exists vendor_id text;
alter table maintenance add column if not exists wo_no text;
alter table maintenance add column if not exists wo_issued_on date;
alter table maintenance add column if not exists pm_plan_id text;
alter table maintenance add column if not exists scheduled_on date;
create table if not exists pm_plans (
  id text primary key, property_id text not null, unit_id text, title text not null, trade text, vendor_id text, every_months int not null default 3, next_due date not null,
  est_cost numeric(14,2), active boolean not null default true, last_done date, created_by text, created_at timestamptz not null default now());
create table if not exists unit_assets (
  id text primary key, unit_id text not null, name text not null, qty int not null default 1, brand text, serial text, condition text not null default 'جيد', cost numeric(14,2), notes text not null default '',
  created_at timestamptz not null default now());
create table if not exists inspections (
  id text primary key, contract_id text, unit_id text not null, kind text not null, date date not null, items text not null default '[]', notes text not null default '',
  inspector text, tenant_present boolean not null default false, created_by text, created_at timestamptz not null default now());
create table if not exists lease_obligations (
  id text primary key, property_id text not null, landlord text not null, contract_no text, start_date date not null, end_date date not null, annual_amount numeric(14,2) not null,
  frequency text not null default 'annual', iban text, notes text not null default '', created_by text, created_at timestamptz not null default now());
create table if not exists obligation_payments (
  id text primary key, obligation_id text not null, due_date date not null, amount numeric(14,2) not null, paid_on date, paid_amount numeric(14,2), ref text, expense_id text,
  status text not null default 'due', created_by text);
create table if not exists payment_links (
  id text primary key, token text unique not null, tenant_id text not null, contract_id text, installment_ids text not null default '', amount numeric(14,2) not null,
  description text not null default '', provider text, provider_id text, checkout_url text, provider_status text, status text not null default 'pending',
  payment_id text, paid_amount numeric(14,2), paid_at timestamptz, expires_on date, error text, created_by text, created_at timestamptz not null default now());
`;
export const TABLES = ['settings','users','properties','units','tenants','contracts','installments','payments',
  'payment_allocations','adjustments','followups','expenses','audit_notes','activity_log','attachments','ejar_installments',
  'bank_accounts','bank_imports','bank_lines','exceptions','maintenance','tasks','task_states','backups_log','record_changes','meter_readings','property_budgets','property_valuations','saved_reports','vouchers','invoices','import_batches','notify_rules','notify_queue','notifications','payment_links','licenses','vendors','pm_plans','unit_assets','inspections','lease_obligations','obligation_payments'];
export const DEFAULT_SETTINGS: [string, string][] = [
  ['brand_primary', '#456a42'], ['brand_accent', '#ba8f0e'], ['brand_side', '#23361f'], ['brand_bg', '#f4f5f1'], ['brand_logo', ''],
  ['font_default', 'Readex Pro'], ['date_format', 'dd/MM/yyyy'], ['locked_until', ''], ['backup_keep', '14'], ['grace_days', '10'],
  ['receipt_prefix', 'R'], ['receipt_seq', '0'], ['voucher_seq', '0'], ['invoice_seq', '0'], ['org_vat_no', ''], ['org_cr', ''], ['org_address', ''], ['org_phone', ''], ['org_signatory', ''], ['features', '{}'], ['late_fee_pct', '2'], ['late_fee_after', '30'], ['late_fee_cap_pct', '10'], ['elec_rate', '0.18'], ['water_rate', '6'], ['notify_hour', '9'], ['notify_last_run', ''], ['notify_enabled', '0'], ['wa_url', ''], ['wa_method', 'POST'], ['wa_body', ''], ['pay_provider', ''], ['pay_base_url', ''], ['pay_link_days', '7'], ['wo_seq', '0'],
];
