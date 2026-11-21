import { getUser } from '@/lib/auth';
import { templateWorkbook } from '@/lib/importer';
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await getUser(); if (!u || u.role !== 'admin') return new Response('غير مصرح', { status: 401 });
  return new Response(templateWorkbook(), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('نموذج-استيراد-الأملاك.xlsx')}` } });
}
