import { runBackup } from '@/lib/backup';
import { activeOrgs, runAs } from '@/lib/db';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// يُستدعى من Vercel Cron أو من جدولة ويندوز: يتطلب CRON_SECRET — يأخذ نسخة لكل جهة نشطة
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('authorization')?.replace('Bearer ', '') ?? new URL(req.url).searchParams.get('key');
  if (!secret || got !== secret) return new Response('غير مصرح', { status: 401 });
  const out: Record<string, unknown> = {};
  for (const org of await activeOrgs()) { try { const r = await runAs(org, () => runBackup('auto', 'الجدولة')); out[org] = { status: r.status, targets: r.targets, errors: r.errors, size: r.body.length }; } catch (e: any) { out[org] = { status: 'failed', error: e.message }; } }
  return Response.json(out);
}
