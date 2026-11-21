'use server';
import { requireUser, log } from './auth';
import { q, tx } from './db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cleanTaskWorkspace } from './task-view';
import { loadDB, todayRiyadh } from './data';
import { analyze } from './calc';
import { buildTasks } from './tasks';

export async function saveTaskWorkspace(raw: unknown) {
  const u = await requireUser();
  if ((JSON.stringify(raw) || '').length > 24000) return { ok: false, message: 'حجم العرض المحفوظ أكبر من المسموح.' };
  const workspace = cleanTaskWorkspace(raw);
  await q(`update users set prefs=jsonb_set(coalesce(nullif(prefs,''),'{}')::jsonb,'{task_workspace}',$1::jsonb,true)::text where id=$2`, [JSON.stringify(workspace), u.id]);
  revalidatePath('/');
  return { ok: true, message: 'تم حفظ العروض في حسابك؛ ستجدها عند الدخول مرة أخرى.' };
}
function validDate(v: string) { return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v; }
export async function toggleWorkTask(fd: FormData) {
  const user = await requireUser('accountant'), key = String(fd.get('key') || '');
  const db = await loadDB(), task = buildTasks(db, analyze(db)).find(t => t.key === key);
  if (!task) redirect('/?err=' + encodeURIComponent('لم تعد المهمة متاحة. حدّث الصفحة.'));
  await tx(async t => {
    await t(`insert into task_states (key,status,until,by_user) values ($1,$2,$3,$4) on conflict (key) do update set status=excluded.status,until=excluded.until,by_user=excluded.by_user,at=now()`, [key, task!.done ? 'open' : 'done', todayRiyadh(), user.full_name]);
    if (task!.type === 'يدوية' && !task!.done) await t(`update tasks set status='done' where id=$1`, [key.slice(4)]);
  });
  await log(user, task!.done ? 'إعادة متابعة لليوم' : 'إنجاز متابعة اليوم', 'task', key);
  revalidatePath('/', 'layout'); redirect('/');
}
export async function recordTaskFollowUp(fd: FormData) {
  const user = await requireUser('accountant');
  const s = (k: string) => String(fd.get(k) || '').trim();
  const key = s('task_key'), token = s('token'), type = s('type'), details = s('details'), next = s('next_date');
  const error = (message: string): never => redirect('/?err=' + encodeURIComponent(message));
  if (!/^tf[a-zA-Z0-9_-]{10,70}$/.test(token) || !['اتصال', 'لم يتم الرد', 'متابعة'].includes(type) || !details || details.length > 2000 || (next && (!validDate(next) || next < todayRiyadh()))) error('أدخل نتيجة واضحة وموعد متابعة صالحًا لا يسبق اليوم.');
  const db = await loadDB(), task = buildTasks(db, analyze(db)).find(t => t.key === key && t.type === 'تحصيل');
  if (!task?.tenantId) error('لم تعد مهمة التحصيل متاحة. حدّث الصفحة ثم راجع حالة المستأجر.');
  const tenantId = task!.tenantId!;
  const inserted = await tx(async t => {
    const rows = await t(`insert into followups (id,tenant_id,date,type,details,next_date,created_by) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing returning id`, [token, tenantId, todayRiyadh(), type, `[${task!.prop}] ${details}`, next || null, user.full_name]);
    return rows.length > 0;
  });
  if (inserted) await log(user, 'متابعة من مركز العمل', 'tenant', tenantId, type);
  revalidatePath('/', 'layout');
  redirect('/?ok=' + encodeURIComponent(inserted ? 'تم تسجيل المتابعة؛ الرصيد المالي لم يتغير.' : 'هذه المتابعة مسجلة بالفعل؛ لم تتكرر.'));
}
