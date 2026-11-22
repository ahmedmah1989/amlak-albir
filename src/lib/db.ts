import 'server-only';
import { randomBytes } from 'crypto';
import { SCHEMA, TABLES, DEFAULT_SETTINGS } from './schema';
import seed from '@/data/seed.json';
import { hashPassword } from './password';
import { runMigrations09 } from './import09';
import { AsyncLocalStorage } from 'async_hooks';
import { headers } from 'next/headers';

/**
 * تعدد الجهات (للاستضافة السحابية): كل جهة لها قاعدة بيانات معزولة تماماً.
 * - المحلي (الافتراضي): جهة واحدة «main» في data/db كما كان.
 * - السحابي AMLAK_MULTI=1: الجهة تُحدد من النطاق الفرعي أو رمز الجهة في صفحة الدخول (يمررها middleware في x-amlak-org)،
 *   والمهام الخلفية تحدد الجهة صراحة بـ runAs. قاعدة «__platform» تحفظ سجل الجهات ومستخدمي لوحة المالك.
 */
export const MULTI = process.env.AMLAK_MULTI === '1';
export const MAIN = 'main', PLATFORM = '__platform';
export const validSlug = (x: string) => /^[a-z][a-z0-9-]{1,29}$/.test(x) && x !== 'main' && x !== 'platform' && x !== 'www' && x !== 'api';
const als = new AsyncLocalStorage<string>();
export const runAs = <T,>(org: string, fn: () => Promise<T>) => als.run(org, fn);
/** مصدر تحديد الجهة: النطاق الفرعي أو رمز محفوظ أو لا شيء */
export function orgSource(): 'host' | 'cookie' | 'none' {
  if (!MULTI) return 'none';
  try { const H = headers(), base = (process.env.AMLAK_BASE_DOMAIN || '').toLowerCase().replace(/^\./, ''), host = (H.get('x-amlak-host') || '').toLowerCase().split(':')[0];
    if (base && host.endsWith('.' + base) && validSlug(host.slice(0, -base.length - 1))) return 'host'; return H.get('x-amlak-org') ? 'cookie' : 'none'; } catch { return 'none'; }
}
export function currentOrg(): string {
  const s = als.getStore(); if (s) return s;
  if (!MULTI) return MAIN;
  try {
    const H = headers(), base = (process.env.AMLAK_BASE_DOMAIN || '').toLowerCase().replace(/^\./, '');
    const host = (H.get('x-amlak-host') || '').toLowerCase().split(':')[0];
    if (base && host.endsWith('.' + base)) { const sub = host.slice(0, -base.length - 1); if (validSlug(sub)) return sub; }
    const h = (H.get('x-amlak-org') || '').toLowerCase(); if (h === MAIN || validSlug(h)) return h;
  } catch {}
  return MAIN;
}

export type Row = Record<string, any>;
export type Q = (sql: string, params?: unknown[]) => Promise<Row[]>;
interface Driver { kind: 'postgres' | 'pglite'; q: Q; exec: (sql: string) => Promise<void>; tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T> }

