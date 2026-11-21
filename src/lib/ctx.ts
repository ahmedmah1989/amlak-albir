import 'server-only';
import { loadDB } from './data';
import { analyze } from './calc';
import { dfState } from './df';
import { setFormatGetter } from './fmt';
setFormatGetter(() => dfState().v);
import { redirect } from 'next/navigation';
import { requireUser, screenLevel, type Role } from './auth';
import { parsePerms, canExport } from './perms';
import { printState } from './print-state';
export async function ctx(role: Role = 'viewer') {
  const user = await requireUser(role);
  if (user.must_change) redirect('/account?err=' + encodeURIComponent('يجب تغيير كلمة المرور المؤقتة قبل المتابعة'));
  const db = await loadDB();
  try { const p = JSON.parse((user as any).prefs || '{}'); dfState().v = p.date_format || db.meta.date_format; } catch { dfState().v = db.meta.date_format; }
  const a = analyze(db);
  const lv = screenLevel(user);
  const ps = printState(); ps.user = user.full_name; ps.org = db.meta.org; ps.exp = canExport(user.role, parsePerms(user.perms));
  return { db, a, user, org: db.meta.org, asOf: a.today, canEdit: lv >= 2, isAdmin: lv >= 3 && user.role === 'admin', level: lv, canExport: canExport(user.role, parsePerms(user.perms)) };
}
