import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'crypto';
import { q, pq, currentOrg, MULTI, MAIN } from './db';
import { headers } from 'next/headers';
import { parsePerms, screenOf, levelFor, homeFor, type Level } from './perms';

export type Role = 'admin' | 'accountant' | 'viewer';
export interface User { id: string; username: string; full_name: string; role: Role; must_change: boolean; prefs: string; perms: string }
export const ROLE_LABEL: Record<Role, string> = { admin: 'مدير النظام', accountant: 'محاسب / مدخل بيانات', viewer: 'اطلاع وطباعة' };
const RANK: Record<Role, number> = { viewer: 1, accountant: 2, admin: 3 };
export const can = (u: User | null, r: Role) => !!u && RANK[u.role] >= RANK[r];
export const COOKIE = 'aq_s';

async function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const [r] = await q(`select value from settings where key='session_secret'`);
  return r.value as string;
}
const sign = (data: string, key: string) => createHmac('sha256', key).update(data).digest('base64url');

export async function createSession(userId: string) {
  const exp = Date.now() + 12 * 3600 * 1000;
  const data = Buffer.from(JSON.stringify({ u: userId, exp, o: currentOrg() })).toString('base64url');
  cookies().set(COOKIE, `${data}.${sign(data, await secret())}`, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 3600 });
}
export function destroySession() { cookies().delete(COOKIE); }

/** حالة الجهة الحالية (موقوفة أو منتهية الاشتراك) — تُحفظ دقيقة في الذاكرة */
const orgCache = new Map<string, { at: number; v: { blocked: string | null; name: string | null } }>();
export async function orgState(): Promise<{ blocked: string | null; name: string | null }> {
  const org = currentOrg(); if (!MULTI || org === MAIN) return { blocked: null, name: null };
  const c = orgCache.get(org); if (c && Date.now() - c.at < 60_000) return c.v;
  const [r] = await pq('select name, status, expires_on from orgs where slug=$1', [org]);
  const today = new Date().toISOString().slice(0, 10);
  const v = { name: r?.name ?? null, blocked: !r ? 'الجهة غير مسجلة' : r.status !== 'active' ? 'حساب الجهة موقوف. تواصل مع مزود الخدمة.' : r.expires_on && String(r.expires_on) < today ? 'انتهى اشتراك الجهة. تواصل مع مزود الخدمة للتجديد.' : null };
  orgCache.set(org, { at: Date.now(), v }); return v;
}
export const clearOrgCache = (slug?: string) => { if (slug) orgCache.delete(slug); else orgCache.clear(); };

export async function getUser(): Promise<User | null> {
  const c = cookies().get(COOKIE)?.value;
  if (!c) return null;
  const [data, sig] = c.split('.');
  if (!data || !sig) return null;
  const good = sign(data, await secret());
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try {
    const { u, exp, o } = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (Date.now() > exp || (o ?? MAIN) !== currentOrg()) return null;
    if ((await orgState()).blocked) return null;
    const [row] = await q('select id,username,full_name,role,must_change,prefs,perms from users where id=$1 and active', [u]);
    return (row as User) ?? null;
  } catch { return null; }
}
export async function requireUser(role: Role = 'viewer'): Promise<User> {
  const u = await getUser();
  if (!u) redirect('/login');
  if (!can(u, role)) redirect(homeFor(u.role, parsePerms(u.perms)) + '?err=' + encodeURIComponent('ليست لديك صلاحية لهذا الإجراء'));
  const path = currentPath();
  if (screenLevel(u, path) < RANK[role]) {
    const home = homeFor(u.role, parsePerms(u.perms));
    redirect((home === path ? '/account' : home) + '?err=' + encodeURIComponent('ليست لديك صلاحية على هذه الشاشة أو هذا الإجراء'));
  }
  return u;
}
export function currentPath() { try { return headers().get('x-amlak-path'); } catch { return null; } }
/** مستوى المستخدم على شاشة المسار الحالي (أو مسار محدد) */
export function screenLevel(u: User, path: string | null = currentPath()): Level { return levelFor(u.role, parsePerms(u.perms), screenOf(path)?.key); }
export async function log(u: User | null, action: string, entity?: string, entityId?: string, details?: string) {
  await q('insert into activity_log (username,action,entity,entity_id,details) values ($1,$2,$3,$4,$5)', [u?.full_name ?? 'النظام', action, entity ?? null, entityId ?? null, details ?? null]);
}
