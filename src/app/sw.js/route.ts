export const dynamic = 'force-static';
/** عامل الخدمة: يحفظ ملفات الواجهة لتسريع الفتح، ويعرض صفحة «بدون اتصال» عند انقطاع الشبكة. البيانات نفسها لا تُحفظ على الجهاز */
const SW = `
const V='amlak-v13';
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(['/offline'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
 if(u.pathname.startsWith('/_next/static/')||u.pathname.startsWith('/api/app-icon')){e.respondWith(caches.open(V).then(c=>c.match(r).then(m=>m||fetch(r).then(res=>{c.put(r,res.clone());return res;}))));return;}
 if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match('/offline')));}});
`;
export function GET() { return new Response(SW, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Service-Worker-Allowed': '/', 'Cache-Control': 'no-cache' } }); }
