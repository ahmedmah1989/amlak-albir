import 'server-only';
/** لوحة مالك المنظومة: جلسة منفصلة عن مستخدمي الجهات، وسجل خاص بها */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'crypto';
import { pq } from './db';
export const PCOOKIE = 'amlak_pf';
const secret = async () => (await pq(`select value from settings where key='session_secret'`))[0].value as string;
const sign = (d: string, k: string) => createHmac('sha256', k).update(d).digest('base64url');
export async function createPlatformSession(id: string) {
  const data = Buffer.from(JSON.stringify({ u: id, exp: Date.now() + 8 * 3600e3 })).toString('base64url');
  cookies().set(PCOOKIE, `${data}.${sign(data, await secret())}`, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 3600 });
}
export async function getPlatformUser(): Promise<{ id: string; username: string; full_name: string } | null> {
  const c = cookies().get(PCOOKIE)?.value; if (!c) return null;
  const [data, sig] = c.split('.'); if (!data || !sig) return null;
  const good = sign(data, await secret()); if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try { const { u, exp } = JSON.parse(Buffer.from(data, 'base64url').toString()); if (Date.now() > exp) return null;
    const [r] = await pq('select id, username, full_name from platform_users where id=$1', [u]); return (r as any) ?? null; } catch { return null; }
}
export async function requirePlatform() { const u = await getPlatformUser(); if (!u) redirect('/platform/login'); return u!; }
export const plog = (who: string | null, action: string, org: string | null = null, details: string | null = null) => pq('insert into platform_log (username,action,org,details) values ($1,$2,$3,$4)', [who, action, org, details]);
export const PLANS: [string, string][] = [['trial', 'تجريبي'], ['basic', 'أساسي'], ['pro', 'احترافي'], ['enterprise', 'مؤسسات']];
export const ORG_STATUS: Record<string, [string, string]> = { active: ['نشطة', 'ok'], suspended: ['موقوفة', 'bad'] };
