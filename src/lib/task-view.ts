import { normalizeSearch } from './table-view';
import type { GTask } from './tasks';

export type TaskView = { query: string; type: string; property: string; priority: string; status: 'open' | 'done' | 'all'; timing: 'all' | 'today' | 'overdue' | 'upcoming' | 'no-follow'; layout: 'board' | 'list' | 'table'; amounts: boolean; summary: boolean; description: boolean; owner: boolean; installments: boolean; compact: boolean };
export type SavedTaskView = { id: string; name: string; view: TaskView };
export type TaskWorkspace = { version: 1; selected: string; views: SavedTaskView[] };
export const DEFAULT_TASK_VIEW: TaskView = { query: '', type: 'الكل', property: '', priority: '', status: 'open', timing: 'all', layout: 'board', amounts: true, summary: true, description: true, owner: false, installments: false, compact: false };
const text = (x: unknown, max: number) => typeof x === 'string' ? x.trim().slice(0, max) : '';
export function cleanTaskView(raw: unknown): TaskView {
  const v = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const d = { ...DEFAULT_TASK_VIEW };
  for (const k of ['query', 'type', 'property'] as const) if (typeof v[k] === 'string') d[k] = text(v[k], 150);
  if (['', 'p1', 'p2', 'p3'].includes(String(v.priority))) d.priority = String(v.priority);
  if (['open', 'done', 'all'].includes(String(v.status))) d.status = v.status as TaskView['status'];
  if (['all', 'today', 'overdue', 'upcoming', 'no-follow'].includes(String(v.timing))) d.timing = v.timing as TaskView['timing'];
  if (['board', 'list', 'table'].includes(String(v.layout))) d.layout = v.layout as TaskView['layout'];
  for (const k of ['amounts', 'summary', 'description', 'owner', 'installments', 'compact'] as const) if (typeof v[k] === 'boolean') d[k] = v[k] as boolean;
  return d;
}
export function cleanTaskWorkspace(raw: unknown): TaskWorkspace {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const views: SavedTaskView[] = [];
  if (o.version === 1 && Array.isArray(o.views)) for (const v of o.views.slice(0, 8)) {
    if (!v || typeof v !== 'object') continue;
    const id = text(v.id, 70), name = text(v.name, 60);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !name || views.some(x => x.id === id)) continue;
    views.push({ id, name, view: cleanTaskView(v.view) });
  }
  return { version: 1, selected: views.some(x => x.id === o.selected) ? String(o.selected) : '', views };
}
export function workspaceFromPrefs(prefs: string): TaskWorkspace {
  try { return cleanTaskWorkspace(JSON.parse(prefs || '{}').task_workspace); } catch { return cleanTaskWorkspace(null); }
}
export function selectTasks(tasks: GTask[], view: TaskView, today: string): GTask[] {
  const query = normalizeSearch(view.query);
  return tasks.filter(t => (!view.property || (t.propertyId || '__general') === view.property) && (view.type === 'الكل' || t.type === view.type)
    && (!view.priority || t.p === view.priority) && (view.status === 'all' || (view.status === 'done' ? !!t.done : !t.done))
    && (view.timing === 'all' || (view.timing === 'no-follow' ? t.type === 'تحصيل' && !t.last : !!t.due && (view.timing === 'today' ? t.due === today : view.timing === 'overdue' ? t.due < today : t.due > today)))
    && normalizeSearch([t.title, t.desc, t.prop, t.who].join(' ')).includes(query));
}
export function taskTotals(tasks: GTask[]) {
  const collection = tasks.filter(t => t.type === 'تحصيل' && !t.done);
  return { count: tasks.length, urgent: tasks.filter(t => t.p === 'p1' && !t.done).length, amount: Math.round(collection.reduce((s, t) => s + t.amount, 0) * 100) / 100,
    tenants: new Set(collection.map(t => t.tenantId || t.key)).size, installments: collection.reduce((s, t) => s + (t.n || 0), 0) };
}
