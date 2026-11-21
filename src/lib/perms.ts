// صلاحيات الشاشات — تُقيِّد الدور ولا ترفعه: المستوى الفعلي = الأقل من (صلاحية الشاشة، رتبة الدور)
export type Level = 0 | 1 | 2 | 3; // 0 لا يرى • 1 عرض • 2 إدخال • 3 اعتماد/إدارة
export const LEVELS: [Level, string][] = [[0, 'لا يرى'], [1, 'عرض'], [2, 'إدخال وتعديل'], [3, 'اعتماد وحذف']];
export const SCREENS: { key: string; label: string; paths: string[]; adminOnly?: boolean }[] = [
  { key: 'work', label: 'مركز العمل والبحث', paths: ['/', '/search'] },
  { key: 'dashboard', label: 'اللوحة التنفيذية', paths: ['/dashboard', '/analytics'] },
  { key: 'properties', label: 'العقارات والوحدات والامتثال', paths: ['/properties', '/units', '/compliance'] },
  { key: 'contracts', label: 'العقود', paths: ['/contracts'] },
  { key: 'tenants', label: 'المستأجرون', paths: ['/tenants', '/documents'] },
  { key: 'maintenance', label: 'الصيانة والموردون', paths: ['/maintenance', '/vendors', '/inspections'] },
  { key: 'installments', label: 'الأقساط', paths: ['/installments'] },
  { key: 'payments', label: 'سندات القبض والفواتير', paths: ['/payments', '/invoices', '/paylinks'] },
  { key: 'vouchers', label: 'سندات الصرف', paths: ['/vouchers'] },
  { key: 'bank', label: 'البنك والمطابقة', paths: ['/bank'] },
  { key: 'ejar', label: 'منصة إيجار', paths: ['/ejar'] },
  { key: 'expenses', label: 'المصروفات ومستحقات المؤجرين', paths: ['/expenses', '/payables'] },
  { key: 'followups', label: 'سجل المتابعة وخطة التحصيل', paths: ['/followups', '/collection', '/field'] },
  { key: 'approvals', label: 'الاعتمادات', paths: ['/approvals'] },
  { key: 'notifications', label: 'التنبيهات والتذكيرات', paths: ['/notifications'] },
  { key: 'audit', label: 'تدقيق البيانات', paths: ['/audit'] },
  { key: 'imports', label: 'استيراد البيانات', paths: ['/imports'], adminOnly: true },
  { key: 'reports', label: 'التقارير', paths: ['/reports'] },
  { key: 'admin', label: 'الإدارة (الإعدادات والمستخدمون والنسخ)', paths: ['/settings', '/backups'], adminOnly: true },
];
export interface Perms { screens?: Record<string, number>; export?: boolean }
export const ROLE_RANK: Record<string, Level> = { viewer: 1, accountant: 2, admin: 3 };
export function parsePerms(raw: unknown): Perms { try { const p = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw ?? {}; return p && typeof p === 'object' ? p as Perms : {}; } catch { return {}; } }
export const customized = (p: Perms) => !!p.screens && Object.keys(p.screens).length > 0;
/** الشاشة المطابقة لمسار (null = غير خاضع: الحساب، الواجهات البرمجية) */
export function screenOf(path: string | null | undefined) {
  if (!path) return null;
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  if (clean === '/account' || clean.startsWith('/api') || clean === '/login') return null;
  let best: (typeof SCREENS)[number] | null = null, len = -1;
  for (const s of SCREENS) for (const p of s.paths) {
    const hit = p === '/' ? clean === '/' : clean === p || clean.startsWith(p + '/');
    if (hit && p.length > len) { best = s; len = p.length; }
  }
  return best;
}
export function levelFor(role: string, perms: Perms, screenKey: string | null | undefined): Level {
  const rank = ROLE_RANK[role] ?? 1;
  if (!screenKey) return rank;
  const s = SCREENS.find((x) => x.key === screenKey);
  if (s?.adminOnly && role !== 'admin') return 0;
  if (!customized(perms)) return rank;
  const v = Number(perms.screens?.[screenKey] ?? 0);
  return Math.max(0, Math.min(rank, Number.isFinite(v) ? v : 0)) as Level;
}
export const canExport = (role: string, perms: Perms) => !customized(perms) || perms.export !== false;
/** أول شاشة متاحة للمستخدم (للتحويل عند المنع) */
export function homeFor(role: string, perms: Perms) {
  for (const s of SCREENS) if (levelFor(role, perms, s.key) >= 1) return s.paths[0];
  return '/account';
}
