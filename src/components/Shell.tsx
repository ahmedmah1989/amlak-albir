'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { logout, } from '@/lib/actions';
import { setPref } from '@/lib/actions2';
import { Ic } from './icons';
import { screenOf } from '@/lib/perms';
import { APP_VERSION_LABEL } from '@/lib/version';
import CommandPalette from './CommandPalette';

type L = [string, string, string, number?];
const G: [string, L[], string?][] = [
  ['الرئيسية', [['/', 'tasks', 'مركز العمل اليومي'], ['/dashboard', 'dash', 'اللوحة التنفيذية'], ['/analytics', 'report', 'تحليلات الإدارة']]],
  ['الأملاك', [['/properties', 'bld', 'العقارات'], ['/units', 'bld', 'الوحدات'], ['/tenants', 'users', 'المستأجرون'], ['/contracts', 'doc', 'العقود']]],
  ['التحصيل', [['/installments', 'cal', 'الأقساط'], ['/payments', 'coin', 'سندات القبض'], ['/invoices', 'stamp', 'الفواتير الضريبية'], ['/paylinks', 'link', 'روابط الدفع'], ['/collection', 'coin', 'خطة التحصيل'], ['/followups', 'phone', 'سجل المتابعة'], ['/field', 'user', 'الوضع الميداني'], ['/notifications', 'bell', 'التنبيهات والتذكيرات']]],
  ['البنك والمنصات', [['/bank', 'link', 'كشوف البنك والمطابقة'], ['/bank/lines', 'link', 'إيداعات البنك'], ['/ejar', 'ejar', 'منصة إيجار']]],
  ['التشغيل', [['/maintenance', 'tool', 'الصيانة'], ['/maintenance/plans', 'cal', 'الصيانة الدورية'], ['/vendors', 'users', 'الموردون'], ['/compliance', 'shield', 'الامتثال النظامي'], ['/payables', 'coin', 'مستحقات المؤجرين'], ['/expenses', 'stamp', 'المصروفات'], ['/vouchers', 'coin', 'سندات الصرف'], ['/documents', 'clip', 'المستندات']]],
  ['التقارير', [['/reports', 'report', 'مركز التقارير'], ['/reports/saved', 'report', 'تقاريري المحفوظة'], ['/reports/pack', 'report', 'حزمة تقارير المجلس']]],
  ['الحوكمة', [['/approvals', 'shield', 'الاعتمادات'], ['/audit', 'audit', 'تدقيق البيانات'], ['/imports', 'up', 'استيراد البيانات'], ['/settings/log', 'eye', 'سجل العمليات']]],
  ['الإدارة', [['/settings', 'gear', 'الإعدادات']], 'admin'],
];
const NEW: [string, string, string][] = [['/payments/new', 'coin', 'سند قبض'], ['/vouchers/new', 'coin', 'سند صرف'], ['/contracts/new', 'doc', 'عقد إيجار'], ['/tenants/new', 'users', 'مستأجر'], ['/maintenance/new', 'tool', 'طلب صيانة'], ['/expenses/new', 'stamp', 'مصروف'], ['/properties/new', 'bld', 'عقار']];
const RECENT_RX = /^\/(contracts|tenants|properties|units|installments|payments|vouchers|invoices|maintenance)\/[^/]+$/;
const NEEDS: Record<string, string> = { '/documents': 'doc_required', '/collection': 'collection_plan', '/invoices': 'e_invoice' };
export default function Shell({ org, logo, user, badges, allowed, features = {}, theme = 'light', fz = 100, children }: { org: string; logo: string; user: { name: string; role: string; roleLabel: string }; badges: Record<string, number>; allowed: string[]; features?: Record<string, boolean>; theme?: string; fz?: number; children: ReactNode }) {
  const ok = (h: string) => { if (NEEDS[h] && !features[NEEDS[h]]) return false; const s = screenOf(h); return !s || allowed.includes(s.key); };
  const path = usePathname(); const [open, setOpen] = useState(false), [compact, setCompact] = useState(false), [cmd, setCmd] = useState(false);
  const newItems = NEW.filter(([h]) => ok(h) && (h !== '/properties/new' || user.role === 'admin') && (h !== '/vouchers/new' || user.role !== 'viewer') && (h === '/properties/new' || user.role !== 'viewer'));
  useEffect(() => { if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') navigator.serviceWorker?.register('/sw.js').catch(() => {}); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd(true); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  useEffect(() => { const t = theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme; document.documentElement.dataset.theme = t; }, [theme]);
  useEffect(() => { setCmd(false); document.querySelectorAll('details.user-menu[open]').forEach((d) => d.removeAttribute('open')); }, [path]);
  const on = (h: string) => (h === '/' ? path === '/' : path === h || (path.startsWith(h + '/') && !['/reports', '/bank'].includes(h) && !(h === '/settings' && path === '/settings/log') && !(h === '/maintenance' && path.startsWith('/maintenance/plans'))));
  // آخر السجلات المفتوحة — تُحفظ في متصفح المستخدم فقط
  const rkey = 'amlak-recent:' + user.name;
  const [recent, setRecent] = useState<[string, string][]>([]);
  useEffect(() => { try { setRecent(JSON.parse(localStorage.getItem(rkey) || '[]')); } catch {} }, [rkey]);
  useEffect(() => {
    if (!RECENT_RX.test(path) || path.endsWith('/new')) return;
    const t = setTimeout(() => { try {
      const title = (document.querySelector('.top h1')?.textContent || document.title || path).trim().slice(0, 70);
      const next = [[path, title] as [string, string], ...(JSON.parse(localStorage.getItem(rkey) || '[]') as [string, string][]).filter(([h]) => h !== path)].slice(0, 8);
      localStorage.setItem(rkey, JSON.stringify(next)); setRecent(next);
    } catch {} }, 600);
    return () => clearTimeout(t);
  }, [path, rkey]);
  useEffect(() => { document.querySelectorAll('details.quick-new[open], details.row-menu[open]').forEach((d) => d.removeAttribute('open')); }, [path]);
  return (
    <>
      <header className="topbar noprint">
        <a className="skip-link" href="#main-content">انتقل إلى المحتوى</a>
        <button className="menu" aria-label="القائمة" aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>☰</button>
        {logo ? <img className="logo" src={logo} alt={org} /> : <div className="lf">{org}</div>}
        <div className="apn"><b>نظام الأملاك والأوقاف</b><span>{org}</span></div>
        <div className="sp" />
        <button type="button" className="cmdk-open" onClick={() => setCmd(true)} aria-label="بحث سريع وأوامر (Ctrl+K)"><Ic n="search" /><span>ابحث أو انتقل…</span><kbd>Ctrl K</kbd></button>
        <details className="quick-new noprint"><summary className="btn sm">＋ <span className="qn-l">جديد</span></summary><div>{newItems.map(([h, ic, l]) => <Link key={h} href={h}><Ic n={ic} />{l}</Link>)}</div></details>
        {recent.length > 0 && <details className="quick-new recent-menu noprint"><summary className="btn sm ghost" title="آخر ما فتحته"><Ic n="clock" /><span className="qn-l">الأخيرة</span></summary><div>{recent.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}</div></details>}
        <details className="user-menu"><summary className="me" aria-label="حسابي والإعدادات الشخصية"><i>{user.name.slice(0, 1)}</i><div><b>{user.name}</b><span>{user.roleLabel}</span></div></summary>
          <div className="um-pop">
            <Link href="/account"><Ic n="user" />حسابي وكلمة المرور</Link>
            <form action={setPref} className="um-row" aria-label="المظهر" onSubmit={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}><input type="hidden" name="back" value={path} /><span>المظهر</span>
              {([['light', 'فاتح'], ['dark', 'داكن'], ['auto', 'تلقائي']] as const).map(([k, l]) => <button key={k} name="theme" value={k} className={theme === k ? 'on' : ''} type="submit">{l}</button>)}</form>
            <form action={setPref} className="um-row" aria-label="حجم الخط" onSubmit={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}><input type="hidden" name="back" value={path} /><span>حجم الخط {fz}%</span>
              <button name="fz" value="-" title="تصغير الخط" type="submit">أ−</button><button name="fz" value="+" title="تكبير الخط" type="submit">أ+</button></form>
            <form action={logout}><button type="submit" className="um-out">تسجيل الخروج</button></form>
          </div></details>
      </header>
      <div className={'app' + (compact ? ' nav-compact' : '')}>
        <aside id="main-navigation" className={'side noprint' + (open ? ' open' : '')}>
          <button type="button" className="nav-toggle" onClick={() => setCompact(!compact)} aria-pressed={compact}>{compact ? '⇤' : '⇥'}<span>{compact ? 'توسيع القائمة' : 'تصغير القائمة'}</span></button>
          <nav className="nav" aria-label="القائمة الرئيسية">
            {G.filter((g) => !g[2] || user.role === g[2]).map(([t, l0]) => [t, l0.filter(([h]) => ok(h))] as [string, L[]]).filter(([, ls]) => ls.length).map(([t, ls]) => (
              <details className="nav-group" key={t} open={t === 'الرئيسية' || ls.some(([h]) => on(h)) || compact}><summary className="grp">{t}</summary>
                {ls.map(([h, ic, l]) => <Link key={h} href={h} title={l} aria-current={on(h) ? 'page' : undefined} className={on(h) ? 'on' : ''} onClick={() => setOpen(false)}><Ic n={ic} /><span className="nav-label">{l}</span>{badges[h] ? <em title={h === '/notifications' ? 'تنبيهات غير مقروءة' : 'كل المهام غير المنجزة، بما فيها مهام المتابعة'}>{badges[h]}</em> : null}</Link>)}</details>))}
          </nav>
          <div className="who"><Link href="/account" onClick={() => setOpen(false)}>حسابي</Link><form action={logout}><button type="submit">خروج</button></form></div>
          <div className="app-version">{APP_VERSION_LABEL}</div>
        </aside>
        {open && <div className="scrim" onClick={() => setOpen(false)} />}
        <main className="main" id="main-content" tabIndex={-1}>{children}</main>
        {cmd && <CommandPalette onClose={() => setCmd(false)} links={[...G.filter((g) => !g[2] || user.role === g[2]).flatMap(([t, ls]) => ls.filter(([h]) => ok(h)).map(([h, ic, l]) => ({ h, ic, l, g: t }))), ...newItems.map(([h, ic, l]) => ({ h, ic, l: l + ' جديد', g: 'إنشاء' })), ...recent.map(([h, l]) => ({ h, ic: 'clock', l, g: 'الأخيرة' }))]} />}
      </div>
      <nav className="mbar noprint" aria-label="التنقل السفلي">
        {([['/', 'tasks', 'مهامي'], ['/field', 'phone', 'الميداني'], ['/properties', 'bld', 'العقارات'], ['/payments/new', 'coin', 'سند'], ['/dashboard', 'dash', 'اللوحة']] as L[]).filter(([h]) => ok(h)).map(([h, ic, l]) =>
          <Link key={h} href={h} className={on(h) ? 'on' : ''}><Ic n={ic} />{l}</Link>)}
      </nav>
    </>
  );
}
