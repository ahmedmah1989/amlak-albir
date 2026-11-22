'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx, uid } from './db';
import { requireAction, log, type User } from './auth';
import { readSheet, parseEjar, guessBank, bankLines, type BankMap } from './sheets';
import { todayRiyadh } from './data';
import { restore as doRestore } from './backup';
import { assertOpenPeriod, saveFiles } from './guard';

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : v; };
const n = (fd: FormData, k: string) => { const v = s(fd, k); if (v == null) return null; const x = Number(v.replace(/,/g, '')); return Number.isFinite(x) ? x : NaN; };
function back(path: string, err: string): never { redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(err)}`); }
function done(path: string, ok: string): never { revalidatePath('/', 'layout'); redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(ok)}`); }
const money = (x: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(x);
const isHex = (v: string | null) => !!v && /^#[0-9a-f]{6}$/i.test(v);

// ---------- المظهر والتفضيلات ----------
export async function setPref(fd: FormData) {
  const u = await requireAction(); const p = JSON.parse(u.prefs || '{}');
  const fz = s(fd, 'fz'); if (fz === '+' || fz === '-') p.fz = Math.max(85, Math.min(130, (p.fz ?? 100) + (fz === '+' ? 5 : -5))); else if (fz) p.fz = Math.max(85, Math.min(130, Number(fz)));
  for (const k of ['font', 'date_format']) { const v = s(fd, k); if (v !== null) p[k] = v === 'default' ? undefined : v; }
  const th = s(fd, 'theme'); if (th === 'light' || th === 'dark' || th === 'auto') p.theme = th === 'light' ? undefined : th;
  const tour = s(fd, 'tour'); if (tour === 'done') p.tour = 'done';
  await q('update users set prefs=$1 where id=$2', [JSON.stringify(p), u.id]);
  revalidatePath('/', 'layout'); const b = s(fd, 'back') || '/'; redirect(/[^\x00-\x7f]/.test(b) ? encodeURI(b) : b);
}
export async function saveAppearance(fd: FormData) {
  const u = await requireAction('admin');
  if (s(fd, 'reset')) { for (const [k, v] of [['brand_primary', '#456a42'], ['brand_accent', '#ba8f0e'], ['brand_side', '#23361f'], ['brand_bg', '#f4f5f1'], ['brand_logo', ''], ['font_default', 'Readex Pro']]) await q('update settings set value=$1 where key=$2', [v, k]); await log(u, 'استعادة هوية الجمعية'); done('/settings/appearance', 'استُعيدت هوية الجمعية الافتراضية'); }
  for (const k of ['brand_primary', 'brand_accent', 'brand_side', 'brand_bg']) { const v = s(fd, k); if (v) { if (!isHex(v)) back('/settings/appearance', 'لون غير صحيح'); await q('update settings set value=$1 where key=$2', [v, k]); } }
  const font = s(fd, 'font_default'); if (font) await q(`update settings set value=$1 where key='font_default'`, [font]);
  const f = fd.get('logo') as File | null;
  if (f && f.size) {
    if (f.size > 1024 * 1024) back('/settings/appearance', 'حجم الشعار يجب ألا يزيد عن 1 ميجابايت');
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) back('/settings/appearance', 'الشعار يجب أن يكون PNG أو JPG أو SVG أو WEBP');
    await q(`update settings set value=$1 where key='brand_logo'`, [`data:${f.type};base64,${Buffer.from(await f.arrayBuffer()).toString('base64')}`]);
  }
  await log(u, 'تعديل الهوية والمظهر'); done('/settings/appearance', 'تم حفظ الهوية والمظهر');
}
export async function saveSystem(fd: FormData) {
  const u = await requireAction('admin');
  const df = s(fd, 'date_format'); if (df) await q(`update settings set value=$1 where key='date_format'`, [df]);
  const lk = s(fd, 'locked_until') ?? ''; await q(`update settings set value=$1 where key='locked_until'`, [lk]);
  const keep = n(fd, 'backup_keep'); if (keep && keep >= 3 && keep <= 365) await q(`update settings set value=$1 where key='backup_keep'`, [String(keep)]);
  await log(u, 'تعديل إعدادات النظام', undefined, undefined, `إقفال حتى ${lk || '—'}`); done('/settings', 'تم حفظ الإعدادات');
}

