import { getUser, log } from '@/lib/auth';
import { runBackup } from '@/lib/backup';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET() {
  const u = await getUser();
  if (!u || u.role !== 'admin') return new Response('غير مصرح', { status: 401 });
  const r = await runBackup('manual', u.full_name);
  await log(u, 'نسخة احتياطية يدوية', 'backup', undefined, r.status);
  return new Response(r.body, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${r.name}"` } });
}
