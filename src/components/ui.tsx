import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import PrintButton from './PrintButton';
import Flash from './Flash';
import { date } from '@/lib/fmt';
import { ISTATUS, type IStatus } from '@/lib/calc';
import { printState } from '@/lib/print-state';
import { headers } from 'next/headers';
import { screenOf } from '@/lib/perms';
import PrintStamp from './PrintStamp';
import BackButton from './BackButton';
import { HELP } from '@/lib/help';
import { Ic } from './icons';

const SETTINGS_TABS: [string, string][] = [['/settings', 'الإعدادات العامة وبيانات الجهة'], ['/settings/appearance', 'الهوية والمظهر'], ['/settings/users', 'المستخدمون والصلاحيات'], ['/settings/features', 'الميزات الاختيارية'], ['/backups', 'النسخ الاحتياطي']];
function SettingsTabs({ path }: { path: string }) {
  if (!SETTINGS_TABS.some(([h]) => h === path)) return null;
  return <nav className="settings-tabs noprint" aria-label="أقسام الإعدادات">{SETTINGS_TABS.map(([h, l]) => <Link key={h} href={h} className={h === path ? 'on' : ''}>{l}</Link>)}</nav>;
}
export function Page({ title, sub, org, asOf, print = false, sig = false, actions, back, children, logo, filters, letter = false }: {
  title: string; sub?: string; org: string; asOf: string; print?: boolean; sig?: boolean; actions?: ReactNode; back?: [string, string]; children: ReactNode; logo?: string; filters?: string; letter?: boolean;
}) {
  const ps = printState();
  let path = ''; try { path = headers().get('x-amlak-path') ?? ''; } catch {}
  const sec = screenOf(path), secHref = sec?.paths.find((p) => path === p || path.startsWith(p + '/')) ?? sec?.paths[0];
  const crumbs: [string, string][] = [];
  if (sec && sec.key !== 'work' && secHref && secHref !== path) crumbs.push([secHref, sec.label]);
  if (back && back[0] !== secHref && back[0] !== path) crumbs.push(back);
  const help = sec && (path === secHref || path === sec.paths[0]) ? HELP[sec.key] : undefined;
  return (
    <>
      {!letter && <div className="ph">
        <img src="/api/logo" alt="" />
        <div className="t"><div className="o">{org || ps.org} • نظام إدارة الأملاك والأوقاف</div><h1>{title}</h1>{sub && <div className="phs">{sub}</div>}{filters && <div className="phs">النطاق: {filters}</div>}</div>
        <div className="m">تاريخ البيانات: {date(asOf)}<br />تاريخ الطباعة: <PrintStamp /><br />طُبع بواسطة: {ps.user || '—'}</div>
      </div>}
      <nav className="crumbs noprint" aria-label="مسار التنقل"><BackButton fallback={back?.[0] ?? secHref ?? '/'} /><Link href="/">الرئيسية</Link>{crumbs.map(([h, l]) => <span key={h}> › <Link href={h}>{l}</Link></span>)}<span> › <b>{title}</b></span></nav>
      <SettingsTabs path={path} />
      <div className="top">
        <div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
        <div className="act">{actions}{print && <PrintButton />}{help && <details className="help-pop noprint"><summary aria-label="شرح هذه الشاشة" title="شرح هذه الشاشة"><Ic n="help" /></summary><div><b>{sec?.label}</b><p>{help.what}</p>{help.tips.length > 0 && <ul>{help.tips.map((t) => <li key={t}>{t}</li>)}</ul>}</div></details>}</div>
      </div>
      <Suspense><Flash /></Suspense>
      {children}
      {sig && <div className="sig"><div>أعدّه</div><div>راجعه</div><div>اعتمده</div></div>}
    </>
  );
}
export const Tag = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`tag t-${tone}`}>{children}</span>;
export const IStat = ({ s }: { s: IStatus }) => <Tag tone={ISTATUS[s].tone}>{ISTATUS[s].label}</Tag>;
export function Kpi({ l, v, unit, s, tone = '', href }: { l: string; v: string; unit?: string; s?: string; tone?: string; href?: string }) {
  const body = (<><div className="l">{l}</div><div className="v">{v}{unit && <small> {unit}</small>}</div>{s && <div className="s">{s}</div>}</>);
  return href ? <Link className={`kpi ${tone}`} href={href}>{body}</Link> : <div className={`kpi ${tone}`}>{body}</div>;
}
export const Btn = ({ href, children, kind = '' }: { href: string; children: ReactNode; kind?: string }) => <Link className={`btn ${kind}`} href={href}>{children}</Link>;
export const XL = ({ r, q = '' }: { r: string; q?: string }) => printState().exp ? <a className="btn ghost" href={`/api/export?r=${r}${q}`}>⬇ إكسل شامل للصفحة</a> : null;
export const Empty = ({ children }: { children: ReactNode }) => <p className="muted empty">{children}</p>;
