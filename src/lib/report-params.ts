/** معايير التقارير الموحدة: الفترة واختصاراتها، المقارنة، النطاق، العرض، الطباعة */
import { addDays, addMonths } from './calc';

export type ReportParams = {
  preset: string; from: string; to: string; label: string;
  compare: 'none' | 'prev' | 'yoy'; cFrom: string | null; cTo: string | null; cLabel: string;
  props: string[]; tenant: string; method: string; status: string; group: string; detail: 'summary' | 'detail';
  orient: 'l' | 'p'; sig: boolean; note: string; chart: boolean; days: number;
};
export type SP = Record<string, string | undefined>;
export const PRESETS: [string, string][] = [['month', 'هذا الشهر'], ['prev', 'الشهر السابق'], ['quarter', 'الربع الحالي'], ['ytd', 'من بداية السنة'], ['year', 'السنة كاملة'], ['last12', 'آخر 12 شهراً'], ['custom', 'مخصص']];
const isD = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const monthEnd = (iso: string) => addDays(addMonths(iso.slice(0, 7) + '-01', 1), -1);
const fmt = (iso: string) => iso.split('-').reverse().join('/');

export function periodOf(preset: string, today: string): [string, string] {
  const y = today.slice(0, 4), m = Number(today.slice(5, 7));
  switch (preset) {
    case 'month': return [today.slice(0, 7) + '-01', monthEnd(today)];
    case 'prev': { const s = addMonths(today.slice(0, 7) + '-01', -1); return [s, monthEnd(s)]; }
    case 'quarter': { const qm = Math.floor((m - 1) / 3) * 3 + 1, s = `${y}-${String(qm).padStart(2, '0')}-01`; return [s, monthEnd(addMonths(s, 2))]; }
    case 'year': return [`${y}-01-01`, `${y}-12-31`];
    case 'last12': return [addMonths(today.slice(0, 7) + '-01', -11), monthEnd(today)];
    default: return [`${y}-01-01`, today];
  }
}

export function parseReport(sp: SP, today: string, defaults: Partial<{ preset: string; compare: ReportParams['compare']; group: string; detail: 'summary' | 'detail'; days: number; orient: 'l' | 'p' }> = {}): ReportParams {
  let preset = sp.pr ?? defaults.preset ?? 'ytd';
  let [from, to] = periodOf(preset, today);
  // تواريخ مرسلة من النموذج ومطابقة لاختصار الفترة لا تحوّلها إلى «مخصص»
  if ((isD(sp.from) && sp.from !== from) || (isD(sp.to) && sp.to !== to)) { preset = 'custom'; from = isD(sp.from) ? sp.from! : from; to = isD(sp.to) ? sp.to! : to; }
  if (from > to) [from, to] = [to, from];
  const compare = (['none', 'prev', 'yoy'].includes(sp.cmp ?? '') ? sp.cmp : defaults.compare ?? 'none') as ReportParams['compare'];
  let cFrom: string | null = null, cTo: string | null = null;
  if (compare === 'yoy') { cFrom = addMonths(from, -12); cTo = addMonths(to, -12); }
  if (compare === 'prev') { const len = Math.round((Date.parse(to) - Date.parse(from)) / 864e5); cTo = addDays(from, -1); cFrom = addDays(cTo, -len); }
  const label = preset === 'custom' ? `من ${fmt(from)} إلى ${fmt(to)}` : `${PRESETS.find((p) => p[0] === preset)?.[1] ?? ''} (${fmt(from)} – ${fmt(to)})`;
  return {
    preset, from, to, label, compare, cFrom, cTo, cLabel: cFrom && cTo ? `${compare === 'yoy' ? 'نفس الفترة العام السابق' : 'الفترة السابقة'} (${fmt(cFrom)} – ${fmt(cTo)})` : '',
    props: (sp.p ?? '').split(',').filter(Boolean), tenant: sp.t ?? '', method: sp.m ?? '', status: sp.st ?? '',
    group: sp.g ?? defaults.group ?? '', detail: sp.d === 'summary' || sp.d === 'detail' ? sp.d : defaults.detail ?? 'detail',
    orient: sp.o === 'p' || sp.o === 'l' ? sp.o : defaults.orient ?? 'l', sig: sp.sig !== '0', note: (sp.note ?? '').slice(0, 300), chart: sp.ch !== '0',
    days: Number(sp.days) > 0 ? Math.min(3650, Number(sp.days)) : defaults.days ?? 365,
  };
}
/** تحقق: هل التاريخ داخل فترة */
export const inRange = (d: string | null | undefined, from: string | null, to: string | null) => !!d && !!from && !!to && d >= from && d <= to;
export const pctChange = (cur: number, prev: number) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : null);
/** يعيد بناء رابط الصفحة بنفس المعايير مع تعديل */
export function reportQuery(sp: SP, patch: Record<string, string | undefined> = {}) {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v != null && v !== '' && k !== 'ok' && k !== 'err') o[k] = v;
  const s = new URLSearchParams(o).toString(); return s ? '?' + s : '';
}
