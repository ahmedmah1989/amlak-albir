import type { ReactNode } from 'react';
/**
 * رأس موحد لصفحات التفاصيل: الحالة وأهم البيانات في سطر واحد، وزر رئيسي، وباقي الإجراءات مجمّعة في قائمة.
 * menu: [العنوان، الرابط] أو عنوان مجموعة بصيغة ['—', 'اسم المجموعة']
 */
export default function DetailHeader({ title, tags, facts, primary, menu = [], note }: {
  title: ReactNode; tags?: ReactNode; facts: [string, ReactNode][]; primary?: ReactNode; menu?: [string, string][]; note?: ReactNode }) {
  return (
    <div className="dhead noprint-actions">
      <div className="dhead-main">
        <div className="dhead-title"><h2>{title}</h2>{tags}</div>
        <dl className="dhead-facts">{facts.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v ?? '—'}</dd></div>)}</dl>
        {note}
      </div>
      {(primary || menu.length > 0) && <div className="dhead-acts noprint">
        {primary}
        {menu.length > 0 && <details className="quick-new dhead-menu"><summary className="btn ghost">إجراءات ▾</summary><div>
          {menu.map(([l, h], i) => l === '—' ? <span key={i} className="menu-group">{h}</span> : <a key={h + l} href={h}>{l}</a>)}</div></details>}
      </div>}
    </div>
  );
}
