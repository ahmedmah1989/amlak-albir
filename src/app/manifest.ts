import type { MetadataRoute } from 'next';
import { getSettings } from '@/lib/data';
export const dynamic = 'force-dynamic';
/** يجعل البرنامج قابلاً للتثبيت على الجوال والكمبيوتر كتطبيق */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let org = 'نظام الأملاك', color = '#456a42';
  try { const s = await getSettings(); org = s.org || org; color = s.brand_primary || color; } catch {}
  return {
    name: `${org} — نظام الأملاك`, short_name: 'الأملاك', description: 'إدارة العقارات والعقود والتحصيل',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'any', dir: 'rtl', lang: 'ar', background_color: '#f4f5f1', theme_color: color,
    icons: [{ src: '/api/app-icon?s=192', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' }, { src: '/api/app-icon?s=512', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }, { src: '/api/app-icon?s=512&m=1', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }],
    shortcuts: [{ name: 'الوضع الميداني', url: '/field' }, { name: 'سند قبض', url: '/payments/new' }, { name: 'مركز العمل', url: '/' }],
  };
}
