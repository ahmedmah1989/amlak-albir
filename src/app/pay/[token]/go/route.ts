import { checkout, publicBase, orgQ } from '@/lib/paylinks';
import { getSettings } from '@/lib/data';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const S = await getSettings(); const u = new URL(req.url); const base = publicBase(S, `${req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '')}://${req.headers.get('host') ?? u.host}`);
  try { return Response.redirect(await checkout(params.token, base), 302); }
  catch (e: any) { const o = orgQ(); return Response.redirect(`${base}/pay/${params.token}${o}${o ? '&' : '?'}err=${encodeURIComponent(e.message)}`, 302); }
}
