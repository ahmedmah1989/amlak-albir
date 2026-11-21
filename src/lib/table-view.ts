export type SortValue = string | number | null;
export type SearchableRow = { id: string; search: string; values: SortValue[] };
export const normalizeSearch = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ar')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
  .replace(/[٠-٩]/g, (n) => String(n.charCodeAt(0) - 1632)).trim();

export function selectTableRows<T extends SearchableRow>(rows: T[], query: string, sort: number | null, desc: boolean) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const selected = rows.filter((row) => terms.every((term) => normalizeSearch(row.search).includes(term)));
  if (sort == null) return selected;
  return selected.slice().sort((a, b) => {
    const av = a.values[sort], bv = b.values[sort];
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    const order = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ar', { numeric: true });
    return desc ? -order : order;
  });
}
