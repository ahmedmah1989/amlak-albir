import './globals.css';
import './organization.css';
import './work-center.css';
import './display-workspace.css';
import './rent-system.css';
import './ui12.css';
import './ui12-dark.css';
import type { Metadata, Viewport } from 'next';
export async function generateMetadata(): Promise<Metadata> {
  try { const { getSettings } = await import('@/lib/data'); const s = await getSettings(); return { title: `إدارة العقارات — ${s.org || 'نظام الأملاك'}` }; } catch { return { title: 'نظام الأملاك' }; }
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#23361f', viewportFit: 'cover' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="apple-touch-icon" href="/api/app-icon?s=180" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="الأملاك" />
        <link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
