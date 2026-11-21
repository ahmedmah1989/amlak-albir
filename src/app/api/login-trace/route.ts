import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { scryptSync } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  const t: Record<string, number | string> = {};
  let at = Date.now();
  const mark = (k: string) => { t[k] = Date.now() - at; at = Date.now(); };
  try {
    const [row] = await q('select id,username,pass_hash,must_change from users where lower(username)=$1 and active', ['admin']);
    mark('users_select');
    if (row) scryptSync('control', (row.pass_hash as string).split(':')[0], 64);
    mark('scrypt');
    await q(`select value from settings where key='session_secret'`);
    mark('secret_select');
    const [r] = await q(`insert into activity_log (username,action,details) values ('trace','trace','trace') returning id`);
    mark('log_insert');
    await q('delete from activity_log where id=$1', [(r as any)?.id]);
    mark('log_delete');
    return NextResponse.json({ ok: true, userFound: !!row, t });
  } catch (e) {
    return NextResponse.json({ ok: false, t, error: String(e).slice(0, 300) }, { status: 500 });
  }
}
