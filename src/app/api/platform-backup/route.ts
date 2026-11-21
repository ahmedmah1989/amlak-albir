import { getPlatformUser, plog } from '@/lib/platform';
import { pq, runAs } from '@/lib/db';
import { makeBackup } from '@/lib/backup';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const u = await getPlatformUser(); if (!u) return new Response('غير مصرح', { status: 401 });
  const org = new URL(req.url).searchParams.get('org') ?? '';
  const [o] = await pq('select slug from orgs where slug=$1', [org]); if (!o) return new Response('جهة غير موجودة', { status: 404 });
  const body = await runAs(org, () => makeBackup(true));
  await plog(u.username, 'تنزيل نسخة جهة', org);
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="amlak-${org}-${new Date().toISOString().slice(0, 10)}.json"` } });
}
