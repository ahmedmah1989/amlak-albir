import Link from 'next/link';
import { date } from '@/lib/fmt';
import { TKIND, type TEvent } from '@/lib/timeline';
/** عرض الخط الزمني مجمّعاً بالشهر، مع فلتر سريع بالنوع عبر رابط الصفحة */
export default function Timeline({ events, kind, base }: { events: TEvent[]; kind?: string; base: string }) {
  const kinds = [...new Set(events.map((e) => e.k))];
  const list = kind ? events.filter((e) => e.k === kind) : events;
  const months = [...new Set(list.map((e) => e.d.slice(0, 7)))];
  const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  return <div className="card tline">
    <div className="chips noprint"><Link href={`${base}&tab=timeline`} className={'chip' + (!kind ? ' on' : '')} scroll={false}>الكل <i>{events.length}</i></Link>{kinds.map((k) => <Link key={k} href={`${base}&tab=timeline&tk=${k}`} scroll={false} className={'chip' + (kind === k ? ' on' : '')}>{TKIND[k]} <i>{events.filter((e) => e.k === k).length}</i></Link>)}</div>
    {!list.length && <p className="muted empty">لا أحداث بعد.</p>}
    {months.map((m) => <section key={m}><h3>{MON[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</h3><ol>{list.filter((e) => e.d.startsWith(m)).map((e, i) => <li key={i} className={'tl-' + e.tone}>
      <span className="tl-d">{date(e.d)}</span><span className="tl-k">{TKIND[e.k]}</span>
      <div className="tl-b">{e.href ? <Link href={e.href}>{e.t}</Link> : <b>{e.t}</b>}{e.s && <small>{e.s}</small>}</div></li>)}</ol></section>)}
  </div>;
}
