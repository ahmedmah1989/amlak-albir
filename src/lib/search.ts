import type { DB } from './types';
import type { Analysis } from './calc';
import { normalizeSearch } from './table-view';

export type SearchHit = { id: string; kind: string; label: string; description: string; href: string; search: string };
export const SEARCH_TYPES: Record<string, string> = { tenant: 'مستأجر', contract: 'عقد', property: 'عقار', unit: 'وحدة', payment: 'سند قبض' };

export function searchRecords(db: DB, a: Analysis, query: string, kind = 'all'): SearchHit[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  const add = (type: string, id: string, label: string, description: string, href: string, extra = '') => {
    const search = [label, description, extra].join(' ');
    if ((kind === 'all' || kind === type) && terms.every((term) => normalizeSearch(search).includes(term))) hits.push({ id: type + ':' + id, kind: type, label, description, href, search });
  };
  for (const t of db.tenants) add('tenant', t.id, t.name, t.phone ? `جوال ${t.phone}` : 'بيانات المستأجر وعقوده', `/tenants/${encodeURIComponent(t.id)}`);
  for (const p of db.properties) add('property', p.id, p.name, [p.short, p.location, p.type].filter(Boolean).join(' • '), `/properties/${encodeURIComponent(p.id)}`);
  for (const c of db.contracts) add('contract', c.id, c.contract_no || 'عقد بلا رقم', [a.T.get(c.tenant_id)?.name, a.P.get(c.property_id)?.short, a.U.get(c.unit_id)?.code, c.trade_name].filter(Boolean).join(' • '), `/contracts/${encodeURIComponent(c.id)}`);
  for (const u of db.units) add('unit', u.id, u.code, [a.P.get(u.property_id)?.name, u.unit_type, u.occupant].filter(Boolean).join(' • '), `/properties/${encodeURIComponent(u.property_id)}#tab=units`);
  for (const p of db.payments) {
    const c = p.contract_id ? a.C.get(p.contract_id) : undefined;
    add('payment', p.id, p.receipt_no, [a.T.get(p.tenant_id)?.name, c && a.P.get(c.property_id)?.short, c && a.U.get(c.unit_id)?.code, p.paid_on, p.voided ? 'ملغى' : p.method].filter(Boolean).join(' • '), `/payments/${encodeURIComponent(p.id)}`, p.bank_ref ?? '');
  }
  return hits;
}
