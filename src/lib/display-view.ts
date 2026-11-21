import { normalizeSearch, selectTableRows, type SearchableRow } from './table-view';
export type ColumnFilter = { column: string; op: 'contains' | 'equals' | 'gte' | 'lte' | 'empty'; value: string };
export type GridView = { query: string; sort: string | null; desc: boolean; hidden: string[]; order: string[]; size: number; compact: boolean; filters: ColumnFilter[]; group?: string | null };
export type GridPreset = { id: string; name: string; href: string; view: GridView };
export type GridWorkspace = { version: 1; selected: string; views: GridPreset[] };
export type DisplayWorkspaces = Record<string, GridWorkspace>;
export const GRID_KEYS = ['tenants','contracts','payments','installments','search','properties','expenses','maintenance','followups-due','followups-history','bank-lines','dashboard','units','reports','imports','vouchers','invoices'];
const str = (v: unknown, max = 120) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const strings = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && x.length > 0 && x.length <= 120))].slice(0,60) as string[] : [];
export function cleanGridView(raw: unknown): GridView {
  const v = raw && typeof raw === 'object' ? raw as Record<string,unknown> : {};
  const filters: ColumnFilter[] = [];
  if (Array.isArray(v.filters)) for (const f of v.filters.slice(0,6)) if (f && typeof f === 'object' && str(f.column) && ['contains','equals','gte','lte','empty'].includes(f.op)) filters.push({column:str(f.column),op:f.op,value:str(f.value,200)});
  return { query:str(v.query,200), sort:str(v.sort) || null, desc:v.desc===true, hidden:strings(v.hidden), order:strings(v.order), size:[15,25,50,100].includes(Number(v.size)) ? Number(v.size) : 15, compact:v.compact!==false, filters, group:str(v.group) || null };
}
export function safeDisplayHref(raw: unknown) {
  const href = str(raw,1800);
  if (!/^\/(tenants|contracts|payments|installments|search|properties|units|expenses|maintenance|followups|bank\/lines|dashboard|reports(\/[a-z-]+)?|imports|vouchers|invoices)(\?|$)/.test(href) || /[\r\n\\#]/.test(href)) return '';
  return href;
}
export function cleanGridWorkspace(raw: unknown): GridWorkspace {
  const o=raw && typeof raw==='object' ? raw as Record<string,unknown> : {};
  const views: GridPreset[]=[];
  if(o.version===1 && Array.isArray(o.views)) for(const v of o.views.slice(0,8)) {
    if(!v || typeof v!=='object')continue;
    const id=str(v.id,70), name=str(v.name,60);
    if(!/^[a-zA-Z0-9_-]+$/.test(id)||!name||views.some(x=>x.id===id))continue;
    views.push({id,name,href:safeDisplayHref(v.href),view:cleanGridView(v.view)});
  }
  return {version:1,selected:views.some(x=>x.id===o.selected)?String(o.selected):'',views};
}
export function displaysFromPrefs(prefs: string): DisplayWorkspaces {
  try { const raw=JSON.parse(prefs||'{}').table_views;const out:DisplayWorkspaces={};if(raw&&typeof raw==='object')for(const k of GRID_KEYS)if(raw[k])out[k]=cleanGridWorkspace(raw[k]);return out; }catch{return {};}
}
export function resolveGrid(view: GridView, keys: string[], defaultHidden: string[] = []): GridView {
  const order=[...view.order.filter(k=>keys.includes(k)),...keys.filter(k=>!view.order.includes(k))];
  let hidden=[...new Set([...view.hidden.filter(k=>keys.includes(k)),...defaultHidden.filter(k=>keys.includes(k)&&!view.order.includes(k))])];
  if(hidden.length===keys.length) hidden=defaultHidden.filter(k=>keys.includes(k)).slice(0,Math.max(0,keys.length-1));
  return {...view,order,hidden,sort:keys.includes(view.sort||'')?view.sort:null,filters:view.filters.filter(f=>keys.includes(f.column)),group:keys.includes(view.group||'')?view.group:null};
}
function match(value: unknown, f: ColumnFilter) {
  const empty=value===null||value===undefined||String(value).trim()==='';
  if(f.op==='empty')return empty;
  if(empty)return false;
  if(f.op==='contains')return normalizeSearch(String(value)).includes(normalizeSearch(f.value));
  if(f.op==='equals'&&typeof value!=='number')return normalizeSearch(String(value))===normalizeSearch(f.value);
  if(typeof value==='number'){const n=Number(normalizeSearch(f.value).replace(/[,\u066c]/g,'').replace(/\u066b/g,'.'));return f.value.trim()!==''&&Number.isFinite(n)&&(f.op==='equals'?value===n:f.op==='gte'?value>=n:value<=n);}
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(value))&&/^\d{4}-\d{2}-\d{2}$/.test(f.value))return f.op==='gte'?String(value)>=f.value:String(value)<=f.value;
  return false;
}
export function selectGridRows<T extends SearchableRow>(rows: T[], view: GridView, keys: string[]): T[] {
  const filtered=rows.filter(row=>view.filters.every(f=>{const i=keys.indexOf(f.column);return i<0||match(row.values[i],f);}));
  const searchable=filtered.map(row=>({...row,search:[row.search,...row.values].join(' ')}));
  return selectTableRows(searchable,view.query,view.sort?keys.indexOf(view.sort):null,view.desc);
}
export function gridExportData(rows: SearchableRow[], keys: string[], labels: string[], view: GridView) {
  const resolved={...resolveGrid(view,keys),hidden:view.hidden.filter(k=>keys.includes(k))},selected=selectGridRows(rows,resolved,keys),visible=resolved.order.filter(k=>!resolved.hidden.includes(k));
  return {head:visible.map(k=>labels[keys.indexOf(k)]),rows:selected.map(r=>visible.map(k=>r.values[keys.indexOf(k)]??'')),visible,selected};
}
