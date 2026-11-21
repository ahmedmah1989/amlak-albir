import 'server-only';
import * as XLSX from 'xlsx';
import { normalizeSearch } from './table-view';
import { buildSchedule, addDays } from './calc';
import type { DB, Frequency } from './types';

/** معالج الاستيراد: يقرأ النموذج الموحد أو ملف متابعة الإيجارات الحالي، ويبني خطة (جديد / تعديل / مطابق / خطأ) مع مقارنة قبل وبعد لكل حقل */
export type Entity = 'property' | 'unit' | 'tenant' | 'contract' | 'installment';
export type Diff = { field: string; label: string; old: unknown; next: unknown };
export type PlanRow = { entity: Entity; key: string; status: 'new' | 'update' | 'same' | 'error'; data: Record<string, any>; existingId?: string; diffs: Diff[]; errors: string[]; source: string };
export type Plan = { kind: 'template' | 'legacy'; rows: PlanRow[]; warnings: string[] };

export const ENTITY_LABEL: Record<Entity, string> = { property: 'العقارات', unit: 'الوحدات', tenant: 'المستأجرون', contract: 'العقود', installment: 'الأقساط' };
const FREQ_AR: Record<string, Frequency> = { 'شهري': 'monthly', 'ربع سنوي': 'quarterly', 'ربعي': 'quarterly', 'نصف سنوي': 'semiannual', 'سنوي': 'annual' };
const STATUS_AR: Record<string, string> = { 'ساري': 'active', 'نشط': 'active', 'منتهي': 'expired', 'مفسوخ': 'terminated', 'منتهي بالفسخ': 'terminated' };
const BASIS_AR: Record<string, string> = { 'مملوكة': 'owned', 'أرض ومبنى': 'owned', 'وقف': 'owned', 'مستأجرة': 'leased', 'أرض مستأجرة': 'leased', 'أرض فضاء': 'land_only' };
export const LABELS: Record<string, string> = {
  name: 'الاسم', short: 'الاسم المختصر', type: 'النوع', ownership: 'الملكية', location: 'الموقع', land_basis: 'وضع الأرض', land_value: 'قيمة الأرض', building_value: 'قيمة المبنى', deed_no: 'رقم الصك',
  code: 'الوحدة', unit_type: 'نوع الوحدة', floor: 'الدور', rooms: 'الغرف', area: 'المساحة', monthly_rent: 'الإيجار الشهري', tenant_type: 'نوع المستأجر', phone: 'الجوال', national_id: 'الهوية', cr_no: 'السجل التجاري',
  vat_no: 'الرقم الضريبي', contact_person: 'مسؤول التواصل', contract_no: 'رقم العقد', start_date: 'البداية', end_date: 'النهاية', annual_rent: 'الإيجار السنوي', frequency: 'الدورية', status: 'الحالة', trade_name: 'الاسم التجاري',
  no: 'رقم القسط', due_date: 'الاستحقاق', period_from: 'من', period_to: 'إلى', amount: 'المبلغ', opening_paid: 'المسدد', note: 'ملاحظة', src_receipt: 'سند القبض',
};
const UPDATABLE: Record<Entity, string[]> = {
  property: ['type', 'ownership', 'location', 'land_basis', 'deed_no'], unit: ['unit_type', 'floor', 'rooms', 'area', 'monthly_rent'], tenant: ['tenant_type', 'phone', 'national_id', 'cr_no', 'vat_no', 'contact_person'],
  contract: ['contract_no', 'end_date', 'annual_rent', 'frequency', 'status', 'trade_name'], installment: ['amount', 'opening_paid', 'note', 'src_receipt'],
};
const N = (v: unknown) => normalizeSearch(String(v ?? '')).replace(/\s+/g, ' ').trim();
const str = (v: unknown) => { if (v == null) return null; const s = String(v).trim(); return s === '' || s === '-' || s === '—' ? null : s; };
const num = (v: unknown) => { if (v == null || v === '') return null; if (typeof v === 'number') return v; const x = Number(String(v).replace(/[,٬\s]/g, '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))); return Number.isFinite(x) ? x : null; };

// ---------- التواريخ (ميلادي، هجري أم القرى، أرقام إكسل) ----------
const HF = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
function hijriParts(d: Date) { const p = Object.fromEntries(HF.formatToParts(d).map((x) => [x.type, x.value])); return [Number(p.year), Number(p.month), Number(p.day)]; }
export function hijriToIso(y: number, m: number, d: number): string | null {
  const approx = Date.UTC(622, 6, 16) + ((y - 1) * 354.36707 + (m - 1) * 29.530588 + (d - 1)) * 864e5;
  for (const dd of [d, 29, 28]) for (let k = -45; k <= 45; k++) { const t = new Date(approx + k * 864e5); const [hy, hm, hd] = hijriParts(t); if (hy === y && hm === m && hd === dd) return t.toISOString().slice(0, 10); }
  return null;
}
export function parseDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  // تواريخ إكسل تصل أحياناً قبل منتصف الليل بثوانٍ (فروق التوقيت)؛ نضيف 12 ساعة ونأخذ اليوم
  if (v instanceof Date && !isNaN(+v)) return new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
  const s = String(v).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  const first = s.split(/[:：]| إلى /)[0]; const nums = (first.match(/\d+/g) ?? []).map(Number); if (nums.length < 3) return null;
  let [a, b, c] = nums; let y: number, m: number, d: number;
  if (a > 1000) [y, m, d] = [a, b, c]; else [d, m, y] = [a, b, c];
  if (m > 12 && d <= 12) [d, m] = [m, d];
  if (y < 1600) return hijriToIso(y, m, d); // هجري
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); if (d > last) d = last;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ---------- قراءة النموذج الموحد ----------
type Raw = { property: any[]; unit: any[]; tenant: any[]; contract: any[]; installment: any[] };
const SHEETS: Record<Entity, string> = { property: 'العقارات', unit: 'الوحدات', tenant: 'المستأجرون', contract: 'العقود', installment: 'الأقساط' };
const COLS: Record<Entity, [string, string][]> = {
  property: [['name', 'اسم العقار'], ['short', 'الاسم المختصر'], ['type', 'نوع العقار'], ['ownership', 'الملكية'], ['location', 'الموقع'], ['land_basis', 'وضع الأرض'], ['land_value', 'قيمة الأرض'], ['building_value', 'قيمة المبنى'], ['deed_no', 'رقم الصك']],
  unit: [['property', 'العقار'], ['code', 'الوحدة'], ['unit_type', 'نوع الوحدة'], ['floor', 'الدور'], ['rooms', 'الغرف'], ['area', 'المساحة م2'], ['monthly_rent', 'الإيجار الشهري']],
  tenant: [['name', 'اسم المستأجر'], ['tenant_type', 'النوع (فرد/منشأة)'], ['phone', 'الجوال'], ['national_id', 'الهوية'], ['cr_no', 'السجل التجاري'], ['vat_no', 'الرقم الضريبي'], ['contact_person', 'مسؤول التواصل']],
  contract: [['property', 'العقار'], ['unit', 'الوحدة'], ['tenant', 'المستأجر'], ['contract_no', 'رقم العقد'], ['start_date', 'تاريخ البداية'], ['end_date', 'تاريخ النهاية'], ['annual_rent', 'الإيجار السنوي'], ['frequency', 'الدورية'], ['status', 'الحالة'], ['trade_name', 'الاسم التجاري'], ['gen', 'توليد الأقساط (نعم/لا)']],
  installment: [['property', 'العقار'], ['unit', 'الوحدة'], ['tenant', 'المستأجر'], ['no', 'رقم القسط'], ['due_date', 'تاريخ الاستحقاق'], ['period_from', 'من'], ['period_to', 'إلى'], ['amount', 'المبلغ'], ['opening_paid', 'المسدد'], ['src_receipt', 'سند القبض'], ['note', 'ملاحظة']],
};
export function templateWorkbook() {
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  const ex: Record<Entity, any[][]> = {
    property: [['عمارة مثال', 'مثال', 'عمارة سكنية', 'ملك الجمعية', 'القنفذة — حي ...', 'أرض ومبنى', 500000, 2000000, '']],
    unit: [['مثال', 'شقة 101', 'شقة سكنية', 'الأول', '3 غرف', 120, 1500]],
    tenant: [['مستأجر مثال', 'فرد', '0500000000', '', '', '', '']],
    contract: [['مثال', 'شقة 101', 'مستأجر مثال', '', '2026-07-01', '2027-06-30', 18000, 'شهري', 'ساري', '', 'نعم']],
    installment: [['مثال', 'شقة 101', 'مستأجر مثال', 1, '2026-07-01', '2026-07-01', '2026-07-31', 1500, 1500, 'R00012', '']],
  };
  for (const e of Object.keys(SHEETS) as Entity[]) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([COLS[e].map((c) => c[1]), ...ex[e]]), SHEETS[e]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['تعليمات'], ['كل حقل في عمود مستقل، بدون دمج خلايا. احذف صفوف المثال قبل الرفع.'], ['التواريخ: ميلادي 2026-07-01 أو 01/07/2026، أو هجري 1/1/1448هـ.'],
    ['الربط بين الأوراق بالاسم: العقار (الاسم أو المختصر)، الوحدة، المستأجر.'], ['الدورية: شهري، ربع سنوي، نصف سنوي، سنوي. الحالة: ساري، منتهي، مفسوخ. وضع الأرض: أرض ومبنى، أرض مستأجرة، أرض فضاء.'],
    ['ورقة الأقساط اختيارية: إن تُركت فارغة وكان «توليد الأقساط» نعم، يولّد البرنامج الجدول من العقد.']]), 'تعليمات');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
