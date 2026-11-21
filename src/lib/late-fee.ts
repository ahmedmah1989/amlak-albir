import type { FeatureCfg } from './features';
/** غرامة التأخير المقترحة: نسبة شهرية من الرصيد بعد مهلة، بحد أقصى نسبة من الرصيد */
export function lateFeeFor(r: { status: string; daysLate: number; balance: number; kind?: string }, cfg: FeatureCfg, _today?: string) {
  if (r.status !== 'overdue' || (r.kind && r.kind !== 'rent') || r.balance <= 0) return { amount: 0, months: 0 };
  const over = r.daysLate - cfg.late_fee_after;
  if (over <= 0) return { amount: 0, months: 0 };
  const months = Math.ceil(over / 30);
  const raw = (r.balance * cfg.late_fee_pct / 100) * months, cap = r.balance * cfg.late_fee_cap_pct / 100;
  return { amount: Math.round(Math.min(raw, cap) * 100) / 100, months };
}
