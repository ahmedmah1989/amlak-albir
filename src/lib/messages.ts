import { money, date } from './fmt';
/** رقم جوال سعودي بصيغة واتساب الدولية */
export function waPhone(p: string | null | undefined) {
  const d = (p ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00966')) return d.slice(2);
  if (d.startsWith('966') && d.length === 12) return d;
  if (d.startsWith('05') && d.length === 10) return '966' + d.slice(1);
  if (d.startsWith('5') && d.length === 9) return '966' + d;
  return d.length >= 11 ? d : null;
}
export const waLink = (phone: string | null | undefined, text: string) => { const p = waPhone(phone); return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null; };
export function waTemplates(o: { org: string; name: string; trade?: string | null; arrears: number; overdueCount: number; next?: { amount: number; due: string } | null }) {
  const who = o.trade ? `${o.name} (${o.trade})` : o.name;
  const out: { key: string; label: string; text: string }[] = [];
  if (o.next) out.push({ key: 'remind', label: 'تذكير بقسط قادم', text: `السلام عليكم ${who}،\nنذكّركم بموعد استحقاق قسط الإيجار بمبلغ ${money(o.next.amount)} ريال بتاريخ ${date(o.next.due)}.\nنأمل السداد في موعده، وشاكرين تعاونكم.\n${o.org}` });
  if (o.arrears > 0) {
    out.push({ key: 'claim', label: 'مطالبة بالمتأخرات', text: `السلام عليكم ${who}،\nنفيدكم بوجود مبالغ متأخرة على عقد الإيجار بإجمالي ${money(o.arrears)} ريال (${o.overdueCount} أقساط).\nنأمل المبادرة بالسداد خلال 7 أيام وإرسال إشعار التحويل.\n${o.org}` });
    out.push({ key: 'warn', label: 'إنذار قبل الإجراء النظامي', text: `السلام عليكم ${who}،\nرغم التذكير السابق ما زال على عقدكم مبلغ ${money(o.arrears)} ريال متأخر السداد.\nنأمل السداد خلال 15 يوماً من تاريخه، وإلا ستضطر الجمعية لاتخاذ الإجراءات النظامية وفق العقد ومنصة إيجار.\n${o.org}` });
  }
  return out;
}
