import * as XLSX from 'xlsx';
/** يقرأ ملف إكسل أو CSV إلى صفوف (مصفوفات نصوص). */
export function readSheet(buf: ArrayBuffer): string[][] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', dateNF: 'yyyy-mm-dd' }) as any[][]).map((r) => r.map((c) => String(c ?? '').trim()));
}
/** يحوّل نص تاريخ بأي صيغة شائعة إلى yyyy-mm-dd. */
export function toISO(s: string): string | null {
  s = (s || '').trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/); if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
export const toNum = (s: string) => { const x = Number(String(s ?? '').replace(/[,\s٬]|ر\.?س|SAR/gi, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))); return Number.isFinite(x) ? x : NaN; };

// ---- ملف منصة إيجار ----
const EJ: Record<string, string[]> = {
  installment_no: ['installment number', 'رقم القسط'], issue_date: ['issue date', 'تاريخ الإصدار'], invoice_no: ['invoice number', 'رقم الفاتورة'],
  due_date: ['last date for due payment', 'آخر موعد', 'تاريخ الاستحقاق'], amount: ['total amount', 'المبلغ'], status: ['status', 'الحالة'],
  contract_no: ['contract number', 'رقم العقد'], contract_type: ['contract type', 'نوع العقد'], ejar_property_id: ['property id', 'رقم العقار'],
  state: ['state', 'حالة العقد'], start_date: ['contract start date', 'بداية العقد'], end_date: ['contract end date', 'نهاية العقد'], version: ['version', 'الإصدار'], broker: ['brokerage office name', 'مكتب الوساطة'],
};
export function parseEjar(rows: string[][]) {
  const hi = rows.findIndex((r) => r.some((c) => /installment number|رقم القسط/i.test(c))); if (hi < 0) throw new Error('لم يُعثر على عناوين أعمدة ملف إيجار (Installment Number)');
  const head = rows[hi].map((h) => h.toLowerCase()); const col: Record<string, number> = {};
  for (const [k, keys] of Object.entries(EJ)) { const i = head.findIndex((h) => keys.some((x) => h.includes(x.toLowerCase()) && !(k === 'state' && h.includes('status')) && !(k === 'contract_no' && h.includes('type')))); if (i >= 0) col[k] = i; }
  if (k_missing(col, ['installment_no', 'amount', 'contract_no'])) throw new Error('أعمدة أساسية غير موجودة: رقم القسط أو المبلغ أو رقم العقد');
  return { mapping: Object.fromEntries(Object.entries(col).map(([k, i]) => [k, rows[hi][i]])), items: rows.slice(hi + 1).filter((r) => r[col.installment_no]).map((r) => {
    const g = (k: string) => (col[k] !== undefined ? r[col[k]] : '');
    return { installment_no: g('installment_no'), issue_date: toISO(g('issue_date')), invoice_no: g('invoice_no') || null, due_date: toISO(g('due_date')), amount: toNum(g('amount')),
      status: g('status') || null, contract_no: g('contract_no'), contract_type: g('contract_type') || null, ejar_property_id: g('ejar_property_id') || null, state: g('state') || null,
      start_date: toISO(g('start_date')), end_date: toISO(g('end_date')), version: g('version') || null, broker: g('broker') || null };
  }) };
}
const k_missing = (c: Record<string, number>, ks: string[]) => ks.some((k) => c[k] === undefined);

// ---- كشف البنك ----
export interface BankMap { header: number; date: number; credit: number; debit: number; amount: number; desc: number; ref: number }
const BK: Record<string, string[]> = {
  date: ['تاريخ العملية', 'التاريخ', 'تاريخ', 'date', 'value date', 'transaction date'], credit: ['دائن', 'إيداع', 'ايداع', 'credit', 'deposit'], debit: ['مدين', 'سحب', 'debit', 'withdrawal'],
  amount: ['المبلغ', 'amount'], desc: ['البيان', 'الوصف', 'التفاصيل', 'description', 'details', 'narrative', 'remarks'], ref: ['المرجع', 'رقم المرجع', 'reference', 'ref'],
};
export function guessBank(rows: string[][]): BankMap {
  let best = { i: 0, score: -1 };
  rows.slice(0, 25).forEach((r, i) => { const sc = Object.values(BK).filter((ks) => r.some((c) => ks.some((k) => c.toLowerCase().includes(k)))).length; if (sc > best.score) best = { i, score: sc }; });
  const h = rows[best.i].map((c) => c.toLowerCase());
  const f = (k: string) => h.findIndex((c) => BK[k].some((x) => c.includes(x)));
  return { header: best.i, date: f('date'), credit: f('credit'), debit: f('debit'), amount: f('credit') >= 0 ? -1 : f('amount'), desc: f('desc'), ref: f('ref') };
}
export function bankLines(rows: string[][], m: BankMap) {
  return rows.slice(m.header + 1).map((r) => {
    const date = m.date >= 0 ? toISO(r[m.date]) : null;
    let amt = m.credit >= 0 ? toNum(r[m.credit]) : m.amount >= 0 ? toNum(r[m.amount]) : NaN;
    if (m.credit < 0 && m.debit >= 0 && toNum(r[m.debit]) > 0) amt = -toNum(r[m.debit]);
    return { date, amount: amt, description: m.desc >= 0 ? r[m.desc] : '', ref: m.ref >= 0 ? r[m.ref] : '' };
  }).filter((l) => l.date && Number.isFinite(l.amount) && l.amount > 0);
}
