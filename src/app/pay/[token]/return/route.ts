import { verifyLink, publicBase, orgQ } from '@/lib/paylinks';
import { getSettings } from '@/lib/data';
export const dynamic = 'force-dynamic';
/** العودة من البوابة: نتحقق من الحالة عند البوابة مباشرة ثم نعرض النتيجة */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const S = await getSettings(); const u = new URL(req.url); const base = publicBase(S, `${req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '')}://${req.headers.get('host') ?? u.host}`);
  const r = await verifyLink(params.token).catch((e) => ({ status: 'error', message: e.message }));
  const o = orgQ(), sep = o ? '&' : '?';
  const msg = r.status === 'paid' ? `${sep}ok=${encodeURIComponent('تم السداد بنجاح، وسُجّل سند القبض.')}` : r.status === 'failed' ? `${sep}err=${encodeURIComponent('لم تكتمل عملية الدفع. يمكنك المحاولة مرة أخرى.')}` : `${sep}err=${encodeURIComponent('لم يتأكد الدفع بعد. إذا خُصم المبلغ سيتأكد تلقائياً خلال دقائق.')}`;
  return Response.redirect(`${base}/pay/${params.token}${o}${msg}`, 302);
}
