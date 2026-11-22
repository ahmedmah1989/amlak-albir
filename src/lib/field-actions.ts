'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, uid } from './db';
import { requireAction, log } from './auth';
import { todayRiyadh } from './data';
import { saveFiles } from './guard';
const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const go = (k: 'ok' | 'err', m: string, anchor = ''): never => { revalidatePath('/field'); redirect(`/field?${k}=${encodeURIComponent(m)}${anchor}`); };
/** تسجيل زيارة ميدانية: النتيجة والملاحظة والموعد القادم، مع الموقع والصورة إن وُجدا */
export async function recordVisit(fd: FormData) {
  const u = await requireAction('accountant'); const tenant = s(fd, 'tenant_id'); const result = s(fd, 'result') ?? 'زيارة ميدانية';
  if (!tenant) go('err', 'مستأجر غير محدد');
  const lat = Number(s(fd, 'lat')), lng = Number(s(fd, 'lng'));
  const loc = Number.isFinite(lat) && Number.isFinite(lng) && lat && lng ? ` • الموقع: https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}` : '';
  const next = s(fd, 'next_date');
  if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) go('err', 'موعد المتابعة غير صحيح');
  const id = uid('fu');
  await q('insert into followups (id,tenant_id,date,type,details,next_date,created_by) values ($1,$2,$3,$4,$5,$6,$7)', [id, tenant, todayRiyadh(), result, `${s(fd, 'details') ?? ''}${loc}`.trim() || null, next, u.full_name]);
  const files = fd.getAll('photo').filter((x): x is File => x instanceof File && x.size > 0);
  let note = ''; if (files.length) { try { await saveFiles('tenant', tenant!, files, u, 'زيارة ميدانية'); note = ' مع الصورة'; } catch (e: any) { note = ` (تعذر حفظ الصورة: ${e.message})`; } }
  await log(u, 'زيارة ميدانية', 'tenant', tenant!, `${result}${loc ? ' • بالموقع' : ''}`);
  go('ok', `سُجّلت الزيارة${note}`, `#t-${tenant}`);
}