async function makeDriver(org: string): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (!url && (process.env.NETLIFY || process.env.VERCEL)) throw new Error('DATABASE_URL is required on hosted deployments');
  if (url) {
    const postgres = (await import('postgres')).default;
    const schema = org === MAIN ? 'public' : org === PLATFORM ? 'platform' : 'org_' + org.replace(/-/g, '_');
    if (schema !== 'public') { const boot = postgres(url, { max: 1, onnotice: () => {} }); await boot.unsafe(`create schema if not exists ${schema}`); await boot.end(); }
    const sql = postgres(url, {
      prepare: false, // one socket per lambda: minimal pooler slots, and max:1 is the driver's
      // supported config for sql.begin transactions. Serialization itself is the chain below.
      max: 1, connection: { search_path: schema } as any, // serverless: short idle timeout lets the lambda event loop drain right after the response;
      // a 20s idle socket held invocations open until the 30s platform kill, delaying the response.
      idle_timeout: 1, onnotice: () => {},
      types: {
        numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
        date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
        bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      } as any,
    });
    // Transaction-pooler compatibility (source-grounded): postgres.js execute() writes EVERY
    // queued query to the socket immediately - pipelining (postgres/src/connection.js) - and
    // the Supabase shared pooler in transaction mode hangs on pipelined traffic, documented at
    // supabase.com/docs/guides/database/postgres-js ("can hang queries or return mismatched
    // rows"); max_pipeline: 0 is broken upstream (breaks sql.begin). Observed on this deploy:
    // the first query per connection completed, every query behind it hung until the 30s kill.
    // So EVERY statement - plain, exec and transactions - goes through ONE promise chain per
    // driver: a single query is ever on the wire, which the pooler serves request-response.
    // Deadlock audit: every tx callback and helper uses the callback-scoped Q (t: Q); nothing
    // calls module-level q/tx inside a tx callback, which would deadlock this chain by design.
    let chain: Promise<unknown> = Promise.resolve();
    const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => {
      const run = chain.then(fn);
      chain = run.then(() => undefined, () => undefined); // chain survives rejections
      return run;
    };
    // Settle-guarantee backstop: a query stuck in the pooler (or canceled server-side) can
    // leave postgres.js's promise pending forever; the platform then holds the buffered
    // response until the 30s kill. Query.cancel() is the supported teardown: queued queries
    // reject immediately, active ones receive a server CancelRequest. Labels are
    // keyword:table only - never SQL text or values.
    const labelOf = (s: string) => { const m = s.trim().toLowerCase().match(/^(\w+)[\s\S]*?(?:from|into|update)\s+([a-z_][a-z0-9_]*)/); return m ? m[1] + ':' + m[2] : s.trim().slice(0, 12).replace(/[^a-z]/gi, ''); };
    const guard = async (query: any, label: string): Promise<any> => {
      const timer = setTimeout(() => { console.log('[db-timeout]', label); try { query.cancel?.(); } catch {} }, 12000);
      timer.unref?.();
      try { return await query; } finally { clearTimeout(timer); }
    };
    const q: Q = (s, p = []) => enqueue(async () => [...(await guard(sql.unsafe(s, p as any[]) as any, labelOf(s)))] as Row[]);
    return {
      kind: 'postgres', q,
      exec: (s) => enqueue(async () => { await sql.unsafe(s); }),
      tx: (fn) => enqueue(() => sql.begin((t: any) => fn(async (s, p = []) => [...(await guard(t.unsafe(s, p) as any, 'tx:' + labelOf(s)))]))) as any,
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const base = process.env.PGLITE_DIR || (process.env.VERCEL ? '/tmp/aqarat-db' : './data/db');
  const dir = org === MAIN ? base : (await import('path')).join(process.env.AMLAK_ORGS_DIR || (await import('path')).join(base, '..', 'orgs'), org === PLATFORM ? '_platform' : org);
  (await import('fs')).mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir, { parsers: { 1082: (v: string) => v, 1700: (v: string) => Number(v), 20: (v: string) => Number(v) } });
  const q: Q = async (s, p = []) => (await db.query<Row>(s, p as any[])).rows;
  return {
    kind: 'pglite', q,
    exec: async (s) => { await db.exec(s); },
    tx: (fn) => db.transaction((t) => fn(async (s, p = []) => (await t.query<Row>(s, p as any[])).rows)),
  };
}

async function insertMany(q: Q, table: string, rows: Row[], cols: string[]) {
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100); const params: unknown[] = [];
    const vals = chunk.map((r) => '(' + cols.map((c) => { params.push(r[c] ?? null); return `$${params.length}`; }).join(',') + ')');
    await q(`insert into ${table} (${cols.join(',')}) values ${vals.join(',')} on conflict do nothing`, params);
  }
}

function adminPassword(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  if (process.env.DATABASE_URL) throw new Error('ADMIN_PASSWORD is required in cloud mode');
  return 'admin123'; // local PGlite dev convenience only
}

