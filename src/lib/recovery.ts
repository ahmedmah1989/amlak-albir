'use server';
import { redirect } from 'next/navigation';
import { randomBytes, randomInt } from 'crypto';
import { q, uid } from './db';
import { requireUser, log, type User } from './auth';
import { hashPassword, verifyPassword } from './password';
import { getSettings } from './data';
import { sendMail, smtpFrom } from './mailer';
import { sendSms, smsReady } from './sms';
import { normalizeSearch } from './table-view';

/**
 * استعادة كلمة المرور بعدة طرق — أي طريقة تنجح تكفي، والبيانات لا تتأثر (يتغير تشفير كلمة المرور فقط):
 * 1) رمز استعادة مطبوع أو الكلمة المحفوظة  2) السؤال السري  3) رمز يُرسل للبريد  4) رمز يُرسل للجوال
 */
const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const fmtCode = () => { const r = randomBytes(6).toString('hex').toUpperCase(); return `${r.slice(0, 4)}-${r.slice(4, 8)}-${r.slice(8, 12)}`; };
const normCode = (c: string) => c.toUpperCase().replace(/[^0-9A-F]/g, '');
const normText = (t: string) => normalizeSearch(t).replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const go = (path: string, k: 'ok' | 'err', m: string): never => redirect(`${path}${path.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(m)}`);
const recPath = (u?: string | null, extra = '') => `/login/recover${u ? `?u=${encodeURIComponent(u)}${extra}` : ''}`;

async function tooMany(username: string, action: string, limit: number) {
  const [{ n }] = await q(`select count(*)::int n from activity_log where action=$1 and entity_id=$2 and at > now() - interval '15 minutes'`, [action, username]);
  return n >= limit;
}
const failed = (username: string, how: string) => q(`insert into activity_log (username,action,entity,entity_id,details) values ('—','محاولة استعادة فاشلة','user',$1,$2)`, [username, how]);

// ---------- إعداد الطرق من «حسابي» ----------
export async function generateRecoveryCodes(fd: FormData) {
  const u = await requireUser(); const cur = s(fd, 'current');
  const [row] = await q('select pass_hash from users where id=$1', [u.id]);
  if (!cur || !verifyPassword(cur, row.pass_hash)) go('/account', 'err', 'كلمة المرور الحالية غير صحيحة');
  const codes = Array.from({ length: 8 }, fmtCode);
  await q('update users set recovery=$2 where id=$1', [u.id, JSON.stringify(codes.map((c) => hashPassword(normCode(c))))]);
  await log(u, 'توليد رموز استعادة كلمة المرور', 'user', u.id, '8 رموز جديدة (أُلغيت الرموز السابقة)');
  redirect('/account/recovery-codes?c=' + encodeURIComponent(Buffer.from(codes.join(',')).toString('base64url')));
}

export async function saveRecoveryMethods(fd: FormData) {
  const u = await requireUser(); const cur = s(fd, 'current');
  const [row] = await q('select * from users where id=$1', [u.id]);
  if (!cur || !verifyPassword(cur, row.pass_hash)) go('/account', 'err', 'للحفظ اكتب كلمة المرور الحالية صحيحة');
  const email = s(fd, 'email'), phone = s(fd, 'phone')?.replace(/[^\d+]/g, '') ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go('/account', 'err', 'البريد الإلكتروني غير صحيح');
  if (phone && phone.replace(/\D/g, '').length < 9) go('/account', 'err', 'رقم الجوال غير صحيح');
  const q1 = s(fd, 'secret_q') === 'custom' ? s(fd, 'secret_q_custom') : s(fd, 'secret_q'), ans = s(fd, 'secret_a'), word = s(fd, 'recovery_word');
  if (s(fd, 'secret_q') === 'custom' && !q1) go('/account', 'err', 'اخترت «سؤال آخر» — اكتب نص السؤال');
  if (ans && !q1) go('/account', 'err', 'كتبت إجابة بدون اختيار السؤال السري — اختر السؤال من القائمة');
  if (q1 && !ans && (!row.secret_a || q1 !== row.secret_q)) go('/account', 'err', 'اكتب إجابة السؤال السري');
  if (ans && normText(ans).length < 2) go('/account', 'err', 'الإجابة قصيرة جداً');
  if (word && word.length < 6) go('/account', 'err', 'الكلمة المحفوظة 6 أحرف على الأقل');
  const sets: string[] = [], vals: unknown[] = [u.id];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  set('email', email); set('phone', phone);
  if (fd.get('clear_q')) { set('secret_q', null); set('secret_a', null); } else if (q1) { set('secret_q', q1); if (ans) set('secret_a', hashPassword(normText(ans))); }
  if (fd.get('clear_word')) set('recovery_word', null); else if (word) set('recovery_word', hashPassword(normText(word)));
  await q(`update users set ${sets.join(',')} where id=$1`, vals);
  await log(u, 'تعديل طرق استعادة كلمة المرور', 'user', u.id, [email && 'البريد', phone && 'الجوال', (q1 || row.secret_q) && !fd.get('clear_q') && 'السؤال السري', (word || row.recovery_word) && !fd.get('clear_word') && 'الكلمة المحفوظة'].filter(Boolean).join('، ') || 'لا شيء');
  const S = await getSettings();
  const has = { q: !fd.get('clear_q') && !!(q1 || row.secret_q), w: !fd.get('clear_word') && !!(word || row.recovery_word) };
  const ready = [has.w && 'الكلمة المحفوظة', has.q && 'السؤال السري', email && smtpFrom(S) && 'البريد', phone && smsReady(S) && 'الجوال'].filter(Boolean);
  const wait = [email && !smtpFrom(S) && 'البريد', phone && !smsReady(S) && 'الجوال'].filter(Boolean);
  go('/account', 'ok', `تم الحفظ.${ready.length ? ` جاهز للاستعادة: ${ready.join('، ')}.` : ''}${wait.length ? ` ${wait.join(' و')} محفوظ لكن لن يعمل قبل ضبط «الإعدادات ← البريد والرسائل».` : ''}`);
}

