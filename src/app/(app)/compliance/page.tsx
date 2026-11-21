import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi } from '@/components/ui';
import { q } from '@/lib/db';
import { licState, LICENSE_KINDS } from '@/lib/ops';
import LicenseTable from '@/components/LicenseTable';
import LicenseForm from '@/components/LicenseForm';
export const dynamic = 'force-dynamic';
/** الامتثال النظامي: الرخص والشهادات والوثائق لكل عقار بتواريخ انتهائها */
export default async function Compliance({ searchParams }: { searchParams: { f?: string; p?: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const all = await q('select * from licenses order by expiry_date nulls last');
  const st = (l: Record<string, any>) => licState(l.expiry_date ? String(l.expiry_date) : null)[1];
  const f = searchParams.f ?? '', pid = searchParams.p ?? '';
  const rows = all.filter((l) => (!f || st(l) === f) && (!pid || l.property_id === pid));
  const files = Object.fromEntries(db.attachments.filter((x) => x.entity === 'license').reduce((m, x) => m.set(x.entity_id, (m.get(x.entity_id) ?? 0) + 1), new Map<string, number>()));
  const missing = db.properties.map((p) => ({ p, miss: ['رخصة البلدية (التشغيل)', 'شهادة الدفاع المدني', 'وثيقة التأمين'].filter((k) => !all.some((l) => l.property_id === p.id && l.kind === k)) })).filter((x) => x.miss.length);
  const qs = (o: Record<string, string>) => '?' + new URLSearchParams(Object.entries({ f, p: pid, ...o }).filter(([, v]) => v)).toString();
  return (
    <Page title="الامتثال النظامي" sub="الرخص والشهادات ووثائق التأمين لكل عقار، بتنبيه قبل انتهائها بـ 60 يوماً." org={org} asOf={asOf} print>
      <div className="kpis"><Kpi tone="bad" l="منتهية" v={String(all.filter((l) => st(l) === 'bad').length)} href={qs({ f: 'bad' })} /><Kpi tone="warn" l="تنتهي خلال 60 يوماً" v={String(all.filter((l) => st(l) === 'warn').length)} href={qs({ f: 'warn' })} />
        <Kpi l="سارية" v={String(all.filter((l) => st(l) === 'ok').length)} href={qs({ f: 'ok' })} /><Kpi tone={missing.length ? 'warn' : ''} l="عقارات ينقصها مستند أساسي" v={String(missing.length)} s="البلدية، الدفاع المدني، التأمين" /></div>
      <div className="filters noprint"><Link href={qs({ p: '' })} className={!pid ? 'on' : ''}>كل العقارات</Link>{db.properties.map((p) => <Link key={p.id} href={qs({ p: p.id })} className={pid === p.id ? 'on' : ''}>{p.short}</Link>)}</div>
      <div className="card"><LicenseTable rows={rows} props={a.P} back={'/compliance' + qs({})} isAdmin={isAdmin} files={files} /></div>
      {missing.length > 0 && <details className="alert warn"><summary><b>مستندات أساسية غير مسجلة في {missing.length} عقار</b></summary><ul>{missing.map((x) => <li key={x.p.id}><Link href={`/properties/${x.p.id}?tab=compliance`}>{x.p.short}</Link>: {x.miss.join('، ')}</li>)}</ul></details>}
      {canEdit && <details className="box noprint" open={!all.length}><summary>إضافة مستند نظامي</summary><div className="in"><LicenseForm props={db.properties} back="/compliance" /></div></details>}
      <p className="muted">الأنواع المتاحة: {LICENSE_KINDS.join('، ')}.</p>
    </Page>
  );
}
