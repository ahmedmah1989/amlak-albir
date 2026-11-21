'use client';
import { useRouter } from 'next/navigation';
/** رجوع للشاشة السابقة داخل البرنامج؛ وإن لم يوجد سجل تنقل يذهب للمسار الأعلى */
export default function BackButton({ fallback = '/' }: { fallback?: string }) {
  const router = useRouter();
  return <button type="button" className="backbtn noprint" title="رجوع (Alt+←)" aria-label="رجوع للشاشة السابقة"
    onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer.startsWith(location.origin)) router.back(); else router.push(fallback); }}>→ رجوع</button>;
}