function readTemplate(wb: XLSX.WorkBook): Raw {
  const out: Raw = { property: [], unit: [], tenant: [], contract: [], installment: [] };
  for (const e of Object.keys(SHEETS) as Entity[]) {
    const ws = wb.Sheets[SHEETS[e]]; if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null }); const head = (rows[0] ?? []).map((h) => N(h));
    rows.slice(1).forEach((r, i) => { if (!r.some((x) => x != null && String(x).trim() !== '')) return; const o: any = { _src: `${SHEETS[e]} • صف ${i + 2}` };
      COLS[e].forEach(([k, l]) => { const ix = head.indexOf(N(l)); o[k] = ix >= 0 ? r[ix] : null; }); out[e].push(o); });
  }
  return out;
}

// ---------- قراءة ملف متابعة الإيجارات الحالي ----------
function readLegacy(wb: XLSX.WorkBook, warnings: string[]): Raw {
  const out: Raw = { property: [], unit: [], tenant: [], contract: [], installment: [] };
  const seenP = new Set<string>();
  const addP = (name: string, extra: any = {}) => { const k = N(name); if (!seenP.has(k)) { seenP.add(k); out.property.push({ name, short: name.replace(/^(عمارة|فندق)\s+(وقف\s+)?/, ''), _src: extra._src, ...extra }); } return name; };
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null });
    const flat = (r: any[]) => r.map((x) => N(x));
    // (أ) ورقة عقد كامل: «اسم العمارة / محل» ثم صف البيانات ثم كشف الدفعات
    const hi = rows.findIndex((r) => flat(r).some((x) => x.includes('اسم العماره / محل') || x.includes('اسم العمارة / محل')) && flat(r).some((x) => x.includes('قيمه الايجار السنوي') || x.includes('اسم المستاجر')));
    if (hi >= 0 && rows[hi + 1]) {
      const h = flat(rows[hi]), d = rows[hi + 1]; const col = (t: string) => h.findIndex((x) => x.includes(N(t)));
      const pname = str(d[col('اسم العمارة')]); const tname = str(d[col('اسم المستأجر')]);
      if (!pname) continue;
      addP(pname, { location: str(d[col('موقع')]), _src: `${sn}` });
      const unitCode = 'العمارة كاملة'; out.unit.push({ property: pname, code: unitCode, unit_type: 'عمارة كاملة', floor: 'كامل المبنى', _src: sn });
      if (!tname) { warnings.push(`«${sn}»: لا يوجد مستأجر — أُضيف العقار والوحدة فقط`); continue; }
      out.tenant.push({ name: tname, _src: sn });
      const st = String(d[col('حالة العقد')] ?? ''); const status = /منتهي/.test(st) ? 'منتهي' : 'ساري';
      const freqTxt = String(d[col('سداد الدفعات')] ?? '');
      out.contract.push({ property: pname, unit: unitCode, tenant: tname, start_date: d[col('تاريخ بداية')], end_date: d[col('تاريخ نهاية')], annual_rent: d[col('قيمة الايجار')], frequency: Object.keys(FREQ_AR).find((k) => freqTxt.includes(k)) ?? 'نصف سنوي', status, gen: 'لا', _src: sn });
      // كشف الدفعات: صف العناوين يحتوي «المستحقة للسداد»
      const pi = rows.findIndex((r, i) => i > hi && flat(r).some((x) => x.includes('المستحقه للسداد') || x.includes('المستحقة للسداد')));
      if (pi > 0) { let no = 0;
        for (const r of rows.slice(pi + 1)) {
          if (r.some((x) => /ملخص بالدفعات|مجموع الدفعات/.test(String(x ?? '')))) break;
          const amt = num(r[1]), due = parseDate(r[2]); if (amt == null || !due) continue; no++;
          const rec = num(r[3]) ?? 0, dates = [r[5], r[6], r[7]].filter((x) => x != null).map((x) => parseDate(x) ?? String(x)).join('، ');
          out.installment.push({ property: pname, unit: unitCode, tenant: tname, no, due_date: due, period_from: due, amount: amt, opening_paid: Math.min(rec, amt), src_receipt: str(r[8]), note: [str(typeof r[3] === 'string' ? r[3] : null), str(r[10]), dates && `تواريخ الاستلام: ${dates}`].filter(Boolean).join(' • '), _src: `${sn} • قسط ${no}` });
        }
      }
      continue;
    }
    // (ب) جدول وحدات: عناوين «اسم المستأجر» و«رقم الشقة» و«قيمة الايجار»
    const ui = rows.findIndex((r) => { const f = flat(r); return f.some((x) => x.includes('اسم المستاجر')) && f.some((x) => x.includes('رقم الشقه') || x.includes('رقم الشقة')) && f.some((x) => x.includes('قيمه الايجار') || x.includes('قيمة الايجار')); });
    if (ui >= 0) {
      const h = flat(rows[ui]); const col = (t: string) => h.findIndex((x) => x.includes(N(t)));
      const pname = rows.slice(0, ui).flat().map(str).filter(Boolean).find((x) => x && !/ملخص|اسم العمارة|وصف|موقع/.test(x)) as string | undefined;
      const pn = pname ? (/^(عمارة|فندق)/.test(pname) ? pname : `عمارة ${pname}`) : sn.trim();
      addP(pn, { _src: sn }); let floor = 'الأرضي';
      for (const [i, r] of rows.slice(ui + 1).entries()) {
        if (!(typeof r[0] === 'number')) continue;
        const fl = str(r[col('الدور')]); if (fl) floor = fl;
        const name = str(r[col('اسم المستأجر')]), numb = str(r[col('رقم الشقة')]), kind = str(r[col('نوع النشاط')]);
        if (!name && !numb) continue;
        const code = numb ? `شقة ${numb}` : `${kind ?? 'وحدة'} ${floor} ${r[0]}`;
        const monthly = num(r[col('إجمالي الإيجارات (شهري')]) ?? num(r[col('قيمة الايجار')]);
        out.unit.push({ property: pn, code, unit_type: kind ?? 'وحدة', floor, rooms: str(r[col('عدد الغرف')]), monthly_rent: monthly, _src: `${sn} • صف ${ui + i + 2}` });
        if (!name || /^(فارغ|-)$/.test(name) || /فارغة/.test(name) || monthly == null) continue;
        const ft = String(r[col('سداد الدفعات')] ?? '');
        out.tenant.push({ name, phone: r[col('رقم التواصل')], _src: `${sn} • صف ${ui + i + 2}` });
        const sd = parseDate(r[col('تاريخ بداية')]), ed = parseDate(r[col('تاريخ نهاية')]);
        if (!sd || !ed) warnings.push(`«${sn}» ${code} — ${name}: تواريخ العقد غير موجودة، افتُرض 01/07/2026 – 30/06/2027`);
        out.contract.push({ property: pn, unit: code, tenant: name, start_date: sd ?? '2026-07-01', end_date: ed ?? '2027-06-30', annual_rent: monthly * 12, frequency: /نصف/.test(ft) ? 'نصف سنوي' : /سنوي/.test(ft) && !/شهري/.test(ft) ? 'سنوي' : 'شهري', status: 'ساري', gen: 'نعم', _src: `${sn} • صف ${ui + i + 2}` });
      }
    }
  }
  if (!out.property.length) warnings.push('لم أتعرف على أي ورقة عقار في الملف. استخدم النموذج الموحد.');
  return out;
}

