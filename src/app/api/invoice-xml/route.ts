import { getUser } from '@/lib/auth';
import { q } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const u = await getUser(); if (!u) return new Response('غير مصرح', { status: 401 });
  const [i] = await q('select invoice_no, xml from invoices where id=$1', [new URL(req.url).searchParams.get('id')]);
  if (!i?.xml) return new Response('لا يوجد XML لهذه الفاتورة', { status: 404 });
  return new Response(i.xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${i.invoice_no}.xml"` } });
}
