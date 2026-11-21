import { getSettings } from '@/lib/data';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const u = new URL(req.url); const s = Math.min(1024, Math.max(48, Number(u.searchParams.get('s')) || 192)); const mask = u.searchParams.get('m') === '1';
  let c = '#456a42', g = '#ba8f0e'; try { const S = await getSettings(); c = S.brand_primary || c; g = S.brand_accent || g; } catch {}
  const r = mask ? 0 : s * 0.22, pad = mask ? s * 0.18 : s * 0.12, w = s - pad * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" rx="${r}" fill="${c}"/>
<g transform="translate(${pad} ${pad}) scale(${w / 24})" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5"/><path d="M8 8h2M14 8h2M8 12h2M14 12h2" stroke="${g}"/></g></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
}
