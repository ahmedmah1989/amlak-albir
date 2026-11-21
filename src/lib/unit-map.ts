import { daysBetween } from './calc';
import type { DB } from './types';
import type { Analysis } from './calc';
export type UState = 'ok' | 'arrears' | 'ending' | 'expired' | 'vacant';
export const USTATE: Record<UState, string> = { ok: 'مؤجرة ومنتظمة', arrears: 'عليها متأخرات', ending: 'تنتهي خلال 90 يوماً', expired: 'انتهت مدة العقد', vacant: 'شاغرة' };
/** حالة كل وحدة إيجارية لخريطة الإشغال */
export function unitStates(db: DB, a: Analysis, propertyId?: string) {
  return db.units.filter((u) => u.kind === 'lease' && (!propertyId || u.property_id === propertyId)).map((u) => {
    const cur = db.contracts.find((c) => c.unit_id === u.id && c.status === 'active') ?? null;
    const arrears = cur ? a.rows.filter((r) => r.contract_id === cur.id && r.status === 'overdue').reduce((n, r) => n + r.balance, 0) : 0;
    const left = cur ? daysBetween(a.today, cur.end_date) : null;
    const st: UState = !cur ? 'vacant' : arrears > 0 ? 'arrears' : left! < 0 ? 'expired' : left! <= 90 ? 'ending' : 'ok';
    return { u, cur, st, arrears, left, tenant: cur ? a.T.get(cur.tenant_id)?.name ?? '' : '', prop: a.P.get(u.property_id)! };
  });
}
