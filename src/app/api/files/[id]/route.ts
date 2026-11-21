import { getUser } from '@/lib/auth';
import { q } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!(await getUser())) return new Response('غير مصرح', { status: 401 });
  const [f] = await q('select file_name, mime, data from attachments where id=$1', [params.id]);
  if (!f) return new Response('غير موجود', { status: 404 });
  return new Response(Buffer.from(f.data), { headers: { 'Content-Type': f.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.file_name)}`, 'Cache-Control': 'private, max-age=600' } });
}