async function seedIfEmpty(d: Driver) {
  const [{ n }] = await d.q('select count(*)::int as n from properties');
  if (n > 0) return;
  const s = seed as any;
  await d.tx(async (q) => {
    const settings: [string, string][] = [['org', s.meta.org], ['grace_days', String(s.meta.grace_days)], ['opening_date', s.meta.opening_date],
      ['receipt_prefix', 'R'], ['receipt_seq', '0'], ['session_secret', randomBytes(32).toString('hex')]];
    for (const [k, v] of settings) await q('insert into settings values ($1,$2) on conflict do nothing', [k, v]);
    await q(`insert into users (id,username,full_name,role,pass_hash,must_change) values ('u-admin','admin','مدير النظام','admin',$1,true) on conflict do nothing`,
      [hashPassword(adminPassword())]);
    const ins = async (t: string, rows: any[], cols: string[]) => { if (rows?.length) await insertMany(q, t, rows, cols); };
    await ins('properties', s.properties, ['id', 'name', 'short', 'type', 'location', 'ownership', 'land_value', 'building_value', 'value_status', 'deed_no', 'notes', 'ground_lease_end']);
    await ins('units', s.units, ['id', 'property_id', 'code', 'kind', 'unit_type', 'floor', 'rooms', 'occupant', 'monthly_rent', 'note']);
    await ins('tenants', s.tenants, ['id', 'name', 'phone']);
    await ins('contracts', s.contracts, ['id', 'property_id', 'unit_id', 'tenant_id', 'start_date', 'end_date', 'annual_rent', 'frequency', 'status', 'contract_no', 'trade_name', 'renewed_from', 'notes']);
    await ins('installments', s.installments, ['id', 'contract_id', 'no', 'period_from', 'period_to', 'due_date', 'amount', 'opening_paid', 'needs_confirmation', 'note', 'src_receipt', 'src_dates', 'rating']);
    await ins('payments', s.payments, ['id', 'receipt_no', 'tenant_id', 'contract_id', 'paid_on', 'amount', 'method', 'bank_ref', 'note', 'created_by']);
    await ins('payment_allocations', s.allocations, ['payment_id', 'installment_id', 'amount']);
    await ins('followups', s.followups, ['id', 'tenant_id', 'date', 'type', 'details']);
    await ins('adjustments', s.adjustments, ['id', 'tenant_id', 'property_id', 'installment_no', 'type', 'amount', 'approved_by', 'decision_no']);
    await ins('audit_notes', s.audit_notes, ['id', 'category', 'property_id', 'tenant_name', 'unit', 'amount', 'ref', 'ref_date', 'source', 'details', 'status']);
    await ins('exceptions', s.exceptions, ['id', 'rule', 'scope', 'entity_id', 'property_id', 'before_date', 'reason', 'requested_by', 'approved_by', 'status', 'expires_on']);
    await q(`insert into activity_log (username,action,details) values ('النظام','تهيئة','تحميل البيانات الأولية')`);
  });
}

