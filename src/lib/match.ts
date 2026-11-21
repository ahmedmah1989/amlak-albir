import type { DB, BankLine } from './types';
import type { Analysis, IRow } from './calc';
import { daysBetween } from './calc';

export interface Cand { kind: 'payment' | 'inst'; score: number; label: string; sub: string; ids: string[]; tenant_id: string; contract_id: string | null; amount: number; ejar: string | null }
const norm = (s: string) => s.replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\u0600-\u06FFa-z0-9 ]/gi, ' ').toLowerCase();

/** يقترح لكل إيداع بنكي ما يقابله: سند مسجل غير مطابق، أو قسط/أقساط مفتوحة بنفس المبلغ. */
export function suggest(db: DB, a: Analysis, l: BankLine): Cand[] {
  const out: Cand[] = []; const desc = norm(`${l.description ?? ''} ${l.ref ?? ''}`);
  const nameHit = (tid: string) => { const n = norm(a.T.get(tid)?.name ?? '').split(' ').filter((w) => w.length > 2); return n.filter((w) => desc.includes(w)).length; };
  const noHit = (cid: string | null) => { const c = cid ? a.C.get(cid) : undefined; return c?.contract_no && desc.replace(/\s/g, '').includes(c.contract_no.replace(/\D/g, '').slice(0, 8)) ? 1 : 0; };
  const ejarOf = (r: IRow) => { const e = db.ejar.find((x) => x.installment_id === r.id); return e ? `إيجار: ${e.status ?? ''}` : null; };
  for (const p of a.payments.filter((p) => !p.bank_line_id)) {
    const dd = Math.abs(daysBetween(p.paid_on, l.date)); if (Math.abs(p.amount - l.amount) > 0.5 || dd > 12) continue;
    out.push({ kind: 'payment', score: 60 + (12 - dd) * 2 + nameHit(p.tenant_id) * 10, label: `سند ${p.receipt_no} — ${a.T.get(p.tenant_id)?.name}`, sub: `مسجل ${p.paid_on.split('-').reverse().join('/')} • ${p.method}`, ids: [p.id], tenant_id: p.tenant_id, contract_id: p.contract_id, amount: p.amount, ejar: null });
  }
  const open = a.rows.filter((r) => r.balance > 0 && r.contract.status !== 'renewed');
  const byC = new Map<string, IRow[]>(); open.forEach((r) => byC.set(r.contract_id, [...(byC.get(r.contract_id) ?? []), r]));
  for (const [cid, rs] of byC) {
    rs.sort((x, y) => x.due_date.localeCompare(y.due_date));
    for (let i = 0; i < rs.length; i++) {
      let sum = 0;
      for (let j = i; j < Math.min(rs.length, i + 6); j++) {
        sum += rs[j].balance; if (sum > l.amount + 0.5) break;
        if (Math.abs(sum - l.amount) <= 0.5) {
          const set = rs.slice(i, j + 1), last = set[set.length - 1];
          const dd = daysBetween(set[0].due_date, l.date); if (dd < -45) break;
          const sc = 30 + nameHit(set[0].contract.tenant_id) * 15 + noHit(cid) * 25 + (set.length === 1 ? 10 : 0) + (dd >= -5 && dd <= 40 ? 15 : 0) + (set[0].status === 'unconfirmed' ? 5 : 0);
          out.push({ kind: 'inst', score: sc, label: `${set[0].tenantName} — ${set[0].propertyShort} / ${set[0].unitCode}`, sub: set.length === 1 ? `قسط ${set[0].no} يستحق ${set[0].due_date.split('-').reverse().join('/')}` : `${set.length} أقساط من ${set[0].due_date.split('-').reverse().join('/')} إلى ${last.due_date.split('-').reverse().join('/')}`, ids: set.map((x) => x.id), tenant_id: set[0].contract.tenant_id, contract_id: cid, amount: sum, ejar: ejarOf(set[0]) });
        }
      }
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 6);
}
export const confidence = (s: number) => (s >= 70 ? 'ok' : s >= 45 ? 'maybe' : 'low');
