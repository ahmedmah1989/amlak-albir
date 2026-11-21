import * as XLSX from 'xlsx';
import { getUser } from '@/lib/auth';
import { loadDB } from '@/lib/data';
import { analyze, ISTATUS, daysBetween } from '@/lib/calc';
import { FREQ, CSTATUS, dateAs, LAND_BASIS_LABEL } from '@/lib/fmt';
import { getSettings } from '@/lib/data';
import { tenantLedger } from '@/lib/statement';
import { grade } from '@/lib/score';
import { journal, vatReport } from '@/lib/accounting';
import { parsePerms, canExport, levelFor } from '@/lib/perms';

export const dynamic = 'force-dynamic';
type R = Record<string, string | number | null>;
let DF = 'dd/MM/yyyy';
const d = (x: string | null | undefined) => (x ? dateAs(x, DF) : '');

export async function GET(req: Request) {
  const me = await getUser();
  if (!me) return new Response('غير مصرح', { status: 401 });
  const pm = parsePerms(me.perms);
  if (!canExport(me.role, pm)) return new Response('ليست لديك صلاحية التصدير', { status: 403 });
  const SCR: Record<string, string> = { properties: 'properties', contracts: 'contracts', tenants: 'tenants', installments: 'installments', arrears: 'reports', unconfirmed: 'reports', renewals: 'reports', payments: 'payments', expenses: 'expenses', audit: 'audit', performance: 'reports', aging: 'reports', bank: 'bank', statement: 'tenants', cashflow: 'reports', tenantscore: 'reports', journal: 'reports', vat: 'reports' };
  const rq = new URL(req.url).searchParams.get('r') ?? '';
  if (levelFor(me.role, pm, SCR[rq] ?? 'reports') < 1) return new Response('ليست لديك صلاحية على هذا التقرير', { status: 403 });
  const url = new URL(req.url); const r = url.searchParams.get('r') ?? '';
  const db = await loadDB(); const a = analyze(db);
  const u = me; try { DF = JSON.parse(u?.prefs || '{}').date_format || (await getSettings()).date_format || DF; } catch {}
  const pn = (id: string | null | undefined) => (id ? a.P.get(id)?.name ?? '' : ''), un = (id: string) => a.U.get(id)?.code ?? '', tn = (id: string) => a.T.get(id)?.name ?? '';
  let name = r, rows: R[] = [];
  if (r === 'properties') { name = 'العقارات'; rows = a.propStats.map((s) => ({ 'العقار': s.p.name, 'النوع': s.p.type, 'الملكية': s.p.ownership, 'الموقع': s.p.location, 'رقم الصك': s.p.deed_no, 'قيمة الأرض': s.p.land_value, 'قيمة المبنى': s.p.building_value, 'القيمة الدفترية': s.bv || null, 'حالة القيمة': s.p.value_status, 'وضع الأرض': LAND_BASIS_LABEL[s.p.land_basis ?? 'owned'], 'مساحة الأرض م²': s.p.land_area, 'مساحة المبنى م²': s.p.building_area, 'آخر تقييم': d(s.lastValDate), 'عدد إعادات التقييم': s.revCount, 'فرق إعادة التقييم': s.revCount ? s.revDiff : null, 'حالة البيانات': s.p.data_status === 'provisional' ? 'مؤقتة — قيد التأكيد' : 'معتمدة', 'الإيجار السنوي': s.rent, 'العائد %': s.yield == null ? null : +s.yield.toFixed(2), 'المتأخرات المؤكدة': s.arrears, 'يحتاج تأكيداً': s.pending, 'أقرب نهاية عقد': d(s.nextEnd), 'عقود سارية': s.contracts })); }
  else if (r === 'contracts') { name = 'العقود'; rows = db.contracts.filter((c) => {
    const f = url.searchParams.get('f') ?? 'all', pid = url.searchParams.get('p');
    return (!pid || c.property_id === pid) && (f === 'all' || (f === 'active' ? c.status === 'active' : f === 'past' ? c.status !== 'active' : f === 'ending' ? c.status === 'active' && daysBetween(a.today, c.end_date) <= 365 : true));
  }).map((c) => ({ 'العقار': pn(c.property_id), 'الوحدة': un(c.unit_id), 'المستأجر': tn(c.tenant_id), 'الاسم التجاري': c.trade_name, 'الاستخدام': c.usage, 'رقم العقد': c.contract_no, 'تاريخ التوقيع': d(c.signed_on), 'البداية': d(c.start_date), 'النهاية': d(c.end_date), 'الإيجار السنوي': c.annual_rent, 'دورية الدفع': FREQ[c.frequency ?? ''] ?? '', 'الضريبة %': c.vat_rate, 'الزيادة السنوية %': c.escalation_pct, 'التأمين': c.deposit, 'حالة التأمين': c.deposit_status, 'رسوم إيجار': c.ejar_fees, 'السعي': c.brokerage, 'الكهرباء والمياه': c.utilities, 'تجديد تلقائي': c.auto_renew ? 'نعم' : 'لا', 'مجموع الأقساط': a.rows.filter((x) => x.contract_id === c.id).reduce((s, x) => s + x.amount, 0), 'المتبقي': a.rows.filter((x) => x.contract_id === c.id).reduce((s, x) => s + x.balance, 0), 'الحالة': CSTATUS[c.status], 'ملاحظات': c.notes })); }
  else if (r === 'statement') { const id = url.searchParams.get('id') ?? ''; const t = a.T.get(id); if (!t) return new Response('مستأجر غير معروف', { status: 404 });
    name = `كشف حساب ${t.name}`; const L = tenantLedger(db, a, id, { from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined, contractId: url.searchParams.get('c') ?? undefined });
    rows = [...(L.from ? [{ 'التاريخ': d(L.from), 'المرجع': 'رصيد سابق', 'البيان': '', 'مدين': null, 'دائن': null, 'الرصيد': L.opening }] : []),
      ...L.lines.map((l) => ({ 'التاريخ': d(l.date), 'المرجع': l.ref, 'البيان': l.desc, 'مدين': l.debit || null, 'دائن': l.credit || null, 'الرصيد': l.balance }))]; }
  else if ((r === 'journal' || r === 'vat') && !db.meta.features.accounting) return new Response('الميزة غير مفعّلة', { status: 403 });
  else if (r === 'journal') { const from = url.searchParams.get('from') ?? a.today.slice(0, 7) + '-01', to = url.searchParams.get('to') ?? a.today; name = 'القيود اليومية';
    rows = journal(db, a, from, to).lines.map((l) => ({ 'التاريخ': d(l.date), 'المرجع': l.ref, 'الحساب': l.account, 'البيان': l.desc, 'المستأجر': l.tenant, 'العقار': l.property, 'مدين': l.debit || null, 'دائن': l.credit || null })); }
  else if (r === 'vat') { const from = url.searchParams.get('from') ?? a.today, to = url.searchParams.get('to') ?? a.today; name = 'ضريبة القيمة المضافة';
    rows = vatReport(a, from, to).rows.map(({ r: x, rate, net, tax }) => ({ 'الاستحقاق': d(x.due_date), 'المستأجر': x.tenantName, 'الرقم الضريبي': a.T.get(x.contract.tenant_id)?.vat_no ?? '', 'العقار': x.propertyName, 'الوحدة': x.unitCode, 'النسبة %': rate, 'الصافي': net, 'الضريبة': tax, 'الإجمالي': x.amount, 'المحصّل': x.amount - x.balance })); }
  else if (r === 'tenantscore') { name = 'تصنيف المستأجرين'; rows = a.tenantStats.filter((x) => x.collRate != null).map((x) => ({ 'المستأجر': x.t.name, 'التصنيف': grade(x.collRate, x.avgDelay, x.maxLate), 'نسبة السداد %': Math.round((x.collRate ?? 0) * 10) / 10, 'متوسط التأخر (يوم)': x.avgDelay, 'أقدم تأخير قائم (يوم)': x.maxLate || null, 'متأخر مؤكد': x.arrears, 'الإيجار السنوي': x.activeContracts.reduce((s, c) => s + c.annual_rent, 0) })); }
  else if (r === 'cashflow') { name = 'التدفق المتوقع'; rows = a.forecast.flatMap((f) => f.rows.map((x) => ({ 'الشهر': f.m, 'الاستحقاق': d(x.due_date), 'العقار': x.propertyName, 'الوحدة': x.unitCode, 'المستأجر': x.tenantName, 'رقم القسط': x.no, 'القيمة': x.amount, 'المتبقي المتوقع تحصيله': x.balance }))); }
  else if (r === 'tenants') { name = 'المستأجرون'; rows = a.tenantStats.filter((s) => {
    const f = url.searchParams.get('f') ?? 'all';
    return f === 'current' ? s.activeContracts.length > 0 || s.arrears > 0 || s.pending > 0 : f === 'arrears' ? s.arrears > 0 : true;
  }).map((s) => ({ 'المستأجر': s.t.name, 'النوع': s.t.tenant_type === 'company' ? 'منشأة' : 'فرد', 'الجوال': s.t.phone, 'جوال إضافي': s.t.phone2, 'البريد': s.t.email, 'الهوية': s.t.national_id, 'انتهاء الهوية': d(s.t.id_expiry), 'الجنسية': s.t.nationality, 'السجل التجاري': s.t.cr_no, 'انتهاء السجل': d(s.t.cr_expiry), 'الرقم الضريبي': s.t.vat_no, 'العنوان الوطني': s.t.address, 'الكفيل': s.t.guarantor_name, 'جوال الكفيل': s.t.guarantor_phone, 'اكتمال البيانات %': s.completeness.pct, 'متوسط التأخر (يوم)': s.avgDelay, 'العقود السارية': s.activeContracts.length, 'الإيجار السنوي': s.activeContracts.reduce((x, c) => x + c.annual_rent, 0), 'متأخر مؤكد': s.arrears, 'يحتاج تأكيداً': s.pending, 'أقدم تأخير (يوم)': s.maxLate || null, 'آخر متابعة': d(s.lastFollow?.date), 'نوع آخر متابعة': s.lastFollow?.type ?? '', 'آخر سداد': d(s.lastPayment?.paid_on) })); }
  else if (r === 'installments' || r === 'arrears' || r === 'unconfirmed') {
    const f = r === 'arrears' ? 'overdue' : r === 'unconfirmed' ? 'unconfirmed' : url.searchParams.get('f') ?? 'all';
    name = r === 'arrears' ? 'المتأخرات' : r === 'unconfirmed' ? 'تحتاج تأكيداً' : 'الأقساط';
    rows = a.rows.filter((x) => (f === 'all' || (f === 'open' ? ['overdue', 'unconfirmed', 'due'].includes(x.status) : x.status === f))
    && (!url.searchParams.get('from') || x.due_date >= url.searchParams.get('from')!) && (!url.searchParams.get('to') || x.due_date <= url.searchParams.get('to')!)).sort((x, y) => x.due_date.localeCompare(y.due_date))
      .map((x) => ({ 'العقار': x.propertyName, 'الوحدة': x.unitCode, 'المستأجر': x.tenantName, 'رقم القسط': x.no, 'الفترة من': d(x.period_from), 'الفترة إلى': d(x.period_to), 'الاستحقاق': d(x.due_date), 'القيمة': x.amount, 'المسدد': x.paidTotal, 'الخصم': x.adjusted, 'المتبقي': x.balance, 'نسبة السداد %': Math.round(x.paidPct), 'عدد الدفعات': x.receipts, 'الحالة': ISTATUS[x.status].label + (x.partial ? ' (جزئي)' : ''), 'أيام التأخير': x.daysLate || null, ...(r === 'unconfirmed' ? { 'وجد في البنك؟': '', 'تاريخ الإيداع': '', 'رقم السند': '' } : {}) })); }
  else if (r === 'valuations') { name = 'سجل التقييمات'; const pid = url.searchParams.get('p'), from = url.searchParams.get('from'), to = url.searchParams.get('to');
    rows = a.propStats.filter((x) => !pid || x.p.id === pid).flatMap((x) => x.vals.map((v, i) => { const t = (v.land_value ?? 0) + (v.building_value ?? 0), pv = i ? (x.vals[i - 1].land_value ?? 0) + (x.vals[i - 1].building_value ?? 0) : null;
      return { v, row: { 'العقار': x.p.name, 'التاريخ': d(v.val_date), 'النوع': v.kind === 'initial' ? 'قيمة افتتاحية' : 'إعادة تقييم', 'قيمة الأرض': v.land_value, 'قيمة المبنى': v.building_value, 'الإجمالي': t,
        'القيمة السابقة': pv, 'الفرق': pv == null ? null : t - pv, 'الأساس': v.basis, 'المقيّم': v.valuer, 'رقم التقرير': v.ref_no, 'رقم القرار': v.decision_no, 'ملاحظات': v.note, 'بواسطة': v.created_by } }; }))
      .filter(({ v }) => (!from || (v.val_date ?? '') >= from) && (!to || (v.val_date ?? '0000') <= to)).map(({ row }) => row); }
  else if (r === 'renewals') { name = 'التجديدات'; rows = a.renewals.map((x) => ({ 'العقار': x.prop.name, 'الوحدة': x.unitCode, 'المستأجر': x.tenantName, 'نهاية العقد': d(x.c.end_date), 'الأيام المتبقية': x.days, 'الإيجار السنوي': x.c.annual_rent, 'بدء التفاوض': d(x.negotiate), 'متأخر مؤكد': x.arrears, 'يحتاج تأكيداً': x.pending })); }
  else if (r === 'payments') { name = 'المقبوضات'; const from = url.searchParams.get('from'), to = url.searchParams.get('to'), pid = url.searchParams.get('p'), state = url.searchParams.get('state');
    const receiptState = (p: typeof db.payments[number]) => p.voided ? 'voided' : p.bank_line_id ? 'matched' : db.attachments.some((x) => x.entity === 'payment' && x.entity_id === p.id) || p.method === 'نقدي' ? 'documented' : 'missing';
    rows = db.payments.filter((p) => (url.searchParams.get('v') === '1' || !p.voided) && (!from || p.paid_on >= from) && (!to || p.paid_on <= to)
      && (!pid || (p.contract_id && a.C.get(p.contract_id)?.property_id === pid)) && (!state || receiptState(p) === state)).map((p) => { const c = p.contract_id ? a.C.get(p.contract_id) : undefined;
      return { 'رقم السند': p.receipt_no, 'التاريخ': d(p.paid_on), 'المستأجر': tn(p.tenant_id), 'العقار': pn(c?.property_id), 'الوحدة': c ? un(c.unit_id) : '', 'المبلغ': p.amount, 'الطريقة': p.method, 'المرجع': p.bank_ref, 'سجّله': p.created_by, 'ملاحظات': p.note, 'الحالة': p.voided ? 'ملغى' : p.bank_line_id ? 'مطابق' : receiptState(p) === 'documented' ? 'موثق' : 'بلا مرفق' }; }); }
  else if (r === 'expenses') { name = 'المصروفات'; rows = db.expenses.filter(e => (!url.searchParams.get('p') || e.property_id === url.searchParams.get('p')) && (!url.searchParams.get('y') || url.searchParams.get('y') === 'all' || e.date.startsWith(url.searchParams.get('y')!))).map((e) => ({ 'التاريخ': d(e.date), 'العقار': pn(e.property_id), 'البند': e.category, 'المبلغ': e.amount, 'المورد': e.vendor, 'المرجع': e.ref, 'الوصف': e.description })); }
  else if (r === 'audit') { name = 'ملاحظات التدقيق'; rows = db.notes.map((n) => ({ 'النوع': n.category, 'العقار': pn(n.property_id), 'المستأجر': n.tenant_name, 'الوحدة': n.unit, 'المبلغ': n.amount, 'المرجع': n.ref, 'التاريخ': d(n.ref_date), 'المصدر': n.source, 'المطلوب': n.details, 'الحالة': n.status === 'open' ? 'مفتوحة' : 'مغلقة', 'الإجراء': n.resolution })); }
  else if (r === 'performance') { const y = url.searchParams.get('y') ?? a.year; name = `أداء العقارات ${y}`;
    rows = a.propStats.map((s) => { const due = a.rows.filter((x) => x.contract.property_id === s.p.id && x.due_date.startsWith(y)); const dueAmt = due.reduce((x, z) => x + z.amount, 0), coll = due.reduce((x, z) => x + z.paidTotal, 0);
      const exp = db.expenses.filter((e) => e.property_id === s.p.id && e.date.startsWith(y)).reduce((x, e) => x + e.amount, 0);
      return { 'العقار': s.p.name, 'القيمة الدفترية': s.bv || null, 'الإيجار السنوي': s.rent, 'المستحق': dueAmt, 'المحصل': coll, 'غير المسدد': dueAmt - coll, 'المصروفات': exp, 'صافي الدخل': coll - exp, 'العائد الصافي %': s.bv ? +(((coll - exp) / s.bv) * 100).toFixed(2) : null }; }); }
  else if (r === 'aging') { name = 'أعمار الديون'; const B: [string, number, number][] = [['1-30', 1, 30], ['31-90', 31, 90], ['91-180', 91, 180], ['181-365', 181, 365], ['+365', 366, 1e9]];
    rows = a.tenantStats.filter((t) => t.arrears > 0).map((t) => ({ 'المستأجر': t.t.name, ...Object.fromEntries(B.map(([l, lo, hi]) => [l, t.rows.filter((x) => x.status === 'overdue' && x.daysLate >= lo && x.daysLate <= hi).reduce((s, x) => s + x.balance, 0)])), 'الإجمالي': t.arrears })); }
  else if (r === 'bank') { name = 'إيداعات البنك'; rows = db.bankLines.filter(l => !url.searchParams.get('s') || url.searchParams.get('s') === 'all' || l.status === url.searchParams.get('s')).map((l) => { const p = l.payment_id ? db.payments.find((x) => x.id === l.payment_id) : undefined; return { 'التاريخ': d(l.date), 'المبلغ': l.amount, 'الوصف': l.description, 'المرجع': l.ref, 'الحالة': { open: 'مفتوح', matched: 'مطابق', ignored: 'مستبعد' }[l.status], 'السند': p?.receipt_no ?? '', 'المستأجر': p ? tn(p.tenant_id) : '', 'ملاحظة': l.note }; }); }
  else return new Response('تقرير غير معروف', { status: 400 });

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'لا توجد بيانات': '' }]);
  const cols = Object.keys(rows[0] ?? { x: 1 });
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(c.length + 2, ...rows.slice(0, 200).map((x) => String(x[c] ?? '').length + 2)) }));
  ws['!autofilter'] = { ref: ws['!ref']! };
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
  const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(',', '');
  const filt = [...url.searchParams.entries()].filter(([k]) => k !== 'r').map(([k, v]) => `${k}=${v}`).join(' • ');
  const info = XLSX.utils.aoa_to_sheet([['الجهة', db.meta.org], ['التقرير', name], ['تاريخ البيانات', d(a.today)], ['تاريخ الاستخراج', now], ['استُخرج بواسطة', me.full_name], ['النطاق', filt || 'الكل'], ['عدد الصفوف', rows.length]]);
  info['!cols'] = [{ wch: 18 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, info, 'بيانات التقرير');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fn = `${name}-${a.today}.xlsx`;
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fn)}` } });
}
