import 'server-only';
/** خط زمني موحد للعقد أو المستأجر: كل الأحداث من كل الجداول في قائمة واحدة مرتبة */
import { q } from './db';
import type { DB } from './types';
import type { Analysis } from './calc';
import { money } from './fmt';
export type TEvent = { d: string; k: string; t: string; s?: string; href?: string; tone: 'ok' | 'bad' | 'warn' | 'info' | 'mute' };
export const TKIND: Record<string, string> = { contract: 'العقد', payment: 'سند قبض', due: 'استحقاق', follow: 'متابعة', notify: 'تذكير', maint: 'صيانة', doc: 'مستند', adj: 'خصم/تسوية', voucher: 'سند صرف' };
export async function timeline(db: DB, a: Analysis, o: { contractId?: string; tenantId?: string }): Promise<TEvent[]> {
  const cs = db.contracts.filter((c) => (o.contractId ? c.id === o.contractId : c.tenant_id === o.tenantId));
  const cid = new Set(cs.map((c) => c.id)), tid = o.tenantId ?? cs[0]?.tenant_id;
  const label = (cId: string | null) => { const c = cId ? db.contracts.find((x) => x.id === cId) : null; return c && !o.contractId ? ` • ${a.P.get(c.property_id)?.short ?? ''} ${a.U.get(c.unit_id)?.code ?? ''}` : ''; };
  const ev: TEvent[] = [];
  for (const c of cs) {
    const where = o.contractId ? '' : ` • ${a.P.get(c.property_id)?.short} — ${a.U.get(c.unit_id)?.code}`;
    ev.push({ d: c.signed_on ?? c.start_date, k: 'contract', t: (c.renewed_from ? 'تجديد العقد' : 'بداية العقد') + where, s: `${money(c.annual_rent)} ريال سنوياً حتى ${c.end_date.split('-').reverse().join('/')}`, href: `/contracts/${c.id}`, tone: 'info' });
    if (c.vacated_on) ev.push({ d: c.vacated_on, k: 'contract', t: 'إخلاء الوحدة' + where, s: c.deposit_refund != null ? `رد التأمين ${money(c.deposit_refund)}` : undefined, href: `/contracts/${c.id}/handover`, tone: 'mute' });
    else if (c.end_date <= a.today && c.status !== 'active') ev.push({ d: c.end_date, k: 'contract', t: 'انتهاء العقد' + where, tone: 'mute' });
  }
  for (const r of a.rows.filter((r) => cid.has(r.contract_id) && r.due_date <= a.today))
    ev.push({ d: r.due_date, k: 'due', t: `استحقاق قسط ${money(r.amount)}${label(r.contract_id)}`, s: r.status === 'paid' ? 'مسدد' : r.status === 'overdue' ? `متأخر ${r.daysLate} يوماً — المتبقي ${money(r.balance)}` : r.status === 'unconfirmed' ? 'يحتاج تأكيد' : `المتبقي ${money(r.balance)}`, href: `/installments/${r.id}`, tone: r.status === 'paid' ? 'ok' : r.status === 'overdue' ? 'bad' : 'warn' });
  for (const p of a.payments.filter((p) => (p.contract_id && cid.has(p.contract_id)) || (!o.contractId && p.tenant_id === tid)))
    ev.push({ d: p.paid_on, k: 'payment', t: `سند قبض ${p.receipt_no} بمبلغ ${money(p.amount)}${label(p.contract_id)}`, s: p.method, href: `/payments/${p.id}`, tone: 'ok' });
  if (tid) for (const f of db.followups.filter((f) => f.tenant_id === tid)) ev.push({ d: f.date, k: 'follow', t: `متابعة: ${f.type}`, s: f.details ?? undefined, href: `/tenants/${tid}?tab=followups`, tone: 'info' });
  for (const x of db.adjustments.filter((x) => (x.contract_id && cid.has(x.contract_id)) || (!o.contractId && x.tenant_id === tid))) ev.push({ d: String((x as any).created_at ?? a.today).slice(0, 10), k: 'adj', t: `${(x as any).type ?? 'خصم'} ${money(x.amount)}`, s: (x as any).reason ?? undefined, tone: 'warn' });
  for (const m of db.maintenance.filter((m) => cs.some((c) => c.unit_id === m.unit_id))) ev.push({ d: m.opened_on, k: 'maint', t: `طلب صيانة: ${m.title}`, s: m.status === 'done' ? `أُغلق${m.cost ? ` بتكلفة ${money(m.cost)}` : ''}` : 'مفتوح', href: `/maintenance/${m.id}`, tone: m.status === 'done' ? 'mute' : 'warn' });
  for (const d of db.attachments.filter((d) => (d.entity === 'contract' && cid.has(d.entity_id)) || (d.entity === 'tenant' && d.entity_id === tid))) ev.push({ d: String(d.created_at).slice(0, 10), k: 'doc', t: `مستند: ${d.file_name}`, s: d.category ?? undefined, href: `/api/files/${d.id}`, tone: 'mute' });
  try {
    const nq = await q(`select scheduled_on, channel, status, kind from notify_queue where status='sent' and (tenant_id=$1 ${o.contractId ? 'or entity_id=$2' : ''}) order by scheduled_on desc limit 50`, o.contractId ? [tid, o.contractId] : [tid]);
    const CH: Record<string, string> = { sms: 'رسالة نصية', whatsapp: 'واتساب', email: 'بريد' };
    for (const n of nq) ev.push({ d: String(n.scheduled_on), k: 'notify', t: `تذكير ${CH[n.channel] ?? n.channel}`, s: n.kind === 'overdue' ? 'مطالبة بالمتأخرات' : n.kind === 'due_soon' ? 'قبل الاستحقاق' : 'قرب انتهاء العقد', tone: 'info' });
  } catch {}
  return ev.sort((x, y) => y.d.localeCompare(x.d));
}