// ---------- المرفقات ----------
export async function uploadAttachment(fd: FormData) {
  const u = await requireAction('accountant'); const entity = s(fd, 'entity')!, id = s(fd, 'entity_id')!, backTo = s(fd, 'back') || '/';
  const files = fd.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
  if (!files.length) back(backTo, 'اختر ملفاً واحداً على الأقل');
  let c = 0; try { c = await saveFiles(entity, id, files, u, s(fd, 'category'), s(fd, 'expires_on')); } catch (e: any) { back(backTo, e.message); }
  await log(u, 'إرفاق مستندات', entity, id, `${c} ملف`); done(backTo, c === 1 ? 'تم إرفاق ملف واحد' : c === 2 ? 'تم إرفاق ملفين' : `تم إرفاق ${c} ملفات`);
}
export async function deleteAttachment(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!, backTo = s(fd, 'back') || '/';
  const [a] = await q('select file_name from attachments where id=$1', [id]);
  await q('delete from attachments where id=$1', [id]); await log(u, 'حذف مرفق', 'attachment', id, a?.file_name); done(backTo, 'تم حذف المرفق');
}

// ---------- منصة إيجار ----------
async function relinkEjar(t: (s: string, p?: unknown[]) => Promise<any[]>, contractNo: string) {
  const [c] = await t(`select id from contracts where regexp_replace(coalesce(contract_no,''),'\\D','','g')=regexp_replace($1,'\\D','','g') order by (status='active') desc limit 1`, [contractNo]);
  if (!c) return 0;
  await t('update ejar_installments set contract_id=$1 where contract_no=$2', [c.id, contractNo]);
  const rows = await t('select id, issue_date, amount from ejar_installments where contract_no=$1', [contractNo]);
  for (const r of rows) {
    const [i] = await t(`select id from installments where contract_id=$1 and abs(amount-$2)<0.5 and abs(due_date - $3::date) <= 20 order by abs(due_date - $3::date) limit 1`, [c.id, r.amount, r.issue_date]);
    if (i) await t('update ejar_installments set installment_id=$1 where id=$2', [i.id, r.id]);
  }
  return 1;
}
export async function importEjar(fd: FormData) {
  const u = await requireAction('accountant'); const f = fd.get('file') as File | null;
  if (!f || !f.size) back('/ejar', 'اختر ملف إيجار (xlsx أو csv)');
  let parsed; try { parsed = parseEjar(readSheet(await f.arrayBuffer())); } catch (e: any) { back('/ejar', e.message); }
  if (!parsed.items.length) back('/ejar', 'الملف لا يحتوي على أقساط');
  const nos = new Set<string>();
  await tx(async (t) => {
    for (const it of parsed!.items) {
      nos.add(it.contract_no);
      await t(`insert into ejar_installments (id,contract_no,installment_no,invoice_no,issue_date,due_date,amount,status,contract_type,ejar_property_id,state,start_date,end_date,version,broker,file_name,imported_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        on conflict (installment_no) do update set status=excluded.status, amount=excluded.amount, issue_date=excluded.issue_date, due_date=excluded.due_date, state=excluded.state, version=excluded.version, file_name=excluded.file_name, imported_at=now()`,
        [uid('ej'), it.contract_no, it.installment_no, it.invoice_no, it.issue_date, it.due_date, it.amount, it.status, it.contract_type, it.ejar_property_id, it.state, it.start_date, it.end_date, it.version, it.broker, f!.name, u.full_name]);
    }
    for (const no of nos) await relinkEjar(t, no);
  });
  await log(u, 'استيراد ملف إيجار', 'ejar', [...nos].join(','), `${parsed.items.length} قسط من ${f!.name}`);
  done(`/ejar?c=${[...nos][0]}`, `تم استيراد ${parsed.items.length} قسطاً لعدد ${nos.size} عقد`);
}
export async function linkEjar(fd: FormData) {
  const u = await requireAction('accountant'); const no = s(fd, 'contract_no')!, cid = s(fd, 'contract_id');
  if (!cid) back(`/ejar?c=${no}`, 'اختر العقد');
  await tx(async (t) => { await t(`update contracts set contract_no=coalesce(nullif(contract_no,''),$1) where id=$2`, [no, cid]); await t('update ejar_installments set contract_id=$1 where contract_no=$2', [cid, no]); await relinkEjar(t, no); });
  await log(u, 'ربط عقد إيجار', 'contract', cid!, no); done(`/ejar?c=${no}`, 'تم ربط عقد إيجار بالعقد');
}
export async function contractFromEjar(fd: FormData) {
  const u = await requireAction('accountant'); const no = s(fd, 'contract_no')!, unit = s(fd, 'unit_id'), tenant = s(fd, 'tenant_id');
  if (!unit || !tenant) back(`/ejar?c=${no}`, 'اختر الوحدة والمستأجر');
  const rows = await q('select * from ejar_installments where contract_no=$1 order by issue_date', [no]);
  if (!rows.length) back('/ejar', 'لا توجد أقساط لهذا العقد');
  const [un] = await q('select property_id from units where id=$1', [unit]);
  const first = rows[0], total = rows.reduce((x, r) => x + Number(r.amount), 0);
  const months = Math.max(1, Math.round((new Date(first.end_date).getTime() - new Date(first.start_date).getTime()) / (30.44 * 864e5)));
  const id = uid('c');
  await tx(async (t) => {
    await t(`insert into contracts (id,property_id,unit_id,tenant_id,start_date,end_date,annual_rent,frequency,status,contract_no,ejar_property_id,broker,notes) values ($1,$2,$3,$4,$5,$6,$7,'special','active',$8,$9,$10,$11)`,
      [id, un.property_id, unit, tenant, first.start_date, first.end_date, Math.round((total * 12) / months), no, first.ejar_property_id, first.broker, `أُنشئ من ملف منصة إيجار (${first.contract_type ?? ''})`]);
    let k = 1;
    for (const r of rows) {
      const iid = uid('i');
      await t('insert into installments (id,contract_id,no,period_from,period_to,due_date,amount,note) values ($1,$2,$3,$4,$4,$4,$5,$6)', [iid, id, k++, r.issue_date, r.amount, `فاتورة إيجار ${r.installment_no}`]);
      await t('update ejar_installments set contract_id=$1, installment_id=$2 where id=$3', [id, iid, r.id]);
    }
  });
  await log(u, 'إنشاء عقد من إيجار', 'contract', id, no); done(`/contracts/${id}`, 'تم إنشاء العقد وأقساطه من ملف إيجار');
}

