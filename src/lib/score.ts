/** تصنيف المستأجر: A منتظم • B تأخر بسيط • C متأخر • D متعثر */
export function grade(rate: number | null, delay: number | null, maxLate: number) {
  if (rate == null) return '—';
  if (rate >= 98 && (delay ?? 0) <= 15 && maxLate === 0) return 'A';
  if (rate >= 90 && (delay ?? 0) <= 45 && maxLate <= 60) return 'B';
  if (rate >= 75 && maxLate <= 180) return 'C';
  return 'D';
}
