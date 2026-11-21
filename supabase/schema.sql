-- مخطط قاعدة البيانات (للاطلاع؛ البرنامج ينشئه ويحدّثه تلقائياً)
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
alter table adjustments add column if not exists status text not null default 'approved';
alter table adjustments add column if not exists requested_by text;
alter table adjustments add column if not exists approved_at timestamptz;
alter table payments add column if not exists bank_line_id text;
alter table contracts add column if not exists ejar_property_id text;
alter table contracts add column if not exists broker text;
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
