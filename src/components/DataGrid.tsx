'use client';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { cleanGridView, resolveGrid, selectGridRows, gridExportData, safeDisplayHref, type GridView, type GridWorkspace, type ColumnFilter } from '@/lib/display-view';
import { useDisplayWorkspace } from './DisplayWorkspace';
import { saveDisplayWorkspace } from '@/lib/display-actions';

export type TableColumn = { id?: string; label: string; numeric?: boolean; wide?: boolean; hidden?: boolean; sortable?: boolean; exportable?: boolean; kind?: 'text' | 'number' | 'date'; groupable?: boolean };
/** actions: قائمة إجراءات الصف [العنوان، الرابط] — peek: بيانات المعاينة السريعة [العنوان، القيمة] */
export type TableRow = import('@/lib/table-view').SearchableRow & { cells: ReactNode[]; totals?: Record<number, number>; actions?: [string, string][]; peek?: [string, string][]; peekTitle?: string };
/** إجراء جماعي على الصفوف المحددة: يفتح الرابط مع ids=… */
export type BulkAction = { label: string; href: string; primary?: boolean };

const OPS = { contains: 'يحتوي', equals: 'يساوي', gte: 'من / أكبر أو يساوي', lte: 'إلى / أصغر أو يساوي', empty: 'فارغ' };
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function DataGrid({ columns, rows, storageKey, label, summaryColumns = [], bulk = [], selectable }: {
  columns: TableColumn[]; rows: TableRow[]; storageKey: string; label: string; summaryColumns?: number[]; bulk?: BulkAction[]; selectable?: boolean }) {
  const id = useId(), context = useDisplayWorkspace(), key = storageKey.split(':')[0];
  const keys = columns.map((c, i) => c.id || c.label || String(i)), defaultHidden = keys.filter((_, i) => columns[i].hidden);
  const initial = resolveGrid(cleanGridView({ hidden: defaultHidden }), keys, defaultHidden);
  const [fallback, setFallback] = useState<GridWorkspace>({ version: 1, selected: '', views: [] });
  const workspace = context?.views[key] || fallback, defaultPreset = workspace.views.find((v) => v.id === workspace.selected);
  const [draftView, setView] = useState<GridView>(() => defaultPreset ? resolveGrid(defaultPreset.view, keys, defaultHidden) : initial);
  const [active, setActive] = useState(workspace.selected), [name, setName] = useState(defaultPreset?.name || ''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [exporting, setExporting] = useState(false), [page, setPage] = useState(1);
  const [filterColumn, setFilterColumn] = useState(keys[0] || ''), [filterOp, setFilterOp] = useState<ColumnFilter['op']>('contains'), [filterValue, setFilterValue] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set()), [peek, setPeek] = useState<string | null>(null);
  const canSelect = selectable ?? (bulk.length > 0 || rows.length > 1);
  const view = resolveGrid(draftView, keys, defaultHidden);
  useEffect(() => {
    const saved = workspace.views.find((v) => v.id === workspace.selected);
    setView(saved ? resolveGrid(saved.view, keys, defaultHidden) : initial); setActive(saved?.id || ''); setName(saved?.name || ''); setPage(1); setSel(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const selected = useMemo(() => selectGridRows(rows, view, keys), [rows, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const groupIdx = view.group ? keys.indexOf(view.group) : -1;
  // التجميع: ترتيب حسب قيمة عمود التجميع مع الحفاظ على الترتيب داخل كل مجموعة
  const ordered = useMemo(() => {
    if (groupIdx < 0) return selected;
    const gv = (r: TableRow) => String(r.values[groupIdx] ?? '— بدون قيمة —');
    const firstSeen = new Map<string, number>(); selected.forEach((r, i) => { const g = gv(r); if (!firstSeen.has(g)) firstSeen.set(g, i); });
    const isNum = selected.some((r) => typeof r.values[groupIdx] === 'number');
    return selected.slice().sort((a, b) => {
      const ga = gv(a), gb = gv(b); if (ga === gb) return 0;
      return isNum ? Number(a.values[groupIdx] ?? 0) - Number(b.values[groupIdx] ?? 0) : ga.localeCompare(gb, 'ar', { numeric: true });
    });
  }, [selected, groupIdx]);
  const visible = view.order.filter((k) => !view.hidden.includes(k)), grouped = groupIdx >= 0;
  const size = grouped ? Math.max(ordered.length, 1) : view.size;
  const pages = Math.max(1, Math.ceil(ordered.length / size)), current = Math.min(page, pages), start = (current - 1) * size;
  const index = (k: string) => keys.indexOf(k), update = (patch: Partial<GridView>) => { setView((v) => ({ ...v, ...patch })); setPage(1); };
  const filterIndex = index(filterColumn), sample = rows.find((r) => r.values[filterIndex] != null)?.values[filterIndex];
  const kind = columns[filterIndex]?.kind || (typeof sample === 'number' ? 'number' : typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sample) ? 'date' : 'text');
  const hasActions = rows.some((r) => r.actions?.length || r.peek?.length);
  const selRows = ordered.filter((r) => sel.has(r.id)), allSel = ordered.length > 0 && ordered.every((r) => sel.has(r.id));
  const toggle = (rid: string) => setSel((s) => { const n = new Set(s); n.has(rid) ? n.delete(rid) : n.add(rid); return n; });
  const sumOf = (rs: TableRow[], i: number) => rs.reduce((n, r) => n + (r.totals?.[i] ?? 0), 0);

  async function persist(next: GridWorkspace) { setBusy(true); try { const result = context ? await context.save(key, next) : await saveDisplayWorkspace(key, next); if (result.ok) setFallback(next); setMessage(result.message); return result.ok; } catch { setMessage('تعذر حفظ العرض. أعد المحاولة.'); return false; } finally { setBusy(false); } }
  async function save() {
    const title = name.trim() || workspace.views.find((x) => x.id === active)?.name; if (!title) { setMessage('اكتب اسمًا للعرض أولًا.'); return; }
    if (!active && workspace.views.length >= 8) { setMessage('يمكن حفظ 8 عروض لكل جدول. حدّث عرضًا أو احذف أحدها.'); return; }
    const preset = { id: active || 'g' + Date.now().toString(36), name: title.slice(0, 60), href: safeDisplayHref(window.location.pathname + window.location.search), view: cleanGridView(view) };
    const next: GridWorkspace = { version: 1, selected: preset.id, views: [...workspace.views.filter((x) => x.id !== preset.id), preset] };
    if (await persist(next)) { setActive(preset.id); setName(preset.name); }
  }
  async function apply(pid: string) {
    const preset = workspace.views.find((x) => x.id === pid); if (!preset) { setActive(''); setName(''); setView(initial); setPage(1); return; }
    setActive(pid); setName(preset.name); update(resolveGrid(preset.view, keys, defaultHidden));
    if (preset.href && preset.href !== window.location.pathname + window.location.search) { if (await persist({ ...workspace, selected: pid })) window.location.assign(preset.href); }
  }
  async function remove() { if (!active) return; const next: GridWorkspace = { version: 1, selected: workspace.selected === active ? '' : workspace.selected, views: workspace.views.filter((v) => v.id !== active) }; if (await persist(next)) { setActive(''); setName(''); } }
  function move(k: string, delta: number) { const order = [...view.order], i = order.indexOf(k), j = i + delta; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; update({ order }); }
  function addFilter() { if (!filterColumn || (filterOp !== 'empty' && !filterValue.trim())) { setMessage('اختر عمودًا وقيمة للشرط.'); return; } if (view.filters.length >= 6) { setMessage('الحد الأقصى 6 شروط متزامنة.'); return; } update({ filters: [...view.filters, { column: filterColumn, op: filterOp, value: filterValue.trim() }] }); setFilterValue(''); setMessage(''); }
  const [canXl, setCanXl] = useState(true); useEffect(() => { setCanXl((document.getElementById('amlak-meta') as HTMLElement | null)?.dataset.export !== '0'); }, []);
  async function exportRows(onlySelected = false) {
    setExporting(true); setMessage('');
    try {
      const XLSX = await import('xlsx'); const excluded = keys.filter((_, i) => columns[i].exportable === false);
      const src = onlySelected ? ordered.filter((r) => sel.has(r.id)) : ordered;
      const data = gridExportData(src, keys, columns.map((c) => c.label), { ...view, hidden: [...new Set([...view.hidden, ...excluded])] });
      if (!data.head.length) { setMessage('اختر عمود بيانات واحدًا على الأقل للتصدير.'); return; }
      // التجميع في الإكسل: عمود المجموعة أولاً + سطر إجمالي لكل مجموعة (كل حقل في عمود مستقل وبدون دمج)
      let head = data.head, body: (string | number | null)[][] = data.rows as (string | number | null)[][];
      if (grouped) {
        const gLabel = columns[groupIdx].label, gv = (r: TableRow) => String(r.values[groupIdx] ?? '— بدون قيمة —');
        head = [gLabel, ...data.head]; body = [];
        const groups = new Map<string, TableRow[]>(); (data.selected as TableRow[]).forEach((r) => { const g = gv(r); groups.set(g, [...(groups.get(g) ?? []), r]); });
        for (const [g, rs] of groups) {
          rs.forEach((r) => body.push([g, ...data.visible.map((k) => (r.values[keys.indexOf(k)] ?? '') as string | number)]));
          if (summaryColumns.length) body.push([`إجمالي ${g}`, ...data.visible.map((k) => summaryColumns.includes(keys.indexOf(k)) ? sumOf(rs, keys.indexOf(k)) : null)]);
        }
      }
      const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...body]), 'النتائج');
      const md = (document.getElementById('amlak-meta') as HTMLElement | null)?.dataset ?? {};
      const meta = [['الجهة', md.org ?? ''], ['التقرير', label], ['طُبع بواسطة', md.user ?? ''], ['عدد النتائج', data.rows.length], ['وقت الاستخراج', new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })],
        ['نطاق الصفحة', window.location.pathname + window.location.search], ['البحث', view.query], ['التجميع', grouped ? columns[groupIdx].label : 'بدون'], ['المصدر', onlySelected ? 'الصفوف المحددة فقط' : 'كل النتائج المطابقة'],
        ...view.filters.map((f) => ['شرط', `${f.column} ${OPS[f.op]} ${f.value}`]),
        ...summaryColumns.filter((i) => data.visible.includes(keys[i])).map((i) => ['إجمالي ' + columns[i].label, sumOf(data.selected as TableRow[], i)])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), 'نطاق التقرير');
      XLSX.writeFile(wb, 'amlak-' + key + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
      setMessage(`تم تصدير ${data.rows.length} نتيجة${onlySelected ? ' محددة' : ''}.`);
    } catch { setMessage('تعذر تجهيز ملف إكسل. أعد المحاولة.'); } finally { setExporting(false); }
  }
  function printSelected() { document.body.classList.add('print-selected-only'); const off = () => { document.body.classList.remove('print-selected-only'); window.removeEventListener('afterprint', off); }; window.addEventListener('afterprint', off); window.print(); }
  const bulkHref = (b: BulkAction) => b.href + (b.href.includes('?') ? '&' : '?') + 'ids=' + encodeURIComponent(selRows.map((r) => r.id).join(','));
  const peekRow = peek ? rows.find((r) => r.id === peek) : null;

  const colCells = (render: (k: string, i: number, c: TableColumn) => ReactNode) => view.order.map((k) => { const i = index(k); return render(k, i, columns[i]); });
  const cls = (c: TableColumn, k: string) => (c.numeric ? 'n ' : '') + (c.wide ? 'cell-wide ' : '') + (view.hidden.includes(k) ? 'col-hidden' : '');
  const totalCols = visible.length + (canSelect ? 1 : 0) + (hasActions ? 1 : 0);
  const body: ReactNode[] = [];
  let lastG: string | null = null;
  ordered.forEach((row, n) => {
    const hidden = n < start || n >= start + size;
    if (grouped) {
      const g = String(row.values[groupIdx] ?? '— بدون قيمة —');
      if (g !== lastG) {
        const rs = ordered.filter((r) => String(r.values[groupIdx] ?? '— بدون قيمة —') === g);
        body.push(<tr key={'g-' + g} className="grid-group-row"><td colSpan={totalCols}><b>{g}</b> <span>({rs.length})</span>
          {summaryColumns.filter((i) => visible.includes(keys[i])).map((i) => <span key={i} className="grid-group-sum">{columns[i].label}: <b>{fmt(sumOf(rs, i))}</b></span>)}</td></tr>);
        lastG = g;
      }
    }
    body.push(<tr key={row.id} data-sel={sel.has(row.id) ? '1' : '0'} className={(hidden ? 'page-hidden ' : '') + (sel.has(row.id) ? 'row-selected ' : '') + (peek === row.id ? 'row-peek' : '')}>
      {canSelect && <td className="grid-check noprint"><input type="checkbox" aria-label="تحديد الصف" checked={sel.has(row.id)} onChange={() => toggle(row.id)} /></td>}
      {colCells((k, i, c) => <td key={k} className={cls(c, k)} data-label={c.label}>{row.cells[i]}</td>)}
      {hasActions && <td className="grid-row-actions noprint">{(row.actions?.length || row.peek?.length) ? <details className="row-menu"><summary aria-label="إجراءات الصف">⋮</summary><div>
        {row.peek?.length ? <button type="button" onClick={() => setPeek(peek === row.id ? null : row.id)}>معاينة سريعة</button> : null}
        {row.actions?.map(([l, h]) => <a key={h + l} href={h}>{l}</a>)}</div></details> : null}</td>}
    </tr>);
  });

  return <div className={'data-table' + (view.compact ? ' grid-compact' : '')}>
    <div className="gt noprint">
      <label className="table-search"><span className="sr-only">بحث في {label}</span><input type="search" value={view.query} onChange={(e) => update({ query: e.target.value })} placeholder={`بحث في ${label}…`} aria-controls={id} /></label>
      <div className="gt-actions">
        <details className="gt-menu grid-filter-panel"><summary>فلاتر{view.filters.length ? <em>{view.filters.length}</em> : null}</summary><div className="gt-pop"><div className="grid-filter-builder"><label>العمود<select value={filterColumn} onChange={(e) => { setFilterColumn(e.target.value); setFilterOp('contains'); }}>{columns.map((c, i) => c.sortable !== false && <option key={keys[i]} value={keys[i]}>{c.label}</option>)}</select></label><label>الشرط<select value={filterOp} onChange={(e) => setFilterOp(e.target.value as ColumnFilter['op'])}>{Object.entries(OPS).filter(([op]) => !['gte', 'lte'].includes(op) || kind !== 'text').map(([op, title]) => <option key={op} value={op}>{title}</option>)}</select></label>{filterOp !== 'empty' && <label>القيمة<input type={kind === 'date' && filterOp !== 'contains' ? 'date' : 'text'} value={filterValue} onChange={(e) => setFilterValue(e.target.value)} placeholder={kind === 'number' ? 'مبلغ أو رقم' : 'القيمة المطلوبة'} /></label>}<button type="button" className="btn sm" onClick={addFilter}>إضافة شرط</button></div><small>يجب تحقق جميع الشروط. الإكسل والطباعة يشملان كل النتائج المطابقة.</small></div></details>
        <details className="gt-menu"><summary>العرض{active ? <em className="gt-view">{workspace.views.find((v) => v.id === active)?.name}</em> : null}</summary><div className="gt-pop gt-view-pop">
          <div className="grid-presetbar"><label>عروض حسابي<select value={active} disabled={busy} onChange={(e) => apply(e.target.value)}><option value="">العرض الأساسي</option>{workspace.views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>اسم العرض<input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثل: مبالغ كبيرة بلا مرجع" /></label><button type="button" className="btn sm" disabled={busy} onClick={save}>{busy ? 'جارٍ الحفظ…' : active ? 'حفظ التعديلات والافتراضي' : 'حفظ عرض افتراضي'}</button>{active && <><button type="button" className="btn sm ghost" disabled={busy} onClick={() => { setActive(''); setName(''); }}>نسخة جديدة</button><button type="button" className="btn sm ghost" disabled={busy} onClick={remove}>حذف العرض</button></>}</div>
          <div className="gt-row"><label className="grid-group-pick"><span>تجميع حسب</span><select value={view.group ?? ''} onChange={(e) => update({ group: e.target.value || null })}><option value="">بدون تجميع</option>{columns.map((c, i) => c.sortable !== false && c.groupable !== false && !c.numeric && <option key={keys[i]} value={keys[i]}>{c.label}</option>)}</select></label><label className="grid-density"><input type="checkbox" checked={view.compact} onChange={(e) => update({ compact: e.target.checked })} />مضغوط</label></div>
          <div className="gt-cols"><b>الأعمدة وترتيبها</b><div>{view.order.map((k, n) => { const i = index(k); return <div className="grid-column-option" key={k}><label><input type="checkbox" checked={!view.hidden.includes(k)} disabled={!view.hidden.includes(k) && visible.length === 1} onChange={() => update({ hidden: view.hidden.includes(k) ? view.hidden.filter((x) => x !== k) : [...view.hidden, k] })} />{columns[i].label}</label><button type="button" aria-label={'تقديم ' + columns[i].label} disabled={n === 0} onClick={() => move(k, -1)}>↑</button><button type="button" aria-label={'تأخير ' + columns[i].label} disabled={n === view.order.length - 1} onClick={() => move(k, 1)}>↓</button></div>; })}</div></div>
          <div className="gt-row"><button className="btn sm ghost" type="button" onClick={() => { setView(initial); setActive(''); setName(''); setPage(1); setSel(new Set()); }}>إعادة ضبط</button></div></div></details>
      {canXl && <button className="btn sm" type="button" disabled={exporting || !ordered.length} onClick={() => exportRows(false)}>{exporting ? 'جارٍ التجهيز…' : 'إكسل'}</button>}
      </div>
    </div>
    {selRows.length > 0 && <div className="grid-bulkbar noprint" role="region" aria-label="إجراءات على الصفوف المحددة"><b>{selRows.length} محدد</b>
      {bulk.map((b) => <a key={b.label} className={'btn sm' + (b.primary ? '' : ' ghost')} href={bulkHref(b)}>{b.label}</a>)}
      {canXl && <button type="button" className="btn sm ghost" onClick={() => exportRows(true)}>إكسل المحدد</button>}
      <button type="button" className="btn sm ghost" onClick={printSelected}>طباعة المحدد</button>
      <button type="button" className="btn sm ghost" onClick={() => setSel(new Set())}>إلغاء التحديد</button></div>}
    {view.filters.length > 0 && <div className="grid-filter-chips">{view.filters.map((f, i) => <span key={i}>{columns[index(f.column)]?.label} {OPS[f.op]} {f.value}<button type="button" className="noprint" aria-label={'حذف الشرط ' + (i + 1)} onClick={() => update({ filters: view.filters.filter((_, n) => n !== i) })}>×</button></span>)}</div>}
    <p className="grid-message noprint" role="status" aria-live="polite">{message}</p>
    <div className={'grid-body' + (peekRow ? ' with-peek' : '')}>
      <div className="tbl table-scroll" role="region" aria-label={label} tabIndex={0}><table id={id} className="smart-table"><caption className="sr-only">{label}</caption>
        <thead><tr>{canSelect && <th className="grid-check noprint"><input type="checkbox" aria-label="تحديد كل النتائج" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(ordered.map((r) => r.id)))} /></th>}
          {colCells((k, i, c) => <th key={k} scope="col" className={cls(c, k)} aria-sort={view.sort === k ? view.desc ? 'descending' : 'ascending' : undefined}>{c.sortable === false ? c.label : <button type="button" className="sort-head" onClick={() => update({ sort: k, desc: view.sort === k ? !view.desc : false })}>{c.label}<span aria-hidden="true">{view.sort === k ? view.desc ? ' ↓' : ' ↑' : ' ↕'}</span></button>}</th>)}
          {hasActions && <th className="noprint"><span className="sr-only">إجراءات</span></th>}</tr></thead>
        <tbody>{ordered.length ? body : <tr><td colSpan={totalCols} className="table-empty">لا توجد نتائج مطابقة.{(view.query || view.filters.length > 0) && <button type="button" className="btn sm ghost" onClick={() => update({ query: '', filters: [] })}>مسح البحث والشروط</button>}</td></tr>}</tbody>
        {summaryColumns.length > 0 && <tfoot><tr className="tot">{canSelect && <td className="noprint"></td>}{colCells((k, i, c) => <td key={k} className={(c.numeric ? 'n ' : '') + (view.hidden.includes(k) ? 'col-hidden' : '')}>{k === visible[0] && <span>{selRows.length ? `إجمالي المحدد (${selRows.length}) ` : 'إجمالي النتائج '}</span>}{summaryColumns.includes(i) && fmt(sumOf(selRows.length ? selRows : ordered, i))}</td>)}{hasActions && <td className="noprint"></td>}</tr></tfoot>}
      </table></div>
      {peekRow && <aside className="grid-peek noprint" aria-label="معاينة سريعة"><div className="grid-peek-head"><b>{peekRow.peekTitle ?? 'معاينة'}</b><button type="button" className="btn sm ghost" onClick={() => setPeek(null)} aria-label="إغلاق المعاينة">✕</button></div>
        <dl>{peekRow.peek?.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v || '—'}</dd></div>)}</dl>
        {peekRow.actions?.length ? <div className="grid-peek-actions">{peekRow.actions.slice(0, 3).map(([l, h], i) => <a key={h + l} className={'btn sm' + (i ? ' ghost' : '')} href={h}>{l}</a>)}</div> : null}</aside>}
    </div>
    <div className="table-pages noprint"><span role="status">{ordered.length ? `${start + 1}–${Math.min(start + size, ordered.length)}` : '0'} من {ordered.length} نتيجة{ordered.length !== rows.length ? ` (من أصل ${rows.length})` : ''}{grouped ? ' • التجميع يعرض كل النتائج في صفحة واحدة' : ''}</span>
      {!grouped && <><label>في الصفحة <select value={view.size} onChange={(e) => update({ size: Number(e.target.value) })}>{[15, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label><div className="pager-buttons"><button type="button" className="btn sm ghost" disabled={current === 1} onClick={() => setPage(current - 1)}>السابق</button><span>{current} / {pages}</span><button type="button" className="btn sm ghost" disabled={current >= pages} onClick={() => setPage(current + 1)}>التالي</button></div></>}</div>
    <p className="print-only table-hint">النتائج {ordered.length}{view.query ? ` • البحث: ${view.query}` : ''}{grouped ? ` • مجمّعة حسب ${columns[groupIdx].label}` : ''} • جميع صفحات النتائج بالأعمدة المختارة</p>
  </div>;
}
