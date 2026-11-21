import Link from 'next/link';
import DetailHeader from '@/components/DetailHeader';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Btn, Kpi, Empty } from '@/components/ui';
import DetailTabs from '@/components/DetailTabs';
import { q } from '@/lib/db';
import { saveAsset, deleteAsset } from '@/lib/ops-actions';
import { date as fdate, money as fmoney } from '@/lib/fmt';
import Attachments from '@/components/Attachments';
import ChangeLog from '@/components/ChangeLog';
import { UnitCard, TenantCard } from '@/components/PartyCards';
import { money, date, CSTATUS, FREQ, ATT_CATS } from '@/lib/fmt';
import { daysBetween } from '@/lib/calc';
import { Form, F, Hidden } from '@/components/form';
import { saveSubunit, bulkSubunits, addMeterReading, chargeMeter } from '@/lib/actions4';

export default async function UnitPage({ params, searchParams }: { params: { id: string }; searchParams: { sub?: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const u = a.U.get(params.id); if (!u) notFound();
  const p = a.P.get(u.property_id)!;
  const cs = db.contracts.filter((c) => c.unit_id === u.id).sort((x, y) => y.start_date.localeCompare(x.start_date));
  const cur = cs.find((c) => c.status === 'active');
  const t = cur ? a.T.get(cur.tenant_id) : undefined;
  const rows = a.rows.filter((r) => r.contract.unit_id === u.id);
  const bal = rows.filter((r) => r.status === 'overdue').reduce((x, r) => x + r.balance, 0);
  const coll = rows.reduce((x, r) => x + r.paidTotal, 0);
  const mt = db.maintenance.filter((m) => m.unit_id === u.id);
  const F_ = db.meta.features;
  const subs = db.units.filter((x) => x.parent_id === u.id).sort((x, y) => x.code.localeCompare(y.code, 'ar', { numeric: true }));
  const occ = subs.filter((x) => (x.status ?? 'occupied') === 'occupied').length;
  const editS = searchParams.sub ? subs.find((x) => x.id === searchParams.sub) : undefined;
  const meters = db.meters.filter((m) => m.unit_id === u.id).sort((x, y) => y.read_on.localeCompare(x.read_on));
  const ST: Record<string, [string, string]> = { occupied: ['مشغولة', 'ok'], vacant: ['شاغرة', 'bad'], maintenance: ['صيانة', 'warn'], reserved: ['محجوزة', 'info'] };
  const docs = (e: string, id: string) => db.attachments.filter((x) => x.entity === e && x.entity_id === id).length;
  const assets = await q('select * from unit_assets where unit_id=$1 order by name', [u.id]);
  const insps = await q('select id, kind, date, contract_id from inspections where unit_id=$1 order by date desc', [u.id]);
  return (
    <Page title={`${p.short} — ${u.code}`} sub={`${u.unit_type ?? 'وحدة'}${cur ? ` • مؤجرة: ${t?.name}` : ' • شاغرة'}`} org={org} asOf={asOf} print back={[`/properties/${p.id}`, p.name]}>
      <DetailHeader title={`${p.short} — ${u.code}`} tags={<Tag tone={cur ? 'ok' : 'warn'}>{cur ? 'مؤجرة' : 'شاغرة'}</Tag>}
        facts={[['النوع', u.unit_type ?? '—'], ['الدور', u.floor ?? '—'], ['المساحة', u.area ? `${money(u.area)} م²` : '—'], ['المستأجر الحالي', t ? <Link href={`/tenants/${t.id}`}>{t.name}</Link> : '—'],
          ['نهاية العقد', cur ? date(cur.end_date) : '—'], ['الإيجار السنوي', cur ? money(cur.annual_rent) : '—'], ['عداد الكهرباء', u.elec_meter ?? '—'], ['عداد المياه', u.water_meter ?? '—']]}
        primary={canEdit ? (cur ? <Link className="btn" href={`/payments/new?tenant=${cur.tenant_id}&contract=${cur.id}`}>تسجيل سند قبض</Link> : <Link className="btn" href={`/contracts/new?property=${p.id}&unit=${u.id}`}>تأجير الوحدة</Link>) : undefined}
        menu={[...(cur ? [['فتح العقد الساري', `/contracts/${cur.id}`], ['تجديد العقد', `/contracts/${cur.id}/renew`]] as [string, string][] : []), ...(canEdit ? [['تعديل بيانات الوحدة', `/properties/${p.id}?unit=${u.id}#tab=units`], ['طلب صيانة', `/maintenance/new?property=${p.id}&unit=${u.id}`]] as [string, string][] : []), ['العقار', `/properties/${p.id}`], ['كل وحدات العقار', `/units?p=${p.id}`]]} />
      <div className="kpis">
        <Kpi l="الحالة" v={cur ? 'مؤجرة' : 'شاغرة'} tone={cur ? 'info' : 'warn'} s={cur ? `حتى ${date(cur.end_date)} (${daysBetween(asOf, cur.end_date)} يوماً)` : 'لا يوجد عقد ساري'} />
        <Kpi l="الإيجار السنوي الحالي" v={cur ? money(cur.annual_rent) : '—'} unit={cur ? 'ريال' : ''} s={cur ? FREQ[cur.frequency ?? ''] : undefined} />
        <Kpi tone="bad" l="متأخرات على الوحدة" v={money(bal)} unit="ريال" />
        <Kpi l="إجمالي المحصّل تاريخياً" v={money(coll)} unit="ريال" s={`${cs.length} عقود`} />
      </div>
      <DetailTabs tabs={[
        { id: 'overview', label: 'البيانات', content: <>
          <UnitCard u={u} p={p} docs={docs('unit', u.id)} edit={canEdit} />
          {cur && t ? <TenantCard t={t} today={asOf} docs={docs('tenant', t.id)} edit={canEdit} /> : <p className="note warn">الوحدة شاغرة حالياً.</p>}
        </> },
        { id: 'contracts', label: `العقود (${cs.length})`, content: <div className="card">{!cs.length ? <Empty>لا توجد عقود على هذه الوحدة.</Empty> : <div className="tbl"><table>
          <thead><tr><th>المستأجر</th><th>النشاط</th><th className="n">البداية</th><th className="n">النهاية</th><th className="n">الإيجار</th><th>الحالة</th><th>رقم العقد</th></tr></thead>
          <tbody>{cs.map((c) => <tr key={c.id}><td><Link href={`/contracts/${c.id}`}>{a.T.get(c.tenant_id)?.name}</Link></td><td>{c.trade_name ?? '—'}</td><td className="n">{date(c.start_date)}</td><td className="n">{date(c.end_date)}</td>
            <td className="n">{money(c.annual_rent)}</td><td><Tag tone={c.status === 'active' ? 'ok' : 'mute'}>{CSTATUS[c.status]}</Tag></td><td dir="ltr">{c.contract_no ?? '—'}</td></tr>)}</tbody></table></div>}</div> },
        { id: 'maintenance', label: `الصيانة (${mt.length})`, content: <div className="card">{!mt.length ? <Empty>لا توجد طلبات صيانة.</Empty> : <ul className="list">{mt.map((m) => <li key={m.id}><Link href={`/maintenance/${m.id}`}>{m.title}</Link><span className="muted">{date(m.opened_on)} • {m.status}</span><b className="n">{money(m.cost ?? m.est_cost)}</b></li>)}</ul>}
          {canEdit && <p><Btn href={`/maintenance/new?property=${p.id}&unit=${u.id}`} kind="ghost">＋ طلب صيانة</Btn></p>}</div> },
        ...(F_.units_split && !u.parent_id ? [{ id: 'subunits', label: `الوحدات الفرعية (${subs.length})`, content: <>
          <div className="kpis"><Kpi l="الوحدات الفرعية" v={String(subs.length)} /><Kpi tone="info" l="المشغولة" v={String(occ)} s={subs.length ? `${Math.round((occ / subs.length) * 100)}% إشغال` : undefined} />
            <Kpi tone="warn" l="الشاغرة" v={String(subs.filter((x) => x.status === 'vacant').length)} /><Kpi l="مجموع الإيجار الشهري المسجل" v={money(subs.reduce((x, s) => x + (s.monthly_rent ?? 0), 0))} unit="ريال" /></div>
          <div className="card">{!subs.length ? <Empty>لا توجد وحدات فرعية. أضفها دفعة واحدة أو فردياً.</Empty> : <div className="tbl"><table><thead><tr><th>الوحدة</th><th>النوع</th><th>الدور</th><th>الغرف</th><th className="n">المساحة</th><th>الشاغل</th><th className="n">الإيجار الشهري</th><th>الحالة</th>{canEdit && <th></th>}</tr></thead>
            <tbody>{subs.map((x) => <tr key={x.id}><td>{x.code}</td><td>{x.unit_type ?? '—'}</td><td>{x.floor ?? '—'}</td><td>{x.rooms ?? '—'}</td><td className="n">{x.area ?? '—'}</td><td>{x.occupant ?? '—'}</td><td className="n">{money(x.monthly_rent)}</td>
              <td><Tag tone={ST[x.status ?? 'occupied']?.[1] ?? 'mute'}>{ST[x.status ?? 'occupied']?.[0] ?? x.status}</Tag></td>{canEdit && <td><Link className="btn sm ghost" href={`?sub=${x.id}#tab=subunits`}>تعديل</Link></td>}</tr>)}</tbody></table></div>}</div>
          {canEdit && <><details className="box" open={!!editS}><summary>{editS ? `تعديل: ${editS.code}` : 'إضافة وحدة فرعية'}</summary><div className="in"><Form action={saveSubunit}><Hidden n="parent_id" v={u.id} />{editS && <Hidden n="id" v={editS.id} />}
            <F label="الرقم/الاسم" name="code" req def={editS?.code} /><F label="النوع" name="unit_type" def={editS?.unit_type ?? 'شقة سكنية'} opts={['شقة سكنية', 'غرفة', 'محل', 'مكتب', 'مستودع', 'أخرى'].map((v) => [v, v])} />
            <F label="الدور" name="floor" def={editS?.floor} /><F label="الغرف" name="rooms" def={editS?.rooms} /><F label="المساحة م²" name="area" type="number" def={editS?.area} />
            <F label="الشاغل" name="occupant" def={editS?.occupant} /><F label="الإيجار الشهري" name="monthly_rent" type="number" def={editS?.monthly_rent} />
            <F label="الحالة" name="status" req def={editS?.status ?? 'occupied'} opts={Object.entries(ST).map(([k, v]) => [k, v[0]])} /><F label="ملاحظة" name="note" def={editS?.note} wide /></Form></div></details>
          <details className="box"><summary>إضافة وحدات فرعية دفعة واحدة</summary><div className="in"><Form action={bulkSubunits} submit="إنشاء"><Hidden n="parent_id" v={u.id} />
            <F label="العدد" name="count" type="number" req def={10} min="1" max="200" /><F label="البادئة" name="prefix" def="شقة" req /><F label="يبدأ الترقيم من" name="start" type="number" def={1} />
            <F label="النوع" name="unit_type" def="شقة سكنية" opts={['شقة سكنية', 'غرفة', 'محل', 'مكتب'].map((v) => [v, v])} /></Form></div></details></>}
        </> }] : []),
        ...(F_.meters ? [{ id: 'meters', label: `العدادات (${meters.length})`, content: <>
          <div className="card"><h2>القراءات</h2>{!meters.length ? <Empty>لا توجد قراءات.</Empty> : <div className="tbl"><table className="meter-grid"><thead><tr><th className="n">التاريخ</th><th>العداد</th><th className="n">القراءة</th><th className="n">الاستهلاك</th><th className="n">التعرفة</th><th className="n">المبلغ</th><th>التحميل</th></tr></thead>
            <tbody>{meters.map((m) => <tr key={m.id}><td className="n">{date(m.read_on)}</td><td>{m.kind === 'elec' ? 'كهرباء' : 'مياه'}</td><td className="n">{m.reading}</td><td className="n">{m.consumption ?? 'بداية'}</td><td className="n">{m.rate ?? '—'}</td><td className="n">{money(m.amount)}</td>
              <td>{m.charged ? <Link href={`/installments/${m.installment_id}`}><Tag tone="ok">حُمّل على المستأجر</Tag></Link> : canEdit && m.amount && cur ? <form action={chargeMeter} className="inl"><Hidden n="id" v={m.id} /><button className="btn sm ghost" type="submit">تحميل على المستأجر</button></form> : '—'}</td></tr>)}</tbody></table></div>}</div>
          {canEdit && <details className="box" open={!meters.length}><summary>تسجيل قراءة</summary><div className="in"><Form action={addMeterReading} submit="حفظ القراءة"><Hidden n="unit_id" v={u.id} />
            <F label="العداد" name="kind" req def="elec" opts={[['elec', `كهرباء ${u.elec_meter ?? ''}`], ['water', `مياه ${u.water_meter ?? ''}`]]} /><F label="تاريخ القراءة" name="read_on" type="date" req def={asOf} max={asOf} />
            <F label="القراءة" name="reading" type="number" req min="0" /><F label="التعرفة (اتركها للافتراضي)" name="rate" type="number" />
            <label className="fld"><span><input type="checkbox" name="reset" /> عداد جديد / تصفير (تبدأ القياس من جديد)</span></label><F label="ملاحظة" name="note" wide /></Form></div></details>}
        </> }] : []),
        { id: 'assets', label: `الأصول والمحاضر (${assets.length + insps.length})`, content: <>
          <div className="card"><h2>أصول وتجهيزات الوحدة <small>تدخل تلقائياً في محاضر الفحص</small></h2><div className="tbl"><table><thead><tr><th>الأصل</th><th className="n">العدد</th><th>الماركة / الرقم</th><th>الحالة</th><th className="n">التكلفة</th><th /></tr></thead><tbody>
            {assets.map((x) => <tr key={x.id}><td>{x.name}{x.notes && <div className="cell-sub">{x.notes}</div>}</td><td className="n">{x.qty}</td><td>{[x.brand, x.serial].filter(Boolean).join(' • ') || '—'}</td><td>{x.condition}</td><td className="n">{fmoney(x.cost)}</td>
              <td>{canEdit && <form action={deleteAsset} className="inline"><input type="hidden" name="id" value={x.id} /><input type="hidden" name="unit_id" value={u.id} /><button className="btn sm ghost danger" type="submit">حذف</button></form>}</td></tr>)}
            {!assets.length && <tr><td colSpan={6} className="muted">لا توجد أصول مسجلة (مكيفات، سخانات، أجهزة مطبخ…).</td></tr>}</tbody></table></div>
            {canEdit && <form action={saveAsset} className="inl"><input type="hidden" name="unit_id" value={u.id} /><input className="inp" name="name" placeholder="الأصل (مثل: مكيف سبليت)" required /><input className="inp" name="qty" type="number" min={1} defaultValue={1} style={{ width: '5rem' }} /><input className="inp" name="brand" placeholder="الماركة" /><input className="inp" name="serial" placeholder="الرقم التسلسلي" dir="ltr" /><select className="inp" name="condition"><option>جيد</option><option>متوسط</option><option>يحتاج صيانة</option></select><input className="inp" name="cost" placeholder="التكلفة" dir="ltr" /><button className="btn sm" type="submit">إضافة</button></form>}</div>
          <div className="card"><h2>محاضر الفحص</h2>{insps.length ? <ul className="list">{insps.map((x) => <li key={x.id}><a href={`/inspections/${x.id}`}>{x.kind === 'move_in' ? 'محضر استلام' : 'محضر إخلاء'} — {fdate(String(x.date))}</a></li>)}</ul> : <p className="muted">لا توجد محاضر. تُنشأ من صفحة العقد ← إجراءات.</p>}</div></> },
        { id: 'documents', label: `المستندات (${docs('unit', u.id)})`, content: <Attachments entity="unit" id={u.id} items={db.attachments} back={`/units/${u.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={ATT_CATS.unit} title="مستندات وصور الوحدة" /> },
        { id: 'changes', label: 'سجل التغييرات', content: <ChangeLog entity="unit" id={u.id} /> },
      ]} />
    </Page>
  );
}