// ---------- كشف البنك ----------
export async function saveBankAccount(fd: FormData) {
  const u = await requireAction('admin'); const name = s(fd, 'name'); if (!name) back('/bank', 'اسم الحساب مطلوب');
  const iban = s(fd, 'iban'); if (iban && !/^SA\d{22}$/i.test(iban.replace(/\s/g, ''))) back('/bank', 'رقم الآيبان يجب أن يبدأ بـ SA ويتكون من 24 خانة');
  await q('insert into bank_accounts (id,name,bank,iban) values ($1,$2,$3,$4)', [uid('ba'), name, s(fd, 'bank'), iban?.replace(/\s/g, '').toUpperCase() ?? null]);
  await log(u, 'إضافة حساب بنكي', undefined, undefined, name!); done('/bank', 'تمت إضافة الحساب');
}
export async function uploadBank(fd: FormData) {
  const u = await requireAction('accountant'); const acc = s(fd, 'account_id'), f = fd.get('file') as File | null;
  if (!acc) back('/bank', 'اختر الحساب البنكي'); if (!f || !f.size) back('/bank', 'اختر ملف كشف الحساب');
  let rows: string[][]; try { rows = readSheet(await f!.arrayBuffer()); } catch { back('/bank', 'تعذّرت قراءة الملف؛ المقبول xlsx أو xls أو csv'); }
  const [a] = await q('select mapping from bank_accounts where id=$1', [acc]);
  const map: BankMap = a?.mapping ? JSON.parse(a.mapping) : guessBank(rows!);
  const id = uid('bi');
  await q('insert into bank_imports (id,account_id,file_name,raw,mapping,created_by) values ($1,$2,$3,$4,$5,$6)', [id, acc, f!.name, JSON.stringify(rows!.slice(0, 3000)), JSON.stringify(map), u.full_name]);
  redirect(`/bank/import/${id}`);
}
export async function confirmBankImport(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!;
  const [imp] = await q('select * from bank_imports where id=$1', [id]); if (!imp || imp.status !== 'pending') back('/bank', 'الاستيراد غير موجود أو تم تأكيده');
  const map: BankMap = { header: Number(s(fd, 'header') ?? 0), date: Number(s(fd, 'date') ?? -1), credit: Number(s(fd, 'credit') ?? -1), debit: Number(s(fd, 'debit') ?? -1), amount: Number(s(fd, 'amount') ?? -1), desc: Number(s(fd, 'desc') ?? -1), ref: Number(s(fd, 'ref') ?? -1) };
  if (map.date < 0 || (map.credit < 0 && map.amount < 0)) back(`/bank/import/${id}`, 'حدد عمود التاريخ وعمود المبلغ الدائن (أو المبلغ)');
  if (s(fd, 'preview')) { await q('update bank_imports set mapping=$1 where id=$2', [JSON.stringify(map), id]); redirect(`/bank/import/${id}`); }
  const lines = bankLines(JSON.parse(imp.raw), map); let added = 0, dup = 0;
  await tx(async (t) => {
    for (const l of lines) {
      const fp = [imp.account_id, l.date, l.amount.toFixed(2), l.ref, l.description].join('|');
      const r = await t('insert into bank_lines (id,import_id,account_id,date,description,ref,amount,fingerprint) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (fingerprint) do nothing returning id', [uid('bl'), id, imp.account_id, l.date, l.description || null, l.ref || null, l.amount, fp]);
      r.length ? added++ : dup++;
    }
    const ds = lines.map((l) => l.date!).sort();
    await t(`update bank_imports set status='done', rows=$1, date_from=$2, date_to=$3, mapping=$4 where id=$5`, [added, ds[0] ?? null, ds[ds.length - 1] ?? null, JSON.stringify(map), id]);
    if (s(fd, 'remember')) await t('update bank_accounts set mapping=$1 where id=$2', [JSON.stringify(map), imp.account_id]);
  });
  await log(u, 'استيراد كشف بنك', 'bank_import', id, `${added} إيداع، ${dup} مكرر`);
  done('/bank/match', `أُضيف ${added === 1 ? 'إيداع واحد' : added === 2 ? 'إيداعان' : added <= 10 ? added + ' إيداعات' : added + ' إيداعاً'}${dup ? ` وتُجوهل ${dup} مكرر سبق استيراده` : ''}`);
}
export async function matchBankLine(fd: FormData) {
  const u = await requireAction('accountant'); const lid = s(fd, 'line_id')!, kind = s(fd, 'kind'), ids = (s(fd, 'ids') ?? '').split(',').filter(Boolean);
  const [l] = await q('select * from bank_lines where id=$1', [lid]); if (!l || l.status !== 'open') back('/bank/match', 'الإيداع غير متاح للمطابقة');
  await assertOpenPeriod(l.date, '/bank/match');
  if (kind === 'payment') {
    await tx(async (t) => { await t('update payments set bank_line_id=$1 where id=$2', [lid, ids[0]]); await t(`update bank_lines set status='matched', payment_id=$1, matched_by=$2, matched_at=now() where id=$3`, [ids[0], u.full_name, lid]); });
    await log(u, 'مطابقة سند مع البنك', 'payment', ids[0], money(Number(l.amount))); done('/bank/match', 'تمت المطابقة');
  }
  if (kind !== 'inst' || !ids.length) back('/bank/match', 'اختيار غير صحيح');
  const pid = uid('pay');
  const rno = await tx(async (t) => {
    const insts = await t(`select i.id, i.contract_id, c.tenant_id, round(i.amount - i.opening_paid
      - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id=a.payment_id where a.installment_id=i.id and not p.voided),0)
      - coalesce((select sum(d.amount) from adjustments d where d.installment_id=i.id and d.status='approved'),0),2) bal
      from installments i join contracts c on c.id=i.contract_id where i.id = any($1::text[]) order by i.due_date`, [ids]);
    const total = insts.reduce((x: number, r: any) => x + Number(r.bal), 0);
    if (Math.abs(total - Number(l.amount)) > 0.5) throw new Error('مجموع الأقساط المختارة لا يساوي مبلغ الإيداع');
    const [st] = await t(`update settings set value=(value::int+1)::text where key='receipt_seq' returning value`);
    const [pf] = await t(`select value from settings where key='receipt_prefix'`);
    const r = `${pf?.value ?? 'R'}-${String(l.date).slice(0, 4)}-${String(st.value).padStart(4, '0')}`;
    await t(`insert into payments (id,receipt_no,tenant_id,contract_id,paid_on,amount,method,bank_ref,note,created_by,bank_line_id) values ($1,$2,$3,$4,$5,$6,'تحويل بنكي',$7,$8,$9,$10)`,
      [pid, r, insts[0].tenant_id, insts[0].contract_id, l.date, l.amount, l.ref || l.description?.slice(0, 60) || 'كشف البنك', 'أُنشئ من مطابقة كشف البنك', u.full_name, lid]);
    for (const i of insts) { await t('insert into payment_allocations values ($1,$2,$3)', [pid, i.id, i.bal]); await t('update installments set needs_confirmation=false where id=$1', [i.id]); }
    await t(`update bank_lines set status='matched', payment_id=$1, matched_by=$2, matched_at=now() where id=$3`, [pid, u.full_name, lid]);
    return r;
  }).catch((e: Error) => back('/bank/match', e.message));
  await log(u, 'سند من مطابقة البنك', 'payment', pid, `${rno} — ${money(Number(l.amount))}`); done('/bank/match', `تمت المطابقة وأُنشئ السند ${rno}`);
}
export async function ignoreBankLine(fd: FormData) {
  const u = await requireAction('accountant'); const lid = s(fd, 'line_id')!, note = s(fd, 'note');
  if (!note) back('/bank/match', 'اكتب سبب الاستبعاد (مثلاً: ليس إيجاراً)');
  await q(`update bank_lines set status='ignored', note=$1, matched_by=$2, matched_at=now() where id=$3`, [note, u.full_name, lid]);
  await log(u, 'استبعاد إيداع بنكي', 'bank_line', lid, note!); done('/bank/match', 'تم استبعاد الإيداع من المطابقة');
}
export async function unmatchBankLine(fd: FormData) {
  const u = await requireAction('admin'); const lid = s(fd, 'line_id')!;
  const [l] = await q('select * from bank_lines where id=$1', [lid]);
  await tx(async (t) => { if (l.payment_id) await t('update payments set bank_line_id=null where id=$1', [l.payment_id]); await t(`update bank_lines set status='open', payment_id=null, matched_by=null, matched_at=null where id=$1`, [lid]); });
  await log(u, 'إلغاء مطابقة إيداع', 'bank_line', lid, 'السند المنشأ يبقى؛ يُلغى من صفحته إن لزم'); done('/bank/lines', 'أُلغيت المطابقة');
}

