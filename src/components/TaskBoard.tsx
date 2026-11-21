'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Ic } from './icons';
import { tafqit } from '@/lib/tafqit';
import SubmitButton from './SubmitButton';

import { recordTaskFollowUp, saveTaskWorkspace, toggleWorkTask } from '@/lib/task-actions';
import type { GTask } from '@/lib/tasks';
import { DEFAULT_TASK_VIEW, cleanTaskView, selectTasks, taskTotals, type TaskView, type TaskWorkspace } from '@/lib/task-view';

const PRIORITIES = [{ id: 'p1', title: 'أولوية عاجلة', note: 'ابدأ بالحالات الأكثر إلحاحًا', icon: 'fire' }, { id: 'p2', title: 'أولوية متوسطة', note: 'حالات تحتاج متابعة منتظمة', icon: 'clock' }, { id: 'p3', title: 'للمتابعة', note: 'استحقاقات وبيانات وأعمال أخرى', icon: 'eye' }];
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const date = (v: string | null | undefined, df: string) => { if (!v) return 'غير محدد'; const [y,m,d] = v.split('-'); return df === 'yyyy/MM/dd' ? `${y}/${m}/${d}` : df === 'dd-MM-yyyy' ? `${d}-${m}-${y}` : `${d}/${m}/${y}`; };
const TYPES = ['الكل', 'تحصيل', 'تجديد', 'مطابقة', 'توثيق', 'استحقاق', 'صيانة', 'اعتماد', 'بيانات', 'إيجار', 'يدوية'];

