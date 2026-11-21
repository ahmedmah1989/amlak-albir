import Link from 'next/link';
import { Suspense } from 'react';
import Flash from '@/components/Flash';
import { getPlatformUser } from '@/lib/platform';
import { platformLogout } from '@/lib/platform-actions';
import { MULTI } from '@/lib/db';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'لوحة مالك المنظومة — نظام الأملاك' };
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const u = await getPlatformUser();
  return (
    <div className="pf">
      <header className="pf-top"><Link href="/platform" className="pf-brand">لوحة مالك المنظومة<small>إدارة الجهات المشتركة في نظام الأملاك</small></Link>
        {u && <nav className="pf-nav"><Link href="/platform">الجهات</Link><Link href="/platform/billing">الفوترة والإيرادات</Link></nav>}
        {u && <div className="pf-me"><span>{u.full_name}</span><form action={platformLogout}><button className="btn sm ghost" type="submit">خروج</button></form></div>}</header>
      {!MULTI && <p className="pf-mode">الوضع الحالي: جهة واحدة (محلي). الجهات المضافة هنا تعمل عند تشغيل الخادم بوضع تعدد الجهات <code dir="ltr">AMLAK_MULTI=1</code> — راجع دليل الاستضافة.</p>}
      <main className="pf-main"><Suspense><Flash /></Suspense>{children}</main>
    </div>
  );
}
