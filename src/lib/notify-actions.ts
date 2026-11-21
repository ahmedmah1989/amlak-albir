'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, uid } from './db';
import { requireUser, log } from './auth';
import { runCycle, generate, sendItem, KINDS } from './notify';

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const go = (path: string, k: 'ok' | 'err', m: string): never => { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(m)}`); };
const ids = (fd: FormData) => [...fd.getAll('ids'), ...fd.getAll('id')].map(String).filter(Boolean).slice(0, 500);
const backOf = (fd: FormData) => { const b = s(fd, 'back') || '/notifications'; return b.startsWith('/notifications') || b.startsWith('/tenants/') ? b : '/notifications'; };

export async function runNotifyNow(fd: FormData) {
  const u = await requireUser('accountant');
  const r = await runCycle(u.full_name);
  go(backOf(fd), 'ok', `تم التشغيل: ${r.added} تذكير جديد • أُرسل ${r.sent} • فشل ${r.failed} • جاهز لواتساب يدوي ${r.manual}`);
}
export async function previewNotify(fd: FormData) {
  const u = await requireUser('accountant'); const r = await generate();
  await log(u, 'تجهيز التذكيرات', undefined, undefined, `جديد ${r.added}`);
  go(backOf(fd), 'ok', r.added ? `أُضيف ${r.added - r.internal} تذكير جديد للمستأجرين${r.internal ? ` و${r.internal} تنبيه داخلي للموظفين` : ''} — بدون إرسال` : 'لا تذكيرات جديدة اليوم');
}
export async function approveAndSend(fd: FormData) {
  const u = await requireUser('accountant'); const list = ids(fd); if (!list.length) go(backOf(fd), 'err', 'اختر تذكيراً واحداً على الأقل');
  await q(`update notify_queue set status='approved', approved_by=$2, error=null where id = any($1) and status in ('pending','failed')`, [list, u.full_name]);
  const out: Record<string, number> = { sent: 0, failed: 0, manual: 0 };
  for (const id of list) { const r = await sendItem(id, u.full_name); if (r in out) out[r]++; }
  await log(u, 'اعتماد وإرسال تذكيرات', undefined, undefined, `${list.length} • أُرسل ${out.sent} • فشل ${out.failed} • يدوي ${out.manual}`);
  go(backOf(fd), out.failed ? 'err' : 'ok', `أُرسل ${out.sent}${out.manual ? ` • ${out.manual} جاهزة للإرسال اليدوي بواتساب` : ''}${out.failed ? ` • فشل ${out.failed} (راجع سبب الفشل)` : ''}`);
}
export async function cancelItems(fd: FormData) {
  const u = await requireUser('accountant'); const list = ids(fd); if (!list.length) go(backOf(fd), 'err', 'اختر تذكيراً واحداً على الأقل');
  await q(`update notify_queue set status='cancelled', approved_by=$2 where id = any($1) and status in ('pending','approved','failed','manual')`, [list, u.full_name]);
  await log(u, 'إلغاء تذكيرات', undefined, undefined, String(list.length));
  go(backOf(fd), 'ok', `أُلغي ${list.length} تذكير`);
}
export async function markManualSent(fd: FormData) {
  const u = await requireUser('accountant'); const list = ids(fd);
  await q(`update notify_queue set status='sent', sent_by=$2, sent_at=now() where id = any($1) and status='manual'`, [list, u.full_name]);
  go(backOf(fd), 'ok', 'تم تسجيلها كمُرسلة');
}
export async function setTenantOptOut(fd: FormData) {
  const u = await requireUser('accountant'); const id = s(fd, 'tenant_id'); const on = s(fd, 'on') === '1';
  if (!id) go(backOf(fd), 'err', 'مستأجر غير محدد');
  await q('update tenants set notify_opt_out=$2 where id=$1', [id, on]);
  if (on) await q(`update notify_queue set status='cancelled', error='المستأجر طلب عدم مراسلته' where tenant_id=$1 and status in ('pending','approved','manual')`, [id]);
  await log(u, on ? 'إيقاف مراسلة مستأجر' : 'إعادة مراسلة مستأجر', 'tenant', id!);
  go(backOf(fd), 'ok', on ? 'لن تُرسل تذكيرات لهذا المستأجر' : 'أُعيد تفعيل التذكيرات للمستأجر');
}
export async function markRead(fd: FormData) {
  const u = await requireUser(); const id = s(fd, 'id');
  if (id) await q(`update notifications set read_by='1' where id=$1 and user_id=$2`, [id, u.id]); else await q(`update notifications set read_by='1' where user_id=$1 and read_by=''`, [u.id]);
  const href = s(fd, 'href'); if (href && href.startsWith('/')) { revalidatePath('/', 'layout'); redirect(href); }
  go('/notifications?tab=mine', 'ok', 'تم');
}

// ---------- القواعد والإعدادات (للمدير) ----------
export async function saveRule(fd: FormData) {
  const u = await requireUser('admin'); const id = s(fd, 'id'); const kind = s(fd, 'kind') ?? '';
  const K = KINDS.find((k) => k.key === kind); if (!K) go('/notifications?tab=rules', 'err', 'نوع التنبيه غير معروف');
  const channels = fd.getAll('channels').map(String).filter((c) => ['email', 'sms', 'whatsapp', 'internal'].includes(c));
  if (!channels.length) go('/notifications?tab=rules', 'err', 'اختر قناة إرسال واحدة على الأقل');
  if (K!.audience === 'tenant' && channels.every((c) => c === 'internal')) go('/notifications?tab=rules', 'err', 'تذكيرات المستأجرين تحتاج بريداً أو رسالة أو واتساب');
  const off = Math.max(0, Math.min(365, Number(s(fd, 'offset_days') ?? 0) || 0)), rep = Math.max(0, Math.min(365, Number(s(fd, 'repeat_days') ?? 0) || 0));
  const name = s(fd, 'name') ?? K!.label, subject = s(fd, 'subject') ?? '', template = s(fd, 'template') ?? '';
  if (kind !== 'staff_digest' && !template) go('/notifications?tab=rules', 'err', 'اكتب نص الرسالة');
  const mode = s(fd, 'mode') === 'auto' ? 'auto' : 'review', active = s(fd, 'active') !== '0';
  if (id) await q(`update notify_rules set kind=$2,name=$3,offset_days=$4,repeat_days=$5,channels=$6,audience=$7,subject=$8,template=$9,mode=$10,active=$11 where id=$1`, [id, kind, name, off, rep, channels.join(','), K!.audience, subject, template, mode, active]);
  else await q(`insert into notify_rules (id,kind,name,offset_days,repeat_days,channels,audience,subject,template,mode,active,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [uid('nr'), kind, name, off, rep, channels.join(','), K!.audience, subject, template, mode, active, u.full_name]);
  await log(u, id ? 'تعديل قاعدة تنبيه' : 'إضافة قاعدة تنبيه', undefined, undefined, `${name} • ${mode === 'auto' ? 'تلقائي' : 'بمراجعة'} • ${active ? 'مفعّلة' : 'موقوفة'}`);
  go('/notifications?tab=rules', 'ok', 'تم حفظ القاعدة');
}
export async function deleteRule(fd: FormData) {
  const u = await requireUser('admin'); const id = s(fd, 'id');
  await q('delete from notify_rules where id=$1', [id]); await q(`update notify_queue set status='cancelled' where rule_id=$1 and status in ('pending','approved')`, [id]);
  await log(u, 'حذف قاعدة تنبيه', undefined, id ?? undefined); go('/notifications?tab=rules', 'ok', 'حُذفت القاعدة');
}
export async function saveNotifySettings(fd: FormData) {
  const u = await requireUser('admin');
  const hour = Math.max(0, Math.min(23, Number(s(fd, 'notify_hour') ?? 9) || 9));
  const vals: [string, string][] = [['notify_enabled', s(fd, 'notify_enabled') === '1' ? '1' : '0'], ['notify_hour', String(hour)], ['wa_url', s(fd, 'wa_url') ?? ''], ['wa_method', s(fd, 'wa_method') === 'GET' ? 'GET' : 'POST'], ['wa_body', s(fd, 'wa_body') ?? '']];
  for (const [k, v] of vals) await q('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]);
  const wa = s(fd, 'wa_auth'); if (wa === '-') await q(`update settings set value='' where key='wa_auth'`); else if (wa) await q(`insert into settings values ('wa_auth',$1) on conflict (key) do update set value=excluded.value`, [wa]);
  await log(u, 'تعديل إعدادات التنبيهات', undefined, undefined, `التشغيل التلقائي: ${vals[0][1] === '1' ? `مفعّل الساعة ${hour}` : 'موقوف'}`);
  go('/notifications?tab=settings', 'ok', 'تم حفظ إعدادات التنبيهات');
}
