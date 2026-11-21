import 'server-only';
import { redirect } from 'next/navigation';
import { q, uid } from './db';
import type { User } from './auth';
function back(path: string, err: string): never { redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(err)}`); }
export async function assertOpenPeriod(date: string | null, path: string) {
  const [r] = await q(`select value from settings where key='locked_until'`);
  if (date && r?.value && date <= r.value) back(path, `الفترة حتى ${r.value.split('-').reverse().join('/')} مقفلة؛ لا يمكن تسجيل أو تعديل حركة بتاريخ داخلها`);
}
const OK_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export async function saveFiles(entity: string, id: string, files: File[], u: User, category: string | null = null, expires: string | null = null) {
  let c = 0;
  for (const f of files) {
    if (!f || !f.size) continue;
    if (f.size > 15 * 1024 * 1024) throw new Error(`الملف ${f.name} أكبر من 15 ميجابايت`);
    if (!OK_MIME.includes(f.type) && !/\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name)) throw new Error(`نوع الملف ${f.name} غير مدعوم؛ المقبول PDF أو صور`);
    const buf = Buffer.from(await f.arrayBuffer());
    await q('insert into attachments (id,entity,entity_id,category,file_name,mime,size,data,expires_on,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [uid('f'), entity, id, category, f.name, f.type || 'application/octet-stream', f.size, buf, expires, u.full_name]); c++;
  }
  return c;
}

