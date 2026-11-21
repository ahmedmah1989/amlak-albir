import type { DB, Contract } from './types';
import { daysBetween } from './calc';
/** متطلبات المستندات غير المستوفاة لعقد */
export function missingDocs(db: DB, c: Contract, required: string[]) {
  const out: { scope: string; label: string; href: string }[] = [];
  for (const line of required) {
    const [scope, cats] = line.split(':'); if (!cats) continue;
    const list = cats.split('|').map((x) => x.trim()).filter(Boolean);
    const id = scope === 'tenant' ? c.tenant_id : scope === 'unit' ? c.unit_id : c.id;
    const ok = db.attachments.some((x) => x.entity === scope && x.entity_id === id && list.includes(x.category ?? ''));
    if (!ok) out.push({ scope, label: list.join(' أو '), href: scope === 'tenant' ? `/tenants/${c.tenant_id}#tab=documents` : scope === 'unit' ? `/units/${c.unit_id}#tab=documents` : `/contracts/${c.id}#tab=documents` });
  }
  return out;
}
/** مستندات وهويات تنتهي خلال المدة أو انتهت */
export function expiringDocs(db: DB, today: string, within = 60) {
  const T = new Map(db.tenants.map((t) => [t.id, t]));
  const activeTenants = new Set(db.contracts.filter((c) => c.status === 'active').map((c) => c.tenant_id));
  const out: { key: string; title: string; what: string; date: string; days: number; href: string }[] = [];
  for (const t of db.tenants) {
    if (!activeTenants.has(t.id)) continue;
    for (const [k, lbl, d] of [['id', 'الهوية', t.id_expiry], ['cr', 'السجل التجاري', t.cr_expiry]] as const)
      if (d && daysBetween(today, d) <= within) out.push({ key: `${k}:${t.id}`, title: t.name, what: lbl, date: d, days: daysBetween(today, d), href: `/tenants/${t.id}` });
  }
  for (const x of db.attachments) if (x.expires_on && daysBetween(today, x.expires_on) <= within) {
    const href = x.entity === 'tenant' ? `/tenants/${x.entity_id}#tab=documents` : x.entity === 'contract' ? `/contracts/${x.entity_id}#tab=documents` : x.entity === 'unit' ? `/units/${x.entity_id}#tab=documents` : x.entity === 'property' ? `/properties/${x.entity_id}` : '/documents';
    out.push({ key: `att:${x.id}`, title: x.entity === 'tenant' ? T.get(x.entity_id)?.name ?? x.file_name : x.file_name, what: x.category ?? 'مستند', date: x.expires_on, days: daysBetween(today, x.expires_on), href });
  }
  return out.sort((a, b) => a.days - b.days);
}
