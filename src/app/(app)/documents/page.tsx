import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Empty } from '@/components/ui';
import { missingDocs, expiringDocs } from '@/lib/docs';
import { parseFeatureCfg } from '@/lib/features';
import { date } from '@/lib/fmt';

const ENT: Record<string, string> = { tenant: 'مستأجر', contract: 'عقد', unit: 'وحدة', property: 'عقار', payment: 'سند', maintenance: 'صيانة' };
export default async function Documents({ searchParams }: { searchParams: { f?: string; q?: string; e?: string; c?: string } }) {
  const { db, a, org, asOf } = await ctx();
  if (!db.meta.features.doc_required) return <Page title="مركز المستندات" org={org} asOf={asOf}><Empty>الميزة غير مفعّلة. فعّلها من الإدارة ← الميزات.</Empty></Page>;
  const f = searchParams.f ?? 'missing', query = (searchParams.q ?? '').trim();
  const cfg = parseFeatureCfg(db.meta.settings);
  const owner = (e: string, id: string) => e === 'tenant' ? [a.T.get(id)?.name ?? '—', `/tenants/${id}`] : e === 'contract' ? (() => { const c = a.C.get(id); return [c ? `${a.U.get(c.unit_id)?.code} — ${a.T.get(c.tenant_id)?.name}` : '—', `/contracts/${id}`]; })()
    : e === 'unit' ? [a.U.get(id)?.code ?? '—', `/units/${id}`] : e === 'property' ? [a.P.get(id)?.name ?? '—', `/properties/${id}`] : e === 'payment' ? [db.payments.find((p) => p.id === id)?.receipt_no ?? '—', `/payments/${id}`]
    : e === 'valuation' ? (() => { const v = db.valuations.find((x) => x.id === id); return [v ? `تقييم ${a.P.get(v.property_id)?.short ?? ''}` : 'تقييم', v ? `/properties/${v.property_id}#tab=valuation` : '#']; })() : ['—', '#'];
  const miss = a.active.map((c) => ({ c, m: missingDocs(db, c, cfg.required_docs) })).filter((x) => x.m.length);
  const exp = expiringDocs(db, asOf, 60);
  const cats = [...new Set(db.attachments.map((x) => x.category ?? 'مستند'))].sort();
  const list = db.attachments.filter((x) => (!searchParams.e || x.entity === searchParams.e) && (!searchParams.c || (x.category ?? 'مستند') === searchParams.c)
    && (!query || [x.file_name, x.category, owner(x.entity, x.entity_id)[0]].some((v) => v?.includes(query))));
  const tab = (k: string, l: string) => <Link href={`?f=${k}`} className={f === k ? 'on' : ''}>{l}</Link>;
  return (
    <Page title="مركز المستندات" sub={`${db.attachments.length} مستنداً • ${miss.length} عقود ناقصة • ${exp.length} مستند ينتهي خلال 60 يوماً أو منتهٍ`} org={org} asOf={asOf} print>
      <div className="filters">{tab('missing', `النواقص (${miss.length})`)}{tab('expiring', `الانتهاءات (${exp.length})`)}{tab('all', `كل المستندات (${db.attachments.length})`)}</div>
      {f === 'missing' && <div className="card"><h2>العقود السارية الناقصة المستندات</h2>
        {!miss.length ? <Empty>كل العقود السارية مستوفية المتطلبات المحددة.</Empty> : <div className="tbl"><table><thead><tr><th>العقد</th><th>المستأجر</th><th>الناقص</th></tr></thead>
          <tbody>{miss.map(({ c, m }) => <tr key={c.id}><td><Link href={`/contracts/${c.id}`}>{a.P.get(c.property_id)?.short} — {a.U.get(c.unit_id)?.code}</Link></td><td>{a.T.get(c.tenant_id)?.name}</td>
            <td><div className="reqdocs">{m.map((x, i) => <Link key={i} className="tag t-warn" href={x.href}>{ENT[x.scope]}: {x.label}</Link>)}</div></td></tr>)}</tbody></table></div>}
        <p className="muted">المتطلبات تُعدَّل من الإدارة ← الميزات ← المستندات المطلوبة.</p></div>}
      {f === 'expiring' && <div className="card"><h2>مستندات تنتهي أو انتهت</h2>{!exp.length ? <Empty>لا توجد.</Empty> : <div className="tbl"><table><thead><tr><th>الجهة</th><th>المستند</th><th className="n">الانتهاء</th><th>الحالة</th></tr></thead>
        <tbody>{exp.map((d) => <tr key={d.key}><td><Link href={d.href}>{d.title}</Link></td><td>{d.what}</td><td className="n">{date(d.date)}</td><td>{d.days < 0 ? <Tag tone="bad">منتهٍ منذ {-d.days} يوماً</Tag> : <Tag tone={d.days <= 30 ? 'bad' : 'warn'}>بعد {d.days} يوماً</Tag>}</td></tr>)}</tbody></table></div>}</div>}
      {f === 'all' && <>
        <form method="get" className="filter-panel noprint"><input type="hidden" name="f" value="all" />
          <label className="fld"><span>بحث</span><input type="search" name="q" defaultValue={query} placeholder="اسم الملف أو المستأجر أو الوحدة" /></label>
          <label className="fld"><span>الجهة</span><select name="e" defaultValue={searchParams.e ?? ''}><option value="">الكل</option>{Object.entries(ENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="fld"><span>النوع</span><select name="c" defaultValue={searchParams.c ?? ''}><option value="">الكل</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
          <button className="btn sm" type="submit" style={{ alignSelf: 'flex-end' }}>بحث</button></form>
        <div className="card">{!list.length ? <Empty>لا توجد نتائج.</Empty> : <div className="tbl"><table><thead><tr><th>الملف</th><th>النوع</th><th>الجهة</th><th>صاحب المستند</th><th className="n">الرفع</th><th className="n">الانتهاء</th></tr></thead>
          <tbody>{list.map((x) => { const [nm, href] = owner(x.entity, x.entity_id); return <tr key={x.id}><td><a href={`/api/files/${x.id}`} target="_blank" rel="noreferrer">{x.file_name}</a></td><td>{x.category ?? '—'}</td><td>{ENT[x.entity] ?? x.entity}</td>
            <td><Link href={href}>{nm}</Link></td><td className="n">{date(String(x.created_at).slice(0, 10))}</td><td className="n">{x.expires_on ? date(x.expires_on) : '—'}</td></tr>; })}</tbody></table></div>}</div></>}
    </Page>
  );
}