// ---------- الاعتمادات ----------
async function canApprove(u: User, requester: string | null) {
  if (requester !== u.full_name) return true;
  const [{ c }] = await q(`select count(*)::int c from users where role='admin' and active`); return c <= 1;
}
export async function decideAdjustment(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!, ok = s(fd, 'decision') === 'approve';
  const [x] = await q('select * from adjustments where id=$1', [id]); if (!x || x.status !== 'pending') back('/approvals', 'الطلب غير موجود أو تم البت فيه');
  if (!(await canApprove(u, x.requested_by))) back('/approvals', 'لا يعتمد الطلب من طلبه');
  if (ok && !s(fd, 'decision_no') && !x.decision_no) back('/approvals', 'رقم القرار مطلوب للاعتماد');
  await q(`update adjustments set status=$1, approved_by=$2, approved_at=now(), decision_no=coalesce($3,decision_no) where id=$4`, [ok ? 'approved' : 'rejected', u.full_name, s(fd, 'decision_no'), id]);
  await log(u, ok ? 'اعتماد خصم' : 'رفض خصم', 'adjustment', id, `${x.type} ${money(Number(x.amount))}`); done('/approvals', ok ? 'اعتُمد الخصم وطُبّق على القسط' : 'رُفض الطلب');
}
export async function requestException(fd: FormData) {
  const u = await requireAction('accountant'); const rule = s(fd, 'rule'), scope = s(fd, 'scope'), reason = s(fd, 'reason'), backTo = s(fd, 'back') || '/audit';
  if (!rule || !scope || !reason) back(backTo, 'القاعدة والنطاق والمبرر مطلوبة');
  if (scope === 'before' && !s(fd, 'before_date')) back(backTo, 'حدد التاريخ الذي يُستثنى ما قبله');
  await q('insert into exceptions (id,rule,scope,entity_id,property_id,before_date,reason,requested_by,expires_on) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [uid('ex'), rule, scope, s(fd, 'entity_id'), s(fd, 'property_id'), s(fd, 'before_date'), reason, u.full_name, s(fd, 'expires_on')]);
  await log(u, 'طلب استثناء', 'exception', undefined, `${rule} — ${reason}`); done(backTo, 'أُرسل طلب الاستثناء للاعتماد');
}
export async function decideException(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!, ok = s(fd, 'decision') === 'approve';
  const [x] = await q('select * from exceptions where id=$1', [id]); if (!x || x.status !== 'pending') back('/approvals', 'الطلب غير موجود');
  if (!(await canApprove(u, x.requested_by))) back('/approvals', 'لا يعتمد الطلب من طلبه');
  await q('update exceptions set status=$1, approved_by=$2 where id=$3', [ok ? 'approved' : 'rejected', u.full_name, id]);
  await log(u, ok ? 'اعتماد استثناء' : 'رفض استثناء', 'exception', id, x.rule); done('/approvals', ok ? 'اعتُمد الاستثناء' : 'رُفض الاستثناء');
}
export async function revokeException(fd: FormData) {
  const u = await requireAction('admin'); const id = s(fd, 'id')!;
  await q(`update exceptions set status='rejected' where id=$1`, [id]); await log(u, 'إلغاء استثناء', 'exception', id); done('/audit?tab=exc', 'أُلغي الاستثناء وعادت الحالات للفحص');
}

// ---------- الصيانة ----------
export async function saveMaintenance(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id'), pid = s(fd, 'property_id'), title = s(fd, 'title');
  const path = id ? `/maintenance/${id}` : '/maintenance/new';
  if (!pid || !title) back(path, 'العقار وعنوان الطلب مطلوبان');
  const v = [pid, s(fd, 'unit_id'), title, s(fd, 'details'), s(fd, 'priority') ?? 'عادية', s(fd, 'vendor'), n(fd, 'est_cost'), s(fd, 'charge_to') ?? 'الجمعية'];
  let mid = id;
  if (id) await q('update maintenance set property_id=$1,unit_id=$2,title=$3,details=$4,priority=$5,vendor=$6,est_cost=$7,charge_to=$8 where id=$9', [...v, id]);
  else { mid = uid('m'); await q('insert into maintenance (property_id,unit_id,title,details,priority,vendor,est_cost,charge_to,id,opened_on,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [...v, mid, s(fd, 'opened_on') ?? todayRiyadh(), u.full_name]); }
  const files = fd.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length) try { await saveFiles('maintenance', mid!, files, u, 'صور الطلب'); } catch (e: any) { back(path, e.message); }
  await log(u, id ? 'تعديل طلب صيانة' : 'طلب صيانة جديد', 'maintenance', mid!, title!); done(`/maintenance/${mid}`, 'تم حفظ طلب الصيانة');
}
export async function setMaintStatus(fd: FormData) {
  const u = await requireAction('accountant'); const id = s(fd, 'id')!, st = s(fd, 'status')!;
  const [m] = await q('select * from maintenance where id=$1', [id]);
  if (st === 'done') {
    const cost = n(fd, 'cost'), d = s(fd, 'closed_on') ?? todayRiyadh();
    if (cost == null || Number.isNaN(cost) || cost < 0) back(`/maintenance/${id}`, 'أدخل التكلفة الفعلية (صفر إن لم توجد)');
    await assertOpenPeriod(d, `/maintenance/${id}`);
    await tx(async (t) => {
      let eid: string | null = null;
      if (cost! > 0 && m.charge_to === 'الجمعية') { eid = uid('e'); await t('insert into expenses (id,property_id,date,category,amount,vendor,ref,description,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [eid, m.property_id, d, 'صيانة وإصلاحات', cost, m.vendor, `صيانة ${id}`, m.title, u.full_name]); }
      await t(`update maintenance set status='done', cost=$1, closed_on=$2, expense_id=$3 where id=$4`, [cost, d, eid, id]);
    });
    const files = fd.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
    if (files.length) await saveFiles('maintenance', id, files, u, 'الفاتورة وصور بعد التنفيذ');
    await log(u, 'إغلاق طلب صيانة', 'maintenance', id, money(cost!)); done(`/maintenance/${id}`, cost! > 0 && m.charge_to === 'الجمعية' ? 'أُغلق الطلب وسُجّلت تكلفته في المصروفات' : 'أُغلق الطلب');
  }
  await q('update maintenance set status=$1 where id=$2', [st, id]); await log(u, 'تحديث حالة صيانة', 'maintenance', id, st); done(`/maintenance/${id}`, 'تم تحديث الحالة');
}

// ---------- المهام ----------
export async function toggleTask(fd: FormData) {
  const u = await requireAction('accountant'); const key = s(fd, 'key')!;
  const [x] = await q('select status from task_states where key=$1 and (until is null or until>=current_date)', [key]);
  if (x) await q('delete from task_states where key=$1', [key]);
  else await q(`insert into task_states (key,status,until,by_user) values ($1,'done',$2,$3) on conflict (key) do update set status='done', until=excluded.until, by_user=excluded.by_user, at=now()`, [key, todayRiyadh(), u.full_name]);
  if (key.startsWith('man:') && !x) await q(`update tasks set status='done' where id=$1`, [key.slice(4)]);
  revalidatePath('/', 'layout'); redirect(s(fd, 'back') || '/');
}
export async function addTask(fd: FormData) {
  const u = await requireAction('accountant'); const title = s(fd, 'title'); if (!title) back('/', 'عنوان المهمة مطلوب');
  await q('insert into tasks (id,title,details,due,assignee,priority,created_by) values ($1,$2,$3,$4,$5,$6,$7)', [uid('tk'), title, s(fd, 'details'), s(fd, 'due'), s(fd, 'assignee'), s(fd, 'priority') ?? 'p2', u.full_name]);
  await log(u, 'مهمة يدوية', undefined, undefined, title!); done('/', 'أُضيفت المهمة');
}

// ---------- الاستعادة ----------
export async function restoreBackup(fd: FormData) {
  const u = await requireAction('admin'); const f = fd.get('file') as File | null;
  if (s(fd, 'confirm') !== 'استعادة') back('/backups', 'اكتب كلمة «استعادة» للتأكيد');
  if (!f || !f.size) back('/backups', 'اختر ملف النسخة');
  try { await doRestore(await f!.text(), u.full_name); } catch (e: any) { back('/backups', 'فشلت الاستعادة: ' + e.message); }
  done('/backups', 'تمت الاستعادة، وأُخذت نسخة من البيانات السابقة قبلها');
}
