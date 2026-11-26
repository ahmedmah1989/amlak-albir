// حالة سداد قسط إيجار بثلاث قيم: مدفوع / غير مدفوع صراحة / غير محدد.
// ملف المنصة يُخزَّن بنصه الأصلي؛ لا يُعاد تصنيف أي قيمة غير معروفة.
export type EjarPaid = 'paid' | 'unpaid' | 'unknown';
const PAID = ['تم الدفع', 'مدفوع', 'paid'];
const UNPAID = ['غير مدفوع', 'لم يتم الدفع', 'unpaid'];
export function ejarPaidState(status: string | null | undefined): EjarPaid {
  const s = (status ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (PAID.some((x) => x.toLowerCase() === s)) return 'paid';
  if (UNPAID.some((x) => x.toLowerCase() === s)) return 'unpaid';
  return 'unknown';
}
