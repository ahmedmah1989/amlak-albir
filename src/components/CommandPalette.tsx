'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ic } from './icons';
type Item = { h: string; ic: string; l: string; g: string };
/** تطبيع عربي بسيط للبحث: يوحّد الهمزات والتاء المربوطة والألف المقصورة */
const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْـ]/g, '').trim();
/** بحث سريع وأوامر (Ctrl+K): الانتقال لأي شاشة، الإنشاء السريع، آخر السجلات، أو البحث في كل البيانات */
export default function CommandPalette({ links, onClose }: { links: Item[]; onClose: () => void }) {
  const [q, setQ] = useState(''), [i, setI] = useState(0); const r = useRouter(); const box = useRef<HTMLInputElement>(null);
  const uniq = useMemo(() => [...new Map(links.map((x) => [x.h + x.g, x])).values()], [links]);
  const items = useMemo(() => {
    const t = norm(q); const hit = t ? uniq.filter((x) => t.split(/\s+/).every((w) => norm(x.l + ' ' + x.g).includes(w))) : uniq.filter((x) => x.g !== 'الأخيرة' || true);
    const all: Item[] = [...(q.trim() ? [{ h: '/search?q=' + encodeURIComponent(q.trim()), ic: 'search', l: `بحث في كل البيانات عن «${q.trim()}»`, g: 'بحث' }] : []), ...hit];
    return all.slice(0, 40);
  }, [q, uniq]);
  useEffect(() => { box.current?.focus(); const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  useEffect(() => setI(0), [q]);
  const go = (x?: Item) => { if (!x) return; onClose(); r.push(x.h); };
  let lastG = '';
  return <div className="cmdk" role="dialog" aria-modal="true" aria-label="بحث سريع وأوامر" onClick={onClose}>
    <div className="cmdk-box" onClick={(e) => e.stopPropagation()}>
      <div className="cmdk-in"><Ic n="search" /><input ref={box} value={q} onChange={(e) => setQ(e.target.value)} placeholder="اكتب اسم شاشة، أو «سند»، أو اسم مستأجر…" aria-label="بحث"
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(0, n - 1)); } else if (e.key === 'Enter') { e.preventDefault(); go(items[i]); } }} /><kbd>Esc</kbd></div>
      <ul className="cmdk-list" role="listbox">{items.map((x, n) => { const head = x.g !== lastG ? x.g : null; lastG = x.g; return <li key={x.h + x.g + n} role="option" aria-selected={n === i}>
        {head && <div className="cmdk-g">{head}</div>}
        <button type="button" className={n === i ? 'on' : ''} onMouseEnter={() => setI(n)} onClick={() => go(x)}><Ic n={x.ic} /><span>{x.l}</span></button></li>; })}
        {!items.length && <li className="cmdk-none">لا نتائج. اضغط Enter بعد كتابة كلمة للبحث في كل البيانات.</li>}</ul>
      <div className="cmdk-foot">↑↓ للتنقل • Enter للفتح • Esc للإغلاق</div>
    </div></div>;
}
