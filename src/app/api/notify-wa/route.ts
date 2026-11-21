import { getUser } from '@/lib/auth';
import { levelFor, parsePerms } from '@/lib/perms';
import { q } from '@/lib/db';
import { waLink } from '@/lib/messages';
export const dynamic = 'force-dynamic';
/** يفتح محادثة واتساب بالرسالة الجاهزة ويسجل التذكير كمُرسل */
export async function GET(req: Request) {
  const u = await getUser(); if (!u || levelFor(u.role, parsePerms(u.perms), 'notifications') < 2) return new Response('غير مصرح', { status: 401 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const [it] = await q(`select * from notify_queue where id=$1 and channel='whatsapp'`, [id]);
  const link = it && waLink(it.to_addr, it.body); if (!link) return new Response('رقم الجوال غير صالح لواتساب', { status: 400 });
  if (it.status === 'manual') await q(`update notify_queue set status='sent', sent_by=$2, sent_at=now() where id=$1`, [id, u.full_name]);
  return Response.redirect(link, 302);
}
