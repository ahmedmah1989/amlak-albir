import Link from 'next/link';
import { money } from '@/lib/fmt';
import { USTATE, type UState, type unitStates } from '@/lib/unit-map';
/** خريطة الإشغال: مربع لكل وحدة ملوّن بحالتها، مجمّعة بالعقار */
export default function UnitMap({ units, grouped = true }: { units: ReturnType<typeof unitStates>; grouped?: boolean }) {
  const props = [...new Map(units.map((x) => [x.prop.id, x.prop])).values()];
  const legend = (Object.keys(USTATE) as UState[]).map((k) => [k, units.filter((x) => x.st === k).length] as const).filter(([, n]) => n);
  const tile = (x: (typeof units)[number]) => <Link key={x.u.id} href={x.cur ? `/contracts/${x.cur.id}` : `/units/${x.u.id}`} className={'um-t um-' + x.st} title={`${x.u.code} — ${USTATE[x.st]}${x.tenant ? ` — ${x.tenant}` : ''}`}>
    <b>{x.u.code}</b><span>{x.tenant || 'شاغرة'}</span>{x.st === 'arrears' ? <em>{money(x.arrears)}</em> : x.st === 'ending' ? <em>{x.left} يوماً</em> : x.st === 'expired' ? <em>منتهي</em> : null}</Link>;
  return <div className="um">
    <div className="um-legend">{legend.map(([k, n]) => <span key={k}><i className={'um-' + k} />{USTATE[k]} <b>{n}</b></span>)}</div>
    {grouped && props.length > 1 ? props.map((p) => { const us = units.filter((x) => x.prop.id === p.id); return <section key={p.id}><h3><Link href={`/properties/${p.id}`}>{p.short}</Link> <small>{us.filter((x) => x.cur).length} من {us.length} مؤجرة</small></h3><div className="um-grid">{us.map(tile)}</div></section>; })
      : <div className="um-grid">{units.map(tile)}</div>}
  </div>;
}