export default function TaskBoard({ tasks, canEdit, df, today, workspace, followToken }: { tasks: GTask[]; canEdit: boolean; df: string; today: string; workspace: TaskWorkspace; followToken: string }) {
  const [saved, setSaved] = useState(workspace);
  const [view, setView] = useState<TaskView>(() => workspace.views.find(x => x.id === workspace.selected)?.view || { ...DEFAULT_TASK_VIEW });
  const [viewId, setViewId] = useState(workspace.selected), [name, setName] = useState(''), [message, setMessage] = useState(''), [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null), [page, setPage] = useState(1);
  const rows = useMemo(() => selectTasks(tasks, view, today), [tasks, view, today]);
  const totals = taskTotals(rows), pages = Math.max(1, Math.ceil(rows.length / 18)), currentPage = Math.min(page, pages);
  const properties = useMemo(() => [...new Map(tasks.map(t => [t.propertyId || '__general', { id: t.propertyId || '__general', name: t.propertyId ? t.propertyName || t.prop : 'النطاق العام (بنك واعتمادات وتدقيق)' }])).values()].sort((a,b) => a.name.localeCompare(b.name, 'ar')), [tasks]);
  const detail = tasks.find(t => t.key === selected);
  useEffect(() => { if (selected) document.getElementById('work-task-details')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }, [selected]);
  const update = (patch: Partial<TaskView>) => { setView(v => ({ ...v, ...patch })); setPage(1); setSelected(null); };
  const resetFilters = () => update({ query: '', type: 'الكل', property: '', priority: '', status: 'open', timing: 'all' });
  async function persist(next: TaskWorkspace) {
    setSaving(true); setMessage('');
    try { const result = await saveTaskWorkspace(next); if (result.ok) setSaved(next); setMessage(result.message); return result.ok; }
    catch { setMessage('تعذر حفظ العرض. إعداداتك الحالية باقية على الشاشة؛ أعد المحاولة.'); return false; }
    finally { setSaving(false); }
  }
  async function saveView() {
    const label = name.trim() || saved.views.find(x => x.id === viewId)?.name;
    if (!label) { setMessage('اكتب اسمًا للعرض قبل الحفظ.'); return; }
    if (!viewId && saved.views.length >= 8) { setMessage('يمكن حفظ 8 عروض. احذف عرضًا أو حدّث عرضًا موجودًا.'); return; }
    const id = viewId || 'v' + Date.now().toString(36);
    const entry = { id, name: label.slice(0, 60), view: cleanTaskView(view) };
    const next: TaskWorkspace = { version: 1, selected: id, views: [...saved.views.filter(x => x.id !== id), entry] };
    if (await persist(next)) { setViewId(id); setName(entry.name); }
  }
  async function deleteView() {
    if (!viewId) return;
    const next: TaskWorkspace = { version: 1, selected: saved.selected === viewId ? '' : saved.selected, views: saved.views.filter(x => x.id !== viewId) };
    if (await persist(next)) { setViewId(''); setName(''); }
  }
  function openSaved(id: string) { setViewId(id); const item = saved.views.find(x => x.id === id); setName(item?.name || ''); setView(item ? { ...item.view } : { ...DEFAULT_TASK_VIEW }); setPage(1); setSelected(null); setMessage(''); }
  const pageClass = (task: GTask) => { const i = rows.indexOf(task); return i >= (currentPage - 1) * 18 && i < currentPage * 18 ? '' : ' work-page-hidden'; };
  function controls(task: GTask) { return <div className="work-actions noprint"><button type="button" className="btn sm ghost" aria-expanded={selected === task.key} aria-controls="work-task-details" onClick={() => setSelected(selected === task.key ? null : task.key)}>التفاصيل والإجراء</button>{canEdit && <form action={toggleWorkTask}><input type="hidden" name="key" value={task.key} /><button type="submit" className="work-done">{task.done ? 'إعادة لليوم' : task.type === 'يدوية' ? 'إنجاز المهمة' : 'تمت متابعتها اليوم'}</button></form>}</div>; }
  function card(task: GTask) { return <article className={'work-task ' + task.p + (task.done ? ' work-done-card' : '') + pageClass(task)} key={task.key}>
    <div className="work-task-top"><span className="work-type">{task.type}</span>{task.done && <span className="work-completed">متابعة منجزة اليوم</span>}</div>
    <h3><Link href={task.href}>{task.title}</Link></h3><div className="work-meta"><span><Ic n="bld" />{task.prop}</span>{view.owner && <span><Ic n="user" />الدور المقترح: {task.who || 'غير محدد'}</span>}</div>
    {view.description && task.desc && <p className="work-description">{task.desc}</p>}
    <div className="work-meta"><span>موعد المهمة: {date(task.due,df)}</span>{task.type === 'تحصيل' && <span>آخر متابعة للمستأجر: {task.last ? date(task.last,df) : 'لا توجد'}</span>}</div>
    <div className="work-task-bottom">{view.amounts && task.amount > 0 && <div className="work-amount"><small>{task.type === 'تحصيل' ? 'المتأخر في هذا العقار' : task.type === 'تجديد' ? 'الإيجار السنوي' : task.type === 'صيانة' ? 'التكلفة التقديرية' : 'المبلغ المرتبط'}</small><strong>{money(task.amount)} <small>ريال</small></strong></div>}{task.n ? <span className="work-count">{task.n} أقساط</span> : null}</div>
    {view.installments && task.inst && <details className="work-installments" open><summary>تفاصيل الأقساط</summary>{task.inst.map(u => <div key={u.unit}><b>{u.unit}</b>{u.rows.map(r => <div key={r.href}><Link href={r.href}>{date(r.due,df)}</Link>{view.amounts && <span>{money(r.amount)} ريال</span>}<small>تأخير {r.late} يومًا</small></div>)}</div>)}</details>}
    {view.amounts && task.amount > 0 && <small className="print-only">{tafqit(task.amount)}</small>}
    {controls(task)}
  </article>; }
  return <div className={'work-center' + (view.compact ? ' work-compact' : '') + (!view.amounts ? ' work-private' : '')}>
    {view.summary && <div className="work-summary"><div><span>النتائج الحالية</span><strong>{totals.count}</strong><small>من {tasks.length} مهمة متاحة</small></div><div><span>أولوية عاجلة</span><strong>{totals.urgent}</strong><small>ضمن النتائج غير المنجزة</small></div><div className="work-summary-money"><span>متأخرات التحصيل في النتائج</span><strong>{view.amounts ? money(totals.amount) : 'المبالغ مخفية'}</strong>{view.amounts && totals.amount > 0 && <small className="print-only">{tafqit(totals.amount)}</small>}<small>{view.amounts ? `ريال · ${totals.tenants} مستأجر · ${totals.installments} أقساط` : 'يشمل الإخفاء التفاصيل والطباعة'}</small></div></div>}
    <section className="work-toolbar noprint" aria-label="تصفية وتخصيص العمل">
      <div className="work-bar"><label className="work-search"><span className="sr-only">البحث</span><input type="search" value={view.query} placeholder="مستأجر، عقار، نوع أو وصف…" onChange={e => update({query:e.target.value})} /></label><div className="work-view-switch" aria-label="طريقة العرض">{([['board','لوحة الأولويات'],['list','قائمة'],['table','جدول']] as const).map(([id,label]) => <button key={id} type="button" aria-pressed={view.layout === id} className={view.layout === id ? 'on' : ''} onClick={() => update({ layout:id })}>{label}</button>)}</div></div>
      <div className="work-quick" aria-label="اختيارات سريعة"><button type="button" onClick={resetFilters}>كل العمل المفتوح</button><button type="button" onClick={() => { resetFilters(); update({type:'تحصيل'}); }}>التحصيل</button><button type="button" onClick={() => { resetFilters(); update({timing:'no-follow'}); }}>تحصيل بلا متابعة</button><button type="button" onClick={() => { resetFilters(); update({type:'تجديد'}); }}>التجديدات</button><button type="button" onClick={() => { resetFilters(); update({type:'صيانة'}); }}>الصيانة</button></div>
      <details className="work-more"><summary>فلاتر وعروض{(view.property || view.priority || view.timing !== 'all' || view.status !== 'open' || view.type !== 'الكل') ? <em>مفعّلة</em> : null}</summary><div className="work-more-in">
      <div className="work-filters"><label>العقار<select value={view.property} onChange={e => update({property:e.target.value})}><option value="">كل العقارات والنطاق العام</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>نوع العمل<select value={view.type} onChange={e => update({type:e.target.value})}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></label><label>الأولوية<select value={view.priority} onChange={e => update({priority:e.target.value})}><option value="">كل الأولويات</option>{PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>الموعد والمتابعة<select value={view.timing} onChange={e => update({timing:e.target.value as TaskView['timing']})}><option value="all">كل المواعيد</option><option value="today">موعد المهمة اليوم</option><option value="overdue">موعد المهمة قبل اليوم</option><option value="upcoming">موعد المهمة قادم</option><option value="no-follow">تحصيل بلا متابعة سابقة</option></select></label><label>حالة العرض<select value={view.status} onChange={e => update({status:e.target.value as TaskView['status']})}><option value="open">لم تنجز متابعتها اليوم</option><option value="done">منجزة المتابعة اليوم</option><option value="all">الكل</option></select></label></div>
      <div className="work-toolbar-head"><label>عروض حسابي<select value={viewId} onChange={e => openSaved(e.target.value)}><option value="">العرض الأساسي</option>{saved.views.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="work-view-name">اسم العرض<input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="مثل: تحصيل بلا متابعة" /></label><button className="btn sm" type="button" disabled={saving} onClick={saveView}>{saving ? 'جارٍ الحفظ…' : viewId ? 'تحديث العرض' : 'حفظ كعرض افتراضي'}</button>{viewId && <><button className="btn sm ghost" disabled={saving} onClick={() => { setViewId(''); setName(''); }}>نسخة جديدة</button><button className="btn sm ghost" disabled={saving} onClick={deleteView}>حذف العرض</button></>}</div>
      <p className="work-save-note">آخر عرض تحفظه يصبح افتراضيًا لحسابك. يمكنك حفظ حتى 8 عروض؛ التغييرات لا تُحفظ إلا بالضغط على الحفظ.</p>
      <details className="work-settings"><summary>التحكم في المعروض</summary><div>{([['amounts','إظهار المبالغ'],['summary','ملخص النتائج'],['description','وصف الحالة'],['owner','الدور المقترح'],['installments','تفاصيل الأقساط'],['compact','عرض مضغوط']] as const).map(([key,label]) => <label key={key}><input type="checkbox" checked={view[key]} onChange={e => update({[key]:e.target.checked})} />{label}</label>)}</div></details>
      </div></details>
    </section>
    <div className="work-message noprint" role="status" aria-live="polite">{message}</div>
    <div className="work-scope"><span>{rows.length} نتيجة من {tasks.length} مهمة{view.property && ` · ${properties.find(p => p.id === view.property)?.name || 'عقار غير متاح'}`}{view.type !== 'الكل' && ` · ${view.type}`}{view.priority && ` · ${PRIORITIES.find(x => x.id === view.priority)?.title}`}{view.query && ` · بحث: ${view.query}`}</span><span>{!view.amounts ? 'وضع إخفاء المبالغ مفعّل' : 'المجاميع تخص النتائج الحالية'} · الأولوية لا تعني موعد الاستحقاق</span></div>
    {!rows.length ? <div className="work-empty"><Ic n="tasks" /><h3>لا توجد مهام بهذا الاختيار</h3><p>جرّب إزالة بعض الفلاتر أو عرض كل العمل المفتوح.</p><button type="button" className="btn ghost noprint" onClick={resetFilters}>مسح الفلاتر</button></div> : view.layout === 'table' ? <div className="work-table-wrap"><table className="work-table"><thead><tr><th>الحالة</th><th>النوع / الأولوية</th><th>العقار</th><th>الموعد</th>{view.owner && <th>الدور المقترح</th>}{view.amounts && <th>المبلغ المرتبط</th>}<th className="noprint">الإجراء</th></tr></thead><tbody>{rows.map(t => <tr key={t.key} className={pageClass(t)}><td><Link href={t.href}>{t.title}</Link>{view.description && <small>{t.desc}</small>}{t.done && <small>منجزة المتابعة اليوم</small>}</td><td>{t.type}<small>{PRIORITIES.find(p => p.id === t.p)?.title}</small></td><td>{t.prop}</td><td>{date(t.due,df)}</td>{view.owner && <td>{t.who || 'غير محدد'}</td>}{view.amounts && <td className="n">{t.amount ? money(t.amount) : '—'}</td>}<td className="noprint">{controls(t)}</td></tr>)}</tbody></table></div> : view.layout === 'board' ? <div className="work-board">{PRIORITIES.map(p => { const group=rows.filter(t => t.p === p.id);return <section className={'work-lane '+p.id} key={p.id}><header><div><Ic n={p.icon} /><h3>{p.title}</h3><span>{group.length}</span></div><p>{p.note}</p></header>{group.length ? group.map(card) : <p className="work-lane-empty">لا حالات ضمن النتائج</p>}</section>; })}</div> : <div className="work-list">{rows.map(card)}</div>}
    {rows.length > 18 && <div className="work-pagination noprint"><span>صفحة {currentPage} من {pages} · الطباعة تشمل كل النتائج المفلترة</span><button type="button" disabled={currentPage<=1} onClick={() => setPage(currentPage-1)}>السابق</button><button type="button" disabled={currentPage>=pages} onClick={() => setPage(currentPage+1)}>التالي</button></div>}
    <section id="work-task-details" className="work-detail" hidden={!detail} aria-label="تفاصيل الحالة والإجراء">{detail && <><div className="work-detail-head"><div><span className="work-type">{detail.type} · {detail.prop}</span><h2>{detail.title}</h2></div><button type="button" className="btn sm ghost noprint" onClick={() => setSelected(null)}>إغلاق التفاصيل</button></div><p>{detail.desc}</p><div className="work-detail-facts"><span>موعد المهمة: {date(detail.due,df)}</span>{view.owner && <span>الدور المقترح: {detail.who || 'غير محدد'}</span>}{view.amounts && detail.amount > 0 && <strong>{detail.type === 'تحصيل' ? 'متأخرات هذا العقار: ' : 'المبلغ المرتبط: '}{money(detail.amount)} ريال</strong>}</div>
      {detail.inst && <div className="work-detail-installments">{detail.inst.map(u => <div key={u.unit}><h3>{u.unit}</h3>{u.rows.map(r => <div key={r.href}><Link href={r.href}>{date(r.due,df)}</Link><span>تأخير {r.late} يومًا</span>{view.amounts && <b>{money(r.amount)} ريال</b>}</div>)}</div>)}</div>}
      <div className="work-detail-links noprint"><Link className="btn" href={detail.href}>{detail.act}</Link>{detail.tenantId && <Link className="btn ghost" href={`/tenants/${detail.tenantId}#tab=followups`}>سجل المتابعة الكامل</Link>}</div>
      {canEdit && detail.tenantId && <details className="work-followup noprint" key={detail.key}><summary>تسجيل نتيجة متابعة من هنا</summary><p>تُحفظ في سجل المستأجر مع اسم العقار. تسجيل المتابعة لا يغلق الدين ولا يغيّر الرصيد.</p><form action={recordTaskFollowUp}><input type="hidden" name="task_key" value={detail.key} /><input type="hidden" name="token" value={followToken} /><div className="work-followup-fields"><label>النتيجة<select name="type" required><option>اتصال</option><option>لم يتم الرد</option><option>متابعة</option></select></label><label>موعد المتابعة التالية<input type="date" name="next_date" min={today} /></label><label className="work-note">النتيجة والخطوة التالية<textarea name="details" maxLength={2000} rows={3} required /></label></div><SubmitButton label="حفظ نتيجة المتابعة" /></form></details>}
    </>}</section>
    <p className="work-footnote print-only">إنجاز متابعة اليوم لا يعني تسوية الرصيد. إخفاء البيانات هنا تخصيص للعرض، وتظل صلاحيات البرنامج الحالية كما هي.</p>
  </div>;
}
