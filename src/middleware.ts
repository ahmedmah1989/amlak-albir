import { NextResponse, type NextRequest } from 'next/server';
const OPEN = /^\/(login|portal|platform|api|pay|offline|sw\.js|manifest\.webmanifest)(\/|$)/;
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!OPEN.test(path) && !req.cookies.get('aq_s')) return NextResponse.redirect(new URL('/login', req.url));
  // Server actions must pass through untouched: rewriting request headers in middleware
  // stalls the action POST body on Netlify (invocation hangs until the function timeout).
  // Pages still get the path/org headers below, so screen gating on page loads is unchanged;
  // actions fall back to role-level permission only (levelFor without a screen key).
  if (req.method === 'POST' && req.headers.has('next-action')) return NextResponse.next();
  // يمرّر المسار الحالي للخادم لتطبيق صلاحيات الشاشات على الصفحات والإجراءات
  const headers = new Headers(req.headers);
  headers.set('x-amlak-path', path);
  // الجهة (في الاستضافة السحابية): من النطاق الفرعي أو رمز الجهة المحفوظ أو رابط بوابة المستأجر — ولا تُقبل من المتصفح مباشرة
  headers.set('x-amlak-host', req.headers.get('host') ?? '');
  const portalOrg = /^\/(portal|pay|api\/pay)(\/|$)/.test(path) ? req.nextUrl.searchParams.get('o') : null;
  headers.set('x-amlak-org', portalOrg || req.cookies.get('amlak_org')?.value || '');
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ['/((?!_next|favicon).*)'] };