// ---------- صفحة «نسيت كلمة المرور» ----------
export async function sendRecoveryOtp(fd: FormData) {
  const username = s(fd, 'username')?.toLowerCase() ?? '', ch = s(fd, 'channel') === 'phone' ? 'phone' : 'email';
  if (await tooMany(username, 'إرسال رمز استعادة', 3)) go(recPath(username), 'err', 'أُرسلت رموز كثيرة. انتظر 15 دقيقة');
  const S = await getSettings();
  const [row] = await q('select * from users where lower(username)=$1 and active', [username]);
  const dest = row?.[ch];
  if (row && dest && (ch === 'email' ? smtpFrom(S) : smsReady(S))) {
    const code = String(randomInt(100000, 1000000));
    await q(`update password_otps set used=true where user_id=$1 and not used`, [row.id]);
    await q(`insert into password_otps (id,user_id,channel,code_hash,expires_at) values ($1,$2,$3,$4, now() + interval '10 minutes')`, [uid('otp'), row.id, ch, hashPassword(code)]);
    const text = `رمز استعادة كلمة المرور لنظام الأملاك (${S.org}): ${code}\nصالح لمدة 10 دقائق. إن لم تطلبه فتجاهل هذه الرسالة.`;
    try { if (ch === 'email') await sendMail(smtpFrom(S)!, dest, 'رمز استعادة كلمة المرور', text); else await sendSms(S, dest, text); }
    catch (e: any) { await q(`insert into activity_log (username,action,entity,entity_id,details) values ('النظام','تعذر إرسال رمز استعادة','user',$1,$2)`, [username, e.message]); go(recPath(username), 'err', 'تعذر إرسال الرمز. جرّب طريقة أخرى أو تواصل مع المدير'); }
    await q(`insert into activity_log (username,action,entity,entity_id,details) values ('—','إرسال رمز استعادة','user',$1,$2)`, [username, ch === 'email' ? 'بريد' : 'جوال']);
  }
  // نفس الرسالة دائماً حتى لا تكشف الصفحة وجود المستخدم أو بياناته
  go(recPath(username, `&m=${ch}&sent=1`), 'ok', `إن كانت البيانات صحيحة فقد أُرسل رمز من 6 أرقام إلى ${ch === 'email' ? 'البريد' : 'الجوال'} المسجل. صالح 10 دقائق.`);
}

