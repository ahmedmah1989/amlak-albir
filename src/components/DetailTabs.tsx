'use client';
import { useEffect, useId, useState, type ReactNode, type KeyboardEvent } from 'react';

type Tab = { id: string; label: string; content: ReactNode };
/** merge: دمج عدة تبويبات في تبويب واحد [المعرّف، العنوان، معرّفات التبويبات المدمجة] — الروابط القديمة (#tab=payments) تفتح التبويب المدمج */
export default function DetailTabs({ tabs: raw, defaultTab, merge = [] }: { tabs: Tab[]; defaultTab?: string; merge?: [string, string, string[]][] }) {
  const alias: Record<string, string> = {};
  const tabs: Tab[] = [];
  for (const t of raw) {
    const g = merge.find((m) => m[2].includes(t.id));
    if (!g) { tabs.push(t); continue; }
    alias[t.id] = g[0];
    if (tabs.some((x) => x.id === g[0])) continue;
    const parts = raw.filter((x) => g[2].includes(x.id));
    tabs.push({ id: g[0], label: g[1], content: <>{parts.map((x, i) => <div key={x.id} className="merged-part">{parts.length > 1 && <h3 className="merged-title" id={'part-' + x.id}>{x.label}</h3>}{x.content}</div>)}</> });
  }
  const base = useId();
  const fallback = tabs.find((t) => t.id === (alias[defaultTab ?? ''] ?? defaultTab))?.id ?? tabs[0]?.id;
  const [active, setActive] = useState(fallback);
  useEffect(() => {
    const sync = () => {
      // ‎#tab=… من الروابط، أو ?tab=… بعد الحفظ (إعادة التوجيه من الخادم لا تحمل علامة #)
      let id = new URLSearchParams(location.hash.slice(1)).get('tab') || new URLSearchParams(location.search).get('tab');
      if (!id && !defaultTab) { try { id = sessionStorage.getItem('amlak-tab:' + location.pathname); } catch {} }
      if (id && alias[id]) id = alias[id];
      setActive(tabs.some((t) => t.id === id) ? id! : fallback);
    };
    sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync);
  }, [fallback, defaultTab, tabs]);
  const choose = (id: string) => {
    setActive(id); history.replaceState(history.state, '', location.pathname + location.search + '#tab=' + encodeURIComponent(id));
    try { sessionStorage.setItem('amlak-tab:' + location.pathname, id); } catch {}
  };
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowLeft') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowRight') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); choose(tabs[next].id); document.getElementById(`${base}-tab-${tabs[next].id}`)?.focus();
  };
  return <div className="detail-tabs">
    <div role="tablist" aria-label="أقسام التفاصيل" className="detail-tabbar noprint">{tabs.map((tab, index) => <button type="button" key={tab.id} id={`${base}-tab-${tab.id}`} role="tab" aria-selected={active === tab.id}
      aria-controls={`${base}-panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1} onClick={() => choose(tab.id)} onKeyDown={(e) => navigate(e, index)}>{tab.label}</button>)}</div>
    {tabs.map((tab) => <section key={tab.id} role="tabpanel" id={`${base}-panel-${tab.id}`} aria-labelledby={`${base}-tab-${tab.id}`} tabIndex={0} className={'detail-panel' + (active === tab.id ? ' is-active' : '')}>
      <h2 className="print-only">{tab.label}</h2>{tab.content}
    </section>)}
  </div>;
}