const g = globalThis as unknown as { __aqDbs?: Map<string, Promise<Driver>> };
const PLATFORM_SCHEMA = `
create table if not exists settings (key text primary key, value text not null default '');
create table if not exists orgs (slug text primary key, name text not null, status text not null default 'active', plan text not null default 'basic',
  max_users int not null default 5, expires_on date, contact_name text, contact_phone text, contact_email text, notes text not null default '',
  created_at timestamptz not null default now());
create table if not exists platform_users (id text primary key, username text unique not null, full_name text not null, pass_hash text not null, created_at timestamptz not null default now());
create table if not exists platform_log (id serial primary key, at timestamptz not null default now(), username text, action text not null, org text, details text);
create table if not exists plans (key text primary key, name text not null, monthly numeric(12,2) not null default 0, annual numeric(12,2) not null default 0, max_users int not null default 5, notes text not null default '');
alter table orgs add column if not exists billing_cycle text not null default 'annual';
alter table orgs add column if not exists price numeric(12,2);
alter table orgs add column if not exists grace_days int not null default 14;
alter table orgs add column if not exists auto_suspend boolean not null default true;
create table if not exists sub_invoices (id text primary key, no text unique not null, org text not null, period_from date not null, period_to date not null, amount numeric(12,2) not null,
  vat numeric(12,2) not null default 0, total numeric(12,2) not null, status text not null default 'unpaid', due_on date not null, paid_on date, method text, ref text, notes text not null default '',
  reminded_on date, created_by text, created_at timestamptz not null default now());
insert into plans (key,name,monthly,annual,max_users) values ('trial','تجريبي',0,0,3),('basic','أساسي',299,2990,5),('pro','احترافي',599,5990,15),('enterprise','مؤسسات',1199,11990,100) on conflict do nothing;`;
export function driver(org: string = currentOrg()): Promise<Driver> {
  const m = (g.__aqDbs ??= new Map());
  let d = m.get(org);
  if (!d) {
    d = (async () => {
      if (org !== MAIN && org !== PLATFORM) {
        const [o] = await (await driver(PLATFORM)).q('select slug from orgs where slug=$1', [org]);
        if (!o) throw new Error(`الجهة «${org}» غير مسجلة`);
      }
      const d = await makeDriver(org);
      if (org === PLATFORM) { await d.exec(PLATFORM_SCHEMA); await d.q(`insert into settings values ('session_secret',$1) on conflict do nothing`, [randomBytes(32).toString('hex')]); return d; }
      // Hosted lambdas are cold per request: running the full idempotent DDL batch every cold start
      // (~40 tables + migrations) pushes first requests past the function timeout. A settings sentinel
      // makes init one cheap query once the schema is in place. Bump SCHEMA_V when the schema changes.
      const SCHEMA_V = '2026-11-22a';
      const [sv] = await d.q(`select value from settings where key='schema_v'`).catch(() => [] as Row[]);
      if (sv?.value !== SCHEMA_V) {
        await d.exec(SCHEMA);
        if (org === MAIN) await seedIfEmpty(d);
        else await d.q(`insert into settings values ('session_secret',$1),('org',$2),('opening_date',$3),('grace_days','10') on conflict do nothing`, [randomBytes(32).toString('hex'), org, new Date().toISOString().slice(0, 10)]);
        for (const [k, v] of DEFAULT_SETTINGS) await d.q('insert into settings values ($1,$2) on conflict do nothing', [k, v]);
        if (org === MAIN) await runMigrations09(d.q, d.tx);
        await d.q(`insert into settings values ('schema_v',$1) on conflict (key) do update set value=$1`, [SCHEMA_V]);
      }
      if (d.kind === 'pglite' || process.env.AUTO_BACKUP === '1') startAutoBackup();
      return d;
    })();
    m.set(org, d);
    d.catch(() => { m.delete(org); });
  }
  return d;
}
export const q: Q = async (s, p) => (await driver()).q(s, p);
export const tx = async <T,>(fn: (q: Q) => Promise<T>) => (await driver()).tx(fn);
/** استعلام على سجل الجهات (لوحة المالك) */
export const pq: Q = async (s, p) => (await driver(PLATFORM)).q(s, p);
export async function activeOrgs(): Promise<string[]> {
  if (!MULTI) return [MAIN];
  return [MAIN, ...(await pq(`select slug from orgs where status='active' and (expires_on is null or expires_on >= current_date) order by slug`)).map((r) => r.slug as string)];
}
export const dbKind = async () => (await driver()).kind;
export { TABLES };
let autoStarted = false;
function startAutoBackup() {
  if (autoStarted || process.env.VERCEL) return; autoStarted = true;
  const tick = async () => { try { const { autoBackupIfDue } = await import('./backup'); for (const o of await activeOrgs()) await runAs(o, () => autoBackupIfDue()).catch((e) => console.error('backup', o, e)); } catch (e) { console.error('backup', e); } };
  setTimeout(tick, 60_000); setInterval(tick, 60 * 60_000);
}
export function uid(prefix: string) { return prefix + Date.now().toString(36) + randomBytes(3).toString('hex'); }