export async function recoverPassword(fd: FormData) {
  const username = s(fd, 'username')?.toLowerCase() ?? '', method = s(fd, 'method') ?? '', secret = s(fd, 'secret') ?? '', nw = s(fd, 'new'), cf = s(fd, 'confirm');
  const back = (m: string): never => go(recPath(username, method ? `&m=${method}` : ''), 'err', m);
  if (!username || !secret || !nw) back('أكمل كل الحقول');
  if (nw!.length < 8) back('كلمة المرور الجديدة 8 أحرف على الأقل');
  if (nw !== cf) back('تأكيد كلمة المرور غير مطابق');
  if (await tooMany(username, 'محاولة استعادة فاشلة', 5)) back('محاولات كثيرة. انتظر 15 دقيقة ثم أعد المحاولة');
  const [row] = await q('select * from users where lower(username)=$1 and active', [username]);
  let ok = false, note = '', after: Record<string, unknown> = {};
  if (row) {
    if (method === 'code') {
      const hashes: string[] = (() => { try { return JSON.parse(row.recovery || '[]'); } catch { return []; } })();
      const i = hashes.findIndex((h) => verifyPassword(normCode(secret), h));
      if (i >= 0) { hashes.splice(i, 1); ok = true; after = { recovery: JSON.stringify(hashes) }; note = `برمز استعادة (تبقّى ${hashes.length})`; }
      else if (row.recovery_word && verifyPassword(normText(secret), row.recovery_word)) { ok = true; note = 'بالكلمة المحفوظة'; }
    } else if (method === 'question' && row.secret_a) { ok = verifyPassword(normText(secret), row.secret_a); note = 'بالسؤال السري'; }
    else if (method === 'email' || method === 'phone') {
      const [otp] = await q(`select * from password_otps where user_id=$1 and channel=$2 and not used and expires_at > now() order by created_at desc limit 1`, [row.id, method]);
      if (otp) {
        if (otp.attempts >= 5) { await q('update password_otps set used=true where id=$1', [otp.id]); }
        else if (verifyPassword(secret.replace(/\D/g, ''), otp.code_hash)) { ok = true; note = method === 'email' ? 'برمز البريد' : 'برمز الجوال'; await q('update password_otps set used=true where id=$1', [otp.id]); }
        else await q('update password_otps set attempts=attempts+1 where id=$1', [otp.id]);
      }
    }
  }
  if (!ok) { await failed(username, `طريقة: ${method}`); back(method === 'email' || method === 'phone' ? 'الرمز غير صحيح أو منتهي. اطلب رمزاً جديداً' : 'البيانات غير صحيحة'); }
  const cols = { pass_hash: hashPassword(nw!), must_change: false, ...after };
  const keys = Object.keys(cols);
  await q(`update users set ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} where id=$1`, [row.id, ...keys.map((k) => (cols as Record<string, unknown>)[k])]);
  await log(row as User, 'استعادة كلمة المرور', 'user', row.id, note);
  go('/login', 'ok', 'تم تعيين كلمة المرور الجديدة. ادخل بها الآن.');
}

// ---------- إعدادات البريد والرسائل (للمدير) ----------
export async function saveRecoverySettings(fd: FormData) {
  const u = await requireUser('admin');
  const keys = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_from', 'sms_url', 'sms_method', 'sms_body'];
  for (const k of keys) await q('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, s(fd, k) ?? '']);
  for (const k of ['smtp_pass', 'sms_auth']) { const v = s(fd, k); if (v === '-') await q(`update settings set value='' where key=$1`, [k]); else if (v) await q('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]); }
  await log(u, 'تعديل إعدادات البريد والرسائل', undefined, undefined, `بريد: ${s(fd, 'smtp_host') || '—'} • رسائل: ${s(fd, 'sms_url') ? 'مفعّلة' : '—'}`);
  go('/settings', 'ok', 'تم حفظ إعدادات البريد والرسائل');
}
export async function testRecoveryChannel(fd: FormData) {
  const u = await requireUser('admin'); const ch = s(fd, 'channel'), to = s(fd, 'to'); const S = await getSettings();
  if (!to) go('/settings', 'err', 'اكتب البريد أو الجوال المراد التجربة عليه');
  try {
    if (ch === 'email') { const c = smtpFrom(S); if (!c) go('/settings', 'err', 'أكمل إعدادات البريد أولاً'); await sendMail(c!, to!, 'تجربة بريد نظام الأملاك', `هذه رسالة تجربة من نظام الأملاك (${S.org}). الإعدادات تعمل.`); }
    else { if (!smsReady(S)) go('/settings', 'err', 'أكمل إعدادات بوابة الرسائل أولاً'); await sendSms(S, to!, `تجربة رسائل نظام الأملاك (${S.org})`); }
  } catch (e: any) { if (String(e?.digest ?? '').startsWith('NEXT_REDIRECT')) throw e; go('/settings', 'err', `فشلت التجربة: ${e.message}`); }
  await log(u, 'تجربة إرسال', undefined, undefined, `${ch === 'email' ? 'بريد' : 'جوال'} إلى ${to}`);
  go('/settings', 'ok', `أُرسلت رسالة التجربة إلى ${to}`);
}
