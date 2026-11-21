import { q, currentOrg, MAIN } from '@/lib/db';
export const dynamic = 'force-dynamic';
const DEFAULT_LOGO = 'https://www.bir-alqunfudhah.org.sa/rafed/uploads/system/logo_641aa05fddb42.png';
export async function GET() {
  const [r] = await q(`select value from settings where key='brand_logo'`);
  const v: string = r?.value ?? '';
  const m = v.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) {
    if (currentOrg() === MAIN) return Response.redirect(DEFAULT_LOGO, 302);
    // جهة جديدة بلا شعار: شعار مبدئي بأول حرف من اسمها
    const [o] = await q(`select value from settings where key='org'`); const ch = String(o?.value ?? 'ع').trim().replace(/^(جمعية|مؤسسة|شركة)\s+/, '').slice(0, 1);
    return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#456a42"/><text x="32" y="44" font-size="34" text-anchor="middle" fill="#fff" font-family="Tahoma,Arial">${ch.replace(/[<&>"]/g, '')}</text></svg>`, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=300' } });
  }
  return new Response(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=300' } });
}