// ---------- بناء الخطة ومقارنة قبل/بعد ----------
export function buildPlan(buf: Buffer, db: DB, kind: 'auto' | 'template' | 'legacy' = 'auto'): Plan {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const warnings: string[] = [];
  const isTemplate = kind === 'template' || (kind === 'auto' && Object.values(SHEETS).some((s) => wb.SheetNames.includes(s)) && wb.SheetNames.includes('العقارات'));
  const raw = isTemplate ? readTemplate(wb) : readLegacy(wb, warnings);
  const rows: PlanRow[] = [];
  // مطابقة العقار بالاسم أو المختصر، مع تجاهل «عمارة / فندق / وقف» في بداية الاسم
  const canon = (v: unknown) => N(v).replace(/^(عمارة|عماره|فندق)\s+/, '').replace(/^وقف\s+/, '').replace(/\s*\(.*\)\s*$/, '').trim();
  const P = db.properties, findP = (v: unknown) => { const k = N(v), c = canon(v); return P.find((p) => N(p.name) === k || N(p.short) === k) ?? (c ? P.find((p) => canon(p.name) === c || canon(p.short) === c) : undefined); };
  const newP = new Map<string, Record<string, any>>();
  const diff = (e: Entity, cur: Record<string, any>, next: Record<string, any>) => UPDATABLE[e].filter((f) => next[f] != null && next[f] !== '' && String(cur[f] ?? '') !== String(next[f])).map((f) => ({ field: f, label: LABELS[f], old: cur[f] ?? null, next: next[f] }));
  const pKey = (v: unknown) => { const ex = findP(v); if (ex) return 'p:' + ex.id; const hit = newP.get(N(v)) ?? newP.get(canon(v)); return hit ? 'n:' + N(hit.name) : null; };
  for (const r of raw.property) {
    const d = { name: str(r.name), short: str(r.short) ?? str(r.name), type: str(r.type), ownership: str(r.ownership), location: str(r.location), land_basis: BASIS_AR[str(r.land_basis) ?? ''] ?? (str(r.land_basis) ? null : 'owned'), land_value: num(r.land_value), building_value: num(r.building_value), deed_no: str(r.deed_no) };
    const errors = !d.name ? ['اسم العقار مطلوب'] : []; const ex = d.name ? findP(d.name) : undefined;
    if (!ex && d.name) { newP.set(N(d.name), d); newP.set(N(d.short), d); newP.set(canon(d.name), d); }
    const ds = ex ? diff('property', ex, d) : [];
    rows.push({ entity: 'property', key: ex ? 'p:' + ex.id : 'n:' + N(d.name), status: errors.length ? 'error' : ex ? (ds.length ? 'update' : 'same') : 'new', data: d, existingId: ex?.id, diffs: ds, errors, source: r._src });
  }
  const uKey = (pk: string | null, code: unknown) => pk ? `${pk}|${N(code)}` : null;
  const seenU = new Set<string>();
  for (const r of raw.unit) {
    const pk = pKey(r.property), d = { property: str(r.property), code: str(r.code), unit_type: str(r.unit_type), floor: str(r.floor), rooms: str(r.rooms), area: num(r.area), monthly_rent: num(r.monthly_rent) };
    const errors = [...(!pk ? [`العقار «${r.property ?? ''}» غير موجود في البرنامج ولا في الملف`] : []), ...(!d.code ? ['رقم/اسم الوحدة مطلوب'] : [])];
    const key = uKey(pk, d.code) ?? 'x' + rows.length; if (seenU.has(key)) continue; seenU.add(key);
    const ex = pk?.startsWith('p:') ? db.units.find((u) => u.property_id === pk.slice(2) && N(u.code) === N(d.code)) : undefined; const ds = ex ? diff('unit', ex, d) : [];
    rows.push({ entity: 'unit', key, status: errors.length ? 'error' : ex ? (ds.length ? 'update' : 'same') : 'new', data: d, existingId: ex?.id, diffs: ds, errors, source: r._src });
  }
  // مطابقة المستأجر بالاسم مع تجاهل الألقاب في بدايته (أ/ م/ د/ أ.)
  const canonT = (v: unknown) => N(v).replace(/^(ا|م|د|الاستاذ|المهندس|الدكتور)[\/.]?\s+|^(ا|م|د)[\/.]\s*/, '').trim();
  const findT = (v: unknown) => db.tenants.find((t) => N(t.name) === N(v)) ?? db.tenants.find((t) => canonT(t.name) === canonT(v));
  const seenT = new Set<string>();
  for (const r of raw.tenant) {
    const d = { name: str(r.name), tenant_type: /منشأ|شركة|مؤسسة/.test(String(r.tenant_type ?? r.name ?? '')) ? 'company' : 'individual', phone: (() => { const p = String(r.phone ?? '').replace(/\D/g, ''); return p ? (p.length === 9 ? '0' + p : p) : null; })(), national_id: str(r.national_id), cr_no: str(r.cr_no), vat_no: str(r.vat_no), contact_person: str(r.contact_person) };
    if (!d.name) { rows.push({ entity: 'tenant', key: 'x' + rows.length, status: 'error', data: d, diffs: [], errors: ['اسم المستأجر مطلوب'], source: r._src }); continue; }
    const key = 't:' + N(d.name); if (seenT.has(key)) continue; seenT.add(key);
    const ex = findT(d.name); const ds = ex ? diff('tenant', ex, d) : [];
    rows.push({ entity: 'tenant', key, status: ex ? (ds.length ? 'update' : 'same') : 'new', data: d, existingId: ex?.id, diffs: ds, errors: [], source: r._src });
  }
  const hasU = (k: string | null) => !!k && rows.some((x) => x.entity === 'unit' && x.key === k && x.status !== 'error') || (k?.startsWith('p:') && db.units.some((u) => `p:${u.property_id}|${N(u.code)}` === k));
  const hasT = (v: unknown) => !!findT(v) || seenT.has('t:' + N(v));
  for (const r of raw.contract) {
    const pk = pKey(r.property), uk = uKey(pk, r.unit);
    const d = { property: str(r.property), unit: str(r.unit), tenant: str(r.tenant), contract_no: str(r.contract_no), start_date: parseDate(r.start_date), end_date: parseDate(r.end_date), annual_rent: num(r.annual_rent),
      frequency: FREQ_AR[str(r.frequency) ?? ''] ?? null, status: STATUS_AR[str(r.status) ?? 'ساري'] ?? 'active', trade_name: str(r.trade_name), gen: !/^لا$/.test(String(r.gen ?? 'نعم').trim()) };
    const errors = [...(!pk ? [`العقار «${d.property ?? ''}» غير معروف`] : []), ...(!hasU(uk) ? [`الوحدة «${d.unit ?? ''}» غير معروفة في العقار`] : []), ...(!d.tenant || !hasT(d.tenant) ? [`المستأجر «${d.tenant ?? ''}» غير معروف`] : []),
      ...(!d.start_date ? ['تاريخ البداية غير صحيح'] : []), ...(!d.end_date ? ['تاريخ النهاية غير صحيح'] : []), ...(d.start_date && d.end_date && d.start_date > d.end_date ? ['البداية بعد النهاية'] : []),
      ...(d.annual_rent == null ? ['الإيجار السنوي مطلوب'] : []), ...(!d.frequency ? [`الدورية «${r.frequency ?? ''}» غير معروفة`] : [])];
    const key = `c:${uk}|${N(d.tenant)}|${d.start_date}`;
    const exU = uk?.startsWith('p:') ? db.units.find((u) => `p:${u.property_id}|${N(u.code)}` === uk) : undefined, exT = findT(d.tenant);
    const ex = exU && exT ? db.contracts.find((c) => c.unit_id === exU.id && c.tenant_id === exT.id && c.start_date === d.start_date) : undefined;
    const ds = ex ? diff('contract', ex, d) : [];
    rows.push({ entity: 'contract', key, status: errors.length ? 'error' : ex ? (ds.length ? 'update' : 'same') : 'new', data: d, existingId: ex?.id, diffs: ds, errors, source: r._src });
  }
  for (const r of raw.installment) {
    const pk = pKey(r.property), uk = uKey(pk, r.unit);
    const c = rows.find((x) => x.entity === 'contract' && x.key.startsWith(`c:${uk}|${N(r.tenant)}|`) && x.status !== 'error');
    const d = { contract: c?.key ?? null, no: num(r.no), due_date: parseDate(r.due_date), period_from: parseDate(r.period_from) ?? parseDate(r.due_date), period_to: parseDate(r.period_to), amount: num(r.amount), opening_paid: num(r.opening_paid) ?? 0, src_receipt: str(r.src_receipt), note: str(r.note) };
    const errors = [...(!c ? ['لا يوجد عقد مطابق (العقار + الوحدة + المستأجر)'] : []), ...(!d.due_date ? ['تاريخ الاستحقاق غير صحيح'] : []), ...(d.amount == null ? ['المبلغ مطلوب'] : []), ...(d.amount != null && d.opening_paid > d.amount ? ['المسدد أكبر من المبلغ'] : [])];
    const exI = c?.existingId ? db.installments.find((i) => i.contract_id === c.existingId && i.no === d.no) : undefined;
    const ds = exI ? diff('installment', exI, d) : [];
    rows.push({ entity: 'installment', key: `i:${c?.key}|${d.no}`, status: errors.length ? 'error' : exI ? (ds.length ? 'update' : 'same') : 'new', data: d, existingId: exI?.id, diffs: ds, errors, source: r._src });
  }
  // تكملة period_to للأقساط الجديدة: من القسط التالي
  const byC = new Map<string, PlanRow[]>(); rows.filter((x) => x.entity === 'installment' && x.status === 'new').forEach((x) => byC.set(x.data.contract, [...(byC.get(x.data.contract) ?? []), x]));
  for (const [ck, xs] of byC) { xs.sort((a, b) => String(a.data.due_date).localeCompare(String(b.data.due_date))); const c = rows.find((r) => r.key === ck);
    xs.forEach((x, i) => { if (!x.data.period_to) x.data.period_to = i + 1 < xs.length ? addDays(xs[i + 1].data.due_date, -1) : c?.data.end_date ?? x.data.due_date; if (x.data.no == null) x.data.no = i + 1; }); }
  return { kind: isTemplate ? 'template' : 'legacy', rows, warnings };
}

/** جدول الأقساط المولّد لعقد جديد بلا أقساط في الملف */
export const genSchedule = (start: string, end: string, annual: number, freq: Frequency) => buildSchedule(start, end, annual, freq);
