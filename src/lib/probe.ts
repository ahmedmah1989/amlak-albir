'use server';
import { redirect } from 'next/navigation';
import { q } from './db';
import { scryptSync, randomBytes } from 'crypto';

export async function probe(): Promise<string> {
  const t: Record<string, number | string> = {};
  let at = Date.now();
  const mark = (k: string) => { t[k] = Date.now() - at; at = Date.now(); };
  try {
    await q('select id,username,pass_hash from users where lower(username)=$1', ['admin']);
    mark('users_select');
    const salt = randomBytes(16).toString('hex');
    scryptSync('probe-password', salt, 64).toString('hex');
    mark('scrypt');
    await q(`select value from settings where key='session_secret'`);
    mark('settings_select');
    const [r] = await q(`insert into activity_log (username,action,details) values ('probe','probe','probe') returning id`);
    mark('log_insert');
    await q(`delete from activity_log where id=$1`, [(r as any)?.id]);
    mark('log_delete');
    return JSON.stringify({ ok: true, t });
  } catch (e) {
    return JSON.stringify({ ok: false, t, error: String(e).slice(0, 300) });
  }
}

export async function probeRedirect(): Promise<void> {
  redirect('/login');
}
