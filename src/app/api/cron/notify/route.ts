import { tick } from '@/lib/scheduler';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// بديل خارجي للجدولة الداخلية (للاستضافات التي لا تُبقي الخادم يعمل): يتطلب CRON_SECRET
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('authorization')?.replace('Bearer ', '') ?? new URL(req.url).searchParams.get('key');
  if (!secret || got !== secret) return new Response('غير مصرح', { status: 401 });
  await tick(); return Response.json({ ok: true });
}
