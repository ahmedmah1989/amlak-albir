import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import { q, tx, uid, TABLES, currentOrg, MAIN } from './db';

const ORDER = ['settings', 'users', 'properties', 'units', 'tenants', 'contracts', 'installments', 'payments', 'payment_allocations', 'adjustments',
  'followups', 'expenses', 'audit_notes', 'activity_log', 'record_changes', 'attachments', 'ejar_installments', 'bank_accounts', 'bank_imports', 'bank_lines',
  'exceptions', 'maintenance', 'tasks', 'task_states', 'backups_log', 'meter_readings', 'property_budgets', 'property_valuations', 'saved_reports', 'vouchers', 'invoices', 'import_batches', 'notify_rules', 'notify_queue', 'notifications', 'payment_links', 'licenses', 'vendors', 'pm_plans', 'unit_assets', 'inspections', 'lease_obligations', 'obligation_payments'];

/** ينشئ نسخة كاملة بصيغة JSON (المرفقات بترميز base64). */
export async function makeBackup(withFiles = true) {
  const tables: Record<string, any[]> = {};
  for (const t of ORDER) {
    if (t === 'backups_log') continue;
    const rows = t === 'attachments' && !withFiles ? [] : t === 'settings' ? await q(`select * from settings where key not in ('session_secret','smtp_pass','sms_auth','wa_auth','pay_secret','zatca_private_key','zatca_secret')`) : await q(`select * from ${t}`);
    tables[t] = rows.map((r) => { const o: any = {}; for (const [k, v] of Object.entries(r)) o[k] = v instanceof Uint8Array ? { $b64: Buffer.from(v).toString('base64') } : v instanceof Date ? v.toISOString() : v; return o; });
  }
  return JSON.stringify({ app: 'amlak', version: 2, created_at: new Date().toISOString(), withFiles, tables });
}

async function toSupabase(name: string, body: string) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const bucket = process.env.BACKUP_BUCKET || 'backups';
  const r = await fetch(`${url}/storage/v1/object/${bucket}/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'x-upsert': 'true' }, body });
  if (!r.ok) throw new Error(`Supabase Storage ${r.status}: ${await r.text()}`);
  return `supabase:${bucket}/${name}`;
}
async function toFolder(name: string, body: string) {
  const base = process.env.BACKUP_DIR || (process.env.VERCEL ? '' : './backups');
  if (!base) return null;
  const org = currentOrg(), dir = org === MAIN ? base : path.join(base, 'orgs', org);
  await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, name), body);
  const keep = Number((await q(`select value from settings where key='backup_keep'`))[0]?.value ?? 14);
  const files = (await fs.readdir(dir)).filter((f) => f.startsWith('amlak-') && f.endsWith('.json')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) await fs.unlink(path.join(dir, f)).catch(() => {});
  return `folder:${path.resolve(dir)}`;
}

/** نسخة إلى كل الوجهات المهيأة، مع تسجيلها. */
export async function runBackup(kind: 'auto' | 'manual', by: string) {
  const body = await makeBackup(true);
  const name = `amlak-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const targets: string[] = []; const errors: string[] = [];
  for (const fn of [toFolder, toSupabase]) { try { const t = await fn(name, body); if (t) targets.push(t); } catch (e: any) { errors.push(e.message); } }
  const status = errors.length ? (targets.length ? 'partial' : 'failed') : targets.length ? 'ok' : 'download-only';
  await q('insert into backups_log (id,kind,size,target,status,note,by_user) values ($1,$2,$3,$4,$5,$6,$7)', [uid('bk'), kind, body.length, targets.join(' | ') || '—', status, errors.join(' | ') || null, by]);
  return { body, name, status, targets, errors };
}
export async function autoBackupIfDue() {
  const [last] = await q(`select at from backups_log where kind='auto' and status in ('ok','partial') order by at desc limit 1`);
  if (last && Date.now() - new Date(last.at).getTime() < 23 * 3600 * 1000) return;
  await runBackup('auto', 'النظام');
}
/** استعادة كاملة من ملف نسخة (تُنشأ نسخة احتياطية قبلها تلقائياً). */
export async function restore(json: string, by: string) {
  const data = JSON.parse(json);
  if (data.app !== 'amlak' || !data.tables) throw new Error('الملف ليس نسخة احتياطية من هذا البرنامج');
  await runBackup('manual', `${by} (قبل الاستعادة)`);
  const [curSecret] = await q(`select value from settings where key='session_secret'`);
  await tx(async (t) => {
    const keep = new Set(['backups_log', ...(!data.tables.users?.length ? ['users'] : []), ...(!data.tables.settings?.length ? ['settings'] : [])]);
    for (const tb of [...ORDER].reverse()) if (!keep.has(tb) && TABLES.includes(tb)) await t(`delete from ${tb}`);
    for (const tb of ORDER) {
      if (keep.has(tb)) continue; const rows = data.tables[tb]; if (!rows?.length) continue;
      for (const r of rows) {
        const cols = Object.keys(r); const vals = cols.map((c) => (r[c] && typeof r[c] === 'object' && '$b64' in r[c] ? Buffer.from(r[c].$b64, 'base64') : r[c]));
        await t(`insert into ${tb} (${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')})`, vals);
      }
    }
  });
  await q(`select setval(pg_get_serial_sequence('activity_log','id'), coalesce((select max(id) from activity_log),1))`);
  await q(`select setval(pg_get_serial_sequence('record_changes','id'), coalesce((select max(id) from record_changes),1))`);
  // مفتاح الجلسات لا يُصدَّر مع النسخة؛ يُنشأ جديد إن لم يوجد
  const { randomBytes } = await import('crypto');
  await q(`insert into settings values ('session_secret',$1) on conflict do nothing`, [curSecret?.value ?? randomBytes(32).toString('hex')]);
}
