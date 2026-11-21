import 'server-only';
/**
 * فوترة اشتراكات الجهات (لوحة المالك):
 * - expires_on في سجل الجهة = «مدفوع حتى». فاتورة التجديد تغطي الفترة التالية له، وسدادها يمدّ التاريخ.
 * - يومياً: إصدار فاتورة التجديد قبل الانتهاء بـ 14 يوماً، وتذكير بالبريد قبل 7 أيام، وإيقاف الجهة بعد مهلة السماح.
 */
import { pq, runAs, MAIN, uid } from './db';
import { getSettings } from './data';
import { sendMail, smtpFrom } from './mailer';
import { clearOrgCache } from './auth';

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => day(new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5));
const addMonths = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return day(d); };
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
export const CYCLES: [string, string][] = [['monthly', 'شهري'], ['annual', 'سنوي']];
export const INV_STATUS: Record<string, [string, string]> = { unpaid: ['غير مدفوعة', 'warn'], paid: ['مدفوعة', 'ok'], void: ['ملغاة', 'mute'] };

export async function priceFor(o: Record<string, any>) {
  if (o.price != null && o.price !== '') return Number(o.price);
  const [p] = await pq('select monthly, annual from plans where key=$1', [o.plan]);
  return p ? Number(o.billing_cycle === 'monthly' ? p.monthly : p.annual) : 0;
}
async function settingsP() { return Object.fromEntries((await pq('select key, value from settings')).map((r) => [r.key, r.value])); }
/** يصدر فاتورة التجديد التالية للجهة (إن لم تكن لها فاتورة مفتوحة) */
export async function issueRenewal(slug: string, by: string) {
  const [o] = await pq('select * from orgs where slug=$1', [slug]); if (!o) throw new Error('جهة غير موجودة');
  const [open] = await pq(`select no from sub_invoices where org=$1 and status='unpaid'`, [slug]); if (open) throw new Error(`للجهة فاتورة مفتوحة ${open.no}`);
  const amount = await priceFor(o); if (!(amount > 0)) throw new Error('لا يوجد سعر لهذه الباقة — حدد السعر من «الباقات والأسعار» أو سعراً خاصاً للجهة');
  const t = today(), paidTo = o.expires_on ? String(o.expires_on) : null;
  const from = paidTo && paidTo >= t ? addDays(paidTo, 1) : t;
  const to = addDays(o.billing_cycle === 'monthly' ? addMonths(from, 1) : addMonths(from, 12), -1);
  const S = await settingsP(); const rate = Number(S.vat_rate ?? 15);
  const vat = Math.round(amount * rate) / 100, total = Math.round((amount + vat) * 100) / 100;
  const [{ n }] = await pq(`select count(*)::int + 1 as n from sub_invoices`);
  const no = `SUB-${t.slice(0, 4)}-${String(n).padStart(4, '0')}`, id = uid('si');
  await pq(`insert into sub_invoices (id,no,org,period_from,period_to,amount,vat,total,due_on,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, no, slug, from, to, amount, vat, total, paidTo && paidTo >= t ? paidTo : t, by]);
  await pq('insert into platform_log (username,action,org,details) values ($1,$2,$3,$4)', [by, 'إصدار فاتورة اشتراك', slug, `${no} • ${total} ريال • ${from} إلى ${to}`]);
  await notifyOrg(o, `فاتورة اشتراك ${no}`, `السلام عليكم،\nصدرت فاتورة تجديد اشتراك ${o.name} في نظام الأملاك بمبلغ ${total} ريال (شامل الضريبة) عن الفترة ${from} إلى ${to}.\nتاريخ الاستحقاق: ${paidTo && paidTo >= t ? paidTo : t}.\nشاكرين لكم.`).catch(() => {});
  return { id, no };
}
/** تسجيل سداد فاتورة: يمدّ الاشتراك ويعيد تفعيل الجهة إن كانت موقوفة بسبب عدم السداد */
export async function markPaid(id: string, o: { paid_on: string; method: string; ref: string | null; by: string }) {
  const [inv] = await pq(`update sub_invoices set status='paid', paid_on=$2, method=$3, ref=$4 where id=$1 and status='unpaid' returning *`, [id, o.paid_on, o.method, o.ref]);
  if (!inv) throw new Error('الفاتورة غير موجودة أو ليست مفتوحة');
  const [org] = await pq('select * from orgs where slug=$1', [inv.org]);
  const newTo = !org.expires_on || String(org.expires_on) < String(inv.period_to) ? String(inv.period_to) : String(org.expires_on);
  await pq(`update orgs set expires_on=$2, status=case when status='suspended' and notes like '%[إيقاف آلي]%' then 'active' else status end, notes=replace(notes,' [إيقاف آلي]','') where slug=$1`, [inv.org, newTo]);
  clearOrgCache(inv.org);
  await pq('insert into platform_log (username,action,org,details) values ($1,$2,$3,$4)', [o.by, 'سداد فاتورة اشتراك', inv.org, `${inv.no} • ${inv.total} • ${o.method}${o.ref ? ' ' + o.ref : ''} • مدفوع حتى ${newTo}`]);
  return newTo;
}
async function notifyOrg(o: Record<string, any>, subject: string, text: string) {
  if (!o.contact_email) return;
  const S = await runAs(MAIN, () => getSettings()); const cfg = smtpFrom(S); if (!cfg) return;
  await sendMail(cfg, o.contact_email, subject, text);
}
/** المهام اليومية للفوترة (تُستدعى من الجدولة مرة كل ساعة تقريباً) */
export async function billingTick() {
  const t = today(), S = await settingsP(); if (S.billing_last === t) return; await pq(`insert into settings values ('billing_last',$1) on conflict (key) do update set value=excluded.value`, [t]);
  const orgs = await pq(`select * from orgs where plan <> 'trial'`);
  for (const o of orgs) {
    const exp = o.expires_on ? String(o.expires_on) : null;
    if (o.status === 'active' && exp && exp <= addDays(t, 14)) { const [open] = await pq(`select 1 from sub_invoices where org=$1 and status='unpaid'`, [o.slug]); if (!open) await issueRenewal(o.slug, 'الفوترة التلقائية').catch(() => {}); }
    if (o.status === 'active' && exp && exp === addDays(t, 7)) {
      const [inv] = await pq(`select * from sub_invoices where org=$1 and status='unpaid' and (reminded_on is null or reminded_on < $2)`, [o.slug, t]);
      if (inv) { await notifyOrg(o, `تذكير: تجديد اشتراك ${o.name}`, `السلام عليكم،\nينتهي اشتراك ${o.name} في نظام الأملاك بتاريخ ${exp}. فاتورة التجديد ${inv.no} بمبلغ ${inv.total} ريال بانتظار السداد.\nتجنباً لإيقاف الخدمة نأمل السداد قبل ${addDays(exp, o.grace_days)}.`).catch(() => {}); await pq('update sub_invoices set reminded_on=$2 where id=$1', [inv.id, t]); }
    }
    if (o.status === 'active' && o.auto_suspend && exp && addDays(exp, o.grace_days) < t) {
      await pq(`update orgs set status='suspended', notes=notes || ' [إيقاف آلي]' where slug=$1`, [o.slug]); clearOrgCache(o.slug);
      await pq('insert into platform_log (username,action,org,details) values ($1,$2,$3,$4)', ['الفوترة التلقائية', 'إيقاف لعدم السداد', o.slug, `انتهى ${exp} + مهلة ${o.grace_days} يوماً`]);
    }
  }
}
/** مؤشرات الإيرادات */
export async function revenue() {
  const orgs = await pq(`select * from orgs where status='active' and plan <> 'trial'`); let mrr = 0;
  for (const o of orgs) { const p = await priceFor(o); mrr += o.billing_cycle === 'monthly' ? p : p / 12; }
  const [k] = await pq(`select coalesce(sum(total) filter (where status='unpaid'),0)::float unpaid, coalesce(sum(total) filter (where status='unpaid' and due_on < $1),0)::float overdue,
    coalesce(sum(total) filter (where status='paid' and paid_on >= date_trunc('year', $1::date)),0)::float ytd from sub_invoices`, [today()]);
  const months = await pq(`select to_char(paid_on,'YYYY-MM') m, sum(total)::float v from sub_invoices where status='paid' and paid_on > ($1::date - interval '12 months') group by 1 order by 1`, [today()]);
  return { mrr: Math.round(mrr), arr: Math.round(mrr * 12), unpaid: Number(k.unpaid), overdue: Number(k.overdue), ytd: Number(k.ytd), months: months as { m: string; v: number }[] };
}
