import { q } from '@/lib/db';
import { verifyLink } from '@/lib/paylinks';
export const dynamic = 'force-dynamic';
/** إشعار البوابة: لا نثق في محتواه — نستخرج المعرّف فقط ثم نسأل البوابة عن الحالة الحقيقية */
export async function POST(req: Request) {
  const j: any = await req.json().catch(() => ({}));
  const ids = [j?.metadata?.token, j?.data?.metadata?.token, j?.reference?.transaction].filter(Boolean);
  const pids = [j?.id, j?.data?.id, j?.data?.invoice_id, j?.invoice_id].filter(Boolean);
  const [l] = ids.length ? await q('select token from payment_links where token = any($1)', [ids]) : pids.length ? await q('select token from payment_links where provider_id = any($1)', [pids]) : [];
  if (l) await verifyLink(l.token).catch(() => {});
  return Response.json({ ok: true });
}
