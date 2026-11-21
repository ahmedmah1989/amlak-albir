'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, uid } from './db';
import { requireUser, log } from './auth';
import { reportById } from './reports-catalog';

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const safeHref = (h: string | null) => (h && /^\/(reports(\/[a-z-]+)?|documents|invoices|audit)(\?[^#\r\n]*)?$/.test(h) ? h : null);
const go = (href: string, k: 'ok' | 'err', m: string): never => { revalidatePath('/', 'layout'); redirect(`${href}${href.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(m)}`); };

export async function toggleFavorite(fd: FormData) {
  const u = await requireUser(); const rid = s(fd, 'report_id')!, back = safeHref(s(fd, 'back')) ?? '/reports';
  if (!reportById(rid)) go('/reports', 'err', 'تقرير غير معروف');
  const [ex] = await q(`select id from saved_reports where user_id=$1 and kind='fav' and report_id=$2`, [u.id, rid]);
  if (ex) await q('delete from saved_reports where id=$1', [ex.id]);
  else await q(`insert into saved_reports (id,user_id,kind,report_id,name,href) values ($1,$2,'fav',$3,$4,$5)`, [uid('rf'), u.id, rid, reportById(rid)!.title, reportById(rid)!.href]);
  go(back, 'ok', ex ? 'أُزيل التقرير من المفضلة' : 'أُضيف التقرير إلى المفضلة');
}

export async function saveReport(fd: FormData) {
  const u = await requireUser(); const rid = s(fd, 'report_id')!, href = safeHref(s(fd, 'href')), name = s(fd, 'name');
  const back = href ?? '/reports';
  if (!reportById(rid) || !href) go('/reports', 'err', 'تعذر حفظ التقرير');
  if (!name) go(back, 'err', 'اكتب اسماً للتقرير المحفوظ');
  const [{ n }] = await q(`select count(*)::int n from saved_reports where user_id=$1 and kind='saved'`, [u.id]);
  if (n >= 40) go(back, 'err', 'الحد الأقصى 40 تقريراً محفوظاً؛ احذف بعضها أولاً');
  await q(`insert into saved_reports (id,user_id,kind,report_id,name,href,shared) values ($1,$2,'saved',$3,$4,$5,$6)`, [uid('rs'), u.id, rid, name!.slice(0, 80), href, fd.get('shared') === '1']);
  await log(u, 'حفظ تقرير', 'report', rid, name!);
  go(back, 'ok', `حُفظ التقرير «${name}» في تقاريري المحفوظة`);
}

export async function deleteSavedReport(fd: FormData) {
  const u = await requireUser(); const id = s(fd, 'id')!;
  const [r] = await q('select * from saved_reports where id=$1', [id]);
  if (!r || (r.user_id !== u.id && u.role !== 'admin')) go('/reports/saved', 'err', 'لا يمكن حذف هذا التقرير');
  await q('delete from saved_reports where id=$1', [id]);
  go('/reports/saved', 'ok', 'حُذف التقرير المحفوظ');
}
