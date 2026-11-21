import Link from 'next/link';
import ChangeLog from '@/components/ChangeLog';
import FileFields from '@/components/FileFields';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Btn, Empty } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import { saveUnit, deleteUnit } from '@/lib/actions';
import { money, date, hijri, pct, FREQ, CSTATUS, ATT_CATS } from '@/lib/fmt';
import Attachments from '@/components/Attachments';
import DetailTabs from '@/components/DetailTabs';
import { Ic } from '@/components/icons';
import ValuationPanel from '@/components/ValuationPanel';
import DetailHeader from '@/components/DetailHeader';
import UnitMap from '@/components/UnitMap';
import LicenseTable from '@/components/LicenseTable';
import LicenseForm from '@/components/LicenseForm';
import { q as dq } from '@/lib/db';
import { unitStates } from '@/lib/unit-map';
import { confirmPropertyData, deleteProvisionalProperty } from '@/lib/actions5';
import { LAND_BASIS_LABEL } from '@/lib/fmt';

function tiles(code: string) {
  const nums = code.match(/\d+/g)?.map(Number) ?? [];
  if (/شق/.test(code) && nums.length === 1 && nums[0] > 1 && nums[0] <= 80) return { kind: 'apt' as const, labels: Array.from({ length: nums[0] }, () => '') };
  if (/فتح|محل|معرض/.test(code)) { if (nums.length >= 2 && /-/.test(code) && nums.length === 2 && nums[1] - nums[0] > 1) return { kind: 'shop' as const, labels: Array.from({ length: nums[1] - nums[0] + 1 }, (_, i) => String(nums[0] + i)) }; return { kind: 'shop' as const, labels: nums.length ? nums.map(String) : [code] }; }
  if (/شق/.test(code)) return { kind: 'apt' as const, labels: [''] };
  return { kind: 'whole' as const, labels: [code] };
}
export default async function PropertyPage({ params, searchParams }: { params: { id: string }; searchParams: { unit?: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const s = a.propStats.find((x) => x.p.id === params.id); if (!s) notFound();
  const p = s.p;
  const cs = db.contracts.filter((c) => c.property_id === p.id);
  const active = cs.filter((c) => c.status === 'active');
  const past = cs.filter((c) => c.status !== 'active').sort((x, y) => y.start_date.localeCompare(x.start_date));
  const lease = s.units.filter((u) => u.kind === 'lease'), subs = s.units.filter((u) => u.kind === 'subunit');
  const bal = (cid: string, st: string) => a.rows.filter((r) => r.contract_id === cid && r.status === st).reduce((x, r) => x + r.balance, 0);
  const editU = searchParams.unit ? db.units.find((u) => u.id === searchParams.unit) : undefined;
  const exp = db.expenses.filter((e) => e.property_id === p.id);
  const notes = db.notes.filter((n) => n.property_id === p.id && n.status === 'open');
  const lics = await dq('select * from licenses where property_id=$1 order by expiry_date nulls last', [p.id]);
  const licFiles = Object.fromEntries(db.attachments.filter((x) => x.entity === 'license').reduce((m, x) => m.set(x.entity_id, (m.get(x.entity_id) ?? 0) + 1), new Map<string, number>()));
  return (
    <Page title={p.name} sub={`${p.location ?? ''} • ${p.ownership ?? ''}`} org={org} asOf={asOf} print sig back={['/properties', 'العقارات']}
>
      <DetailHeader title={p.name} tags={<>{p.data_status === 'provisional' && <Tag tone="est">بيانات مؤقتة</Tag>}<Tag tone={s.idle ? 'bad' : 'ok'}>{s.idle ? 'بلا دخل' : `${active.length} عقود سارية`}</Tag></>}
        facts={[['النوع', p.type ?? '—'], ['الملكية', p.ownership ?? '—'], ['الوحدات', `${lease.length} (${lease.filter((u) => active.some((c) => c.unit_id === u.id)).length} مؤجرة)`], ['الإشغال', lease.length ? `${Math.round((lease.filter((u) => active.some((c) => c.unit_id === u.id)).length / lease.length) * 100)}%` : '—'],
          ['القيمة الحالية', s.bv ? money(s.bv) : 'غير مدرجة'], ['الإيجار السنوي', money(s.rent)], ['العائد الإجمالي', s.yield == null ? '—' : pct(s.yield)], ['أقرب نهاية عقد', date(s.nextEnd)]]}
        primary={canEdit ? <Link className="btn" href={`/contracts/new?property=${p.id}`}>عقد جديد</Link> : undefined}
        menu={[...(isAdmin ? [['تعديل بيانات العقار', `/properties/${p.id}/edit`], ['تسجيل إعادة تقييم', `/properties/${p.id}?tab=valuation`]] as [string, string][] : []), ['كل الوحدات', `/units?p=${p.id}`], ['العقود', `/contracts?p=${p.id}`],
          ['—', 'تقارير العقار'], ['الإشغال والشواغر', `/reports/occupancy?p=${p.id}`], ['الأداء والعائد', `/reports/performance?p=${p.id}`], ['الإيرادات الشهرية', `/reports/revenue?p=${p.id}`], ['المتأخرات', `/reports/arrears?p=${p.id}`], ['المصروفات', `/reports/expenses?p=${p.id}`]]} />
      {p.data_status === 'provisional' && <div className="note warn provisional-banner">
        <b>بيانات مؤقتة — قيد التأكيد.</b> {p.data_source ?? 'استُوردت من ملف خارجي'}. راجع الوحدات والعقود والأقساط والقيمة، ثم اعتمدها. الأقساط غير المؤكدة لا تُحسب ضمن المتأخرات المؤكدة.
        {isAdmin && <div className="provisional-actions noprint">
          <form action={confirmPropertyData}><input type="hidden" name="property_id" value={p.id} /><button className="btn sm" type="submit">✓ اعتماد بيانات العقار</button></form>
          <details className="inline-confirm"><summary className="btn sm ghost">حذف العقار المؤقت</summary>
            <form action={deleteProvisionalProperty}><input type="hidden" name="property_id" value={p.id} />
              <label className="fld"><span>يُحذف العقار ووحداته وعقوده وأقساطه. للتأكيد اكتب: <b>{p.short}</b></span><input name="confirm" required autoComplete="off" /></label>
              <button className="btn sm danger" type="submit">حذف نهائي</button></form></details>
        </div>}</div>}
      <DetailTabs defaultTab={editU ? 'units' : 'overview'} merge={[['ops', 'التشغيل (الصيانة والمصروفات)', ['maintenance', 'expenses']]]} tabs={[
        { id: 'overview', label: 'نظرة عامة', content: <>
      <div className="kpis">
        <div className="kpi"><div className="l">الإيجار السنوي الحالي</div><div className="v">{money(s.rent)}<small> ريال</small></div></div>
        <div className="kpi bad"><div className="l">المتأخرات المؤكدة</div><div className="v">{money(s.arrears)}<small> ريال</small></div></div>
        <div className="kpi"><div className="l">مجموعات التأجير</div><div className="v">{lease.length}</div><div className="s">{active.length} عقود سارية</div></div>
        <div className="kpi"><div className="l">مصروفات {a.year}</div><div className="v">{money(s.expYear)}<small> ريال</small></div></div>
      </div>
      {lease.length > 0 && <div className="card"><h2>خريطة الوحدات <small><Link href={`/units?p=${p.id}&view=map`}>كل الوحدات ←</Link></small></h2><UnitMap units={unitStates(db, a, p.id)} grouped={false} /></div>}      <div className="card"><div className="facts">
        <div><span>نوع العقار</span><b>{p.type ?? '—'}</b></div><div><span>رقم الصك</span><b>{p.deed_no ?? 'غير مسجل'}</b></div>
        <div><span>قيمة الأرض</span><b>{p.land_basis === 'leased' ? 'أرض مستأجرة — لا تُقيَّم' : money(p.land_value)}</b></div><div><span>قيمة المبنى</span><b>{p.land_basis === 'land_only' ? 'أرض فضاء' : money(p.building_value)}</b></div>
        <div><span>القيمة الحالية</span><b>{s.bv ? money(s.bv) : 'غير مدرجة'} <a className="noprint" href="#tab=valuation">السجل</a></b></div><div><span>أساس القيمة / آخر تقييم</span><b>{p.value_status ?? '—'}{s.lastValDate ? ` • ${date(s.lastValDate)}` : ''}</b></div>
        <div><span>وضع الأرض</span><b>{LAND_BASIS_LABEL[p.land_basis ?? 'owned']}</b></div><div><span>فرق إعادة التقييم</span><b>{s.revCount ? money(s.revDiff) : 'لا يوجد'}</b></div>
        <div><span>الإيجار السنوي الحالي</span><b>{money(s.rent)}</b></div><div><span>العائد الإجمالي</span><b>{s.yield == null ? '—' : pct(s.yield)}</b></div>
        <div><span>مصروفات {a.year}</span><b>{money(s.expYear)}</b></div><div><span>العائد الصافي</span><b>{s.netYield == null ? '—' : pct(s.netYield)}</b></div>
        <div><span>المتأخرات المؤكدة</span><b>{s.arrears ? money(s.arrears) : '—'}</b></div><div><span>يحتاج تأكيداً</span><b>{s.pending ? money(s.pending) : '—'}</b></div>
        {p.ground_lease_end && <div><span>نهاية عقد الأرض/المبنى</span><b>{date(p.ground_lease_end)} ({hijri(p.ground_lease_end)})</b></div>}
      </div>{p.notes && <p className="note">{p.notes}</p>}
        {p.ground_lease_end && <p className="note warn">⚠ عقد الجمعية مع المؤجر على هذا العقار ينتهي <b>{date(p.ground_lease_end)}</b>{active.length ? ` وأبعد عقد مستأجر ينتهي ${date(active.map((c) => c.end_date).sort().pop())}` : ''}. يلزم التفاوض على تجديده قبل تجديد عقود المستأجرين.</p>}
        {notes.length > 0 && <p className="note warn noprint">🔎 {notes.length} ملاحظات تدقيق مفتوحة على هذا العقار — <Link href={`/audit?p=${p.id}`}>عرضها</Link></p>}</div>

</> },
        { id: 'units', label: `الوحدات (${lease.length + subs.length})`, content: <>      {(() => {
        const st = (uid: string) => { const c = active.find((x) => x.unit_id === uid); if (!c) return ['vac', 'شاغرة', null] as const;
          const od = bal(c.id, 'overdue'), pe = bal(c.id, 'unconfirmed') + bal(c.id, 'due');
          return [od ? 'bad' : pe ? 'warn' : 'ok', od ? `متأخر ${money(od)}` : pe ? 'مستحق / يحتاج تأكيداً' : 'منتظم', c] as const; };
        const items = lease.map((u) => ({ u, t: tiles(u.code), s: st(u.id) }));
        const apts = items.filter((x) => x.t.kind === 'apt'), shops = items.filter((x) => x.t.kind === 'shop'), whole = items.filter((x) => x.t.kind === 'whole');
        if (!items.length) return null;
        return <div className="card"><h2><Ic n="bld" />العقار مرسوماً <small>اضغط أي وحدة لفتح عقدها</small></h2>
          <div className="facade">
            <div className="roof" />
            {(apts.length > 0 || subs.length > 0 || whole.length > 0) && <div className="tower">
              {apts.flatMap((x) => x.t.labels.map((l, i) => <a key={x.u.id + i} className={`u apt st-${x.s[0]}`} href={x.s[2] ? `/contracts/${x.s[2].id}` : `/units/${x.u.id}`} title={`${x.u.code} — ${x.s[2] ? a.T.get(x.s[2].tenant_id)?.name : 'شاغرة'} — ${x.s[1]}`}>{l}</a>))}
              {subs.map((u) => <span key={u.id} className={`u apt ${u.occupant ? 'st-info' : 'st-vac'}`} title={`${u.code} — ${u.occupant ?? 'شاغرة'}`}>{u.code.replace(/[^\d]/g, '').slice(-3)}</span>)}
              {whole.map((x) => <a key={x.u.id} className={`u shop st-${x.s[0]}`} style={{ gridColumn: '1/-1', height: '5rem' }} href={x.s[2] ? `/contracts/${x.s[2].id}` : '#'}>{x.u.code} — {x.s[1]}</a>)}
              <div className="flab">{apts.length ? `${apts.reduce((n, x) => n + x.t.labels.length, 0)} شقة` : ''}{subs.length ? ` ${subs.length} وحدة فرعية (جرد المستأجر)` : ''}</div></div>}
            {shops.length > 0 && <><div className="ground">{shops.flatMap((x) => x.t.labels.map((l) => ({ x, l }))).sort((p, q) => (Number(p.l) || 999) - (Number(q.l) || 999)).map(({ x, l }) => <a key={x.u.id + l} className={`u shop st-${x.s[0]}`} href={x.s[2] ? `/contracts/${x.s[2].id}` : `/units/${x.u.id}`} title={`${x.u.code} — ${x.s[2] ? a.T.get(x.s[2].tenant_id)?.name : 'شاغرة'} — ${x.s[1]}`}>{l}</a>)}</div>
              <div className="glab">الدور الأرضي — {shops.reduce((n, x) => n + x.t.labels.length, 0)} فتحة تجارية</div></>}
            <div className="street" />
            <div className="legend"><span><i style={{ background: 'var(--ok)' }} />منتظم</span><span><i style={{ background: 'var(--warn)' }} />مستحق / يحتاج تأكيداً</span><span><i style={{ background: 'var(--bad)' }} />متأخر</span><span><i style={{ background: '#9aa596' }} />شاغر</span>{subs.length > 0 && <span><i style={{ background: 'var(--info)' }} />وحدة فرعية مشغولة</span>}</div>
          </div></div>;
      })()}
      <div className="card"><h2>الوحدات المؤجّرة من الجمعية ({lease.length})</h2>
        {lease.length === 0 ? <Empty>لا توجد وحدات.</Empty> : <div className="tbl"><table><thead><tr><th>الوحدة</th><th>النوع</th><th>الحالة</th><th>المستأجر الحالي</th>{canEdit && <th className="noprint"></th>}</tr></thead>
          <tbody>{lease.map((u) => { const c = active.find((x) => x.unit_id === u.id); return (<tr key={u.id}><td><Link href={`/units/${u.id}`}>{u.code}</Link></td><td>{u.unit_type ?? '—'}</td>
            <td>{c ? <Tag tone="ok">مؤجرة</Tag> : <Tag tone="warn">شاغرة</Tag>}</td><td>{c ? a.T.get(c.tenant_id)?.name : '—'}</td>
            {canEdit && <td className="noprint rowact"><Link className="btn sm ghost" href={`?unit=${u.id}#unit`}>تعديل</Link>{!c && <Link className="btn sm" href={`/contracts/new?unit=${u.id}`}>تأجير</Link>}</td>}</tr>); })}</tbody></table></div>}</div>

      {subs.length > 0 && <div className="card"><h2>الوحدات الفرعية ({subs.length}) <span className="muted">جرد المستأجر الرئيسي</span></h2>
        <div className="tbl"><table><thead><tr><th>الوحدة</th><th>النوع</th><th>الدور</th><th>الغرف</th><th>الشاغل</th><th className="n">الإيجار الشهري</th><th>ملاحظة</th>{canEdit && <th className="noprint"></th>}</tr></thead>
          <tbody>{subs.map((u) => (<tr key={u.id}><td><Link href={`/units/${u.id}`}>{u.code}</Link></td><td>{u.unit_type}</td><td>{u.floor}</td><td>{u.rooms ?? ''}</td>
            <td>{u.occupant ?? <Tag tone="warn">شاغرة</Tag>}</td><td className="n">{money(u.monthly_rent)}</td><td className="muted">{u.note}</td>
            {canEdit && <td className="noprint"><Link className="btn sm ghost" href={`?unit=${u.id}#unit`}>تعديل</Link></td>}</tr>))}
            <tr className="tot"><td>الإجمالي</td><td></td><td></td><td></td><td>{subs.filter((u) => u.occupant).length} مشغولة</td><td className="n">{money(subs.reduce((x, u) => x + (u.monthly_rent ?? 0), 0))}</td><td></td>{canEdit && <td className="noprint"></td>}</tr>
          </tbody></table></div></div>}

      {canEdit && <details className="box" id="unit" open={!!editU}><summary>{editU ? `تعديل الوحدة: ${editU.code}` : 'إضافة وحدة'}</summary><div className="in">
        <Form action={saveUnit} cancel={editU ? `/properties/${p.id}` : undefined}>
          <Hidden n="property_id" v={p.id} />{editU && <Hidden n="id" v={editU.id} />}
          <F label="رقم/اسم الوحدة" name="code" def={editU?.code} req />
          <F label="التصنيف" name="kind" def={editU?.kind ?? 'lease'} req opts={[['lease', 'وحدة تؤجرها الجمعية'], ['subunit', 'وحدة فرعية (جرد)']]} />
          <F label="النوع" name="unit_type" def={editU?.unit_type} opts={['شقة سكنية', 'محل/فتحة تجارية', 'مكتب', 'مستودع', 'كامل العقار', 'برج اتصالات', 'أخرى'].map((x) => [x, x])} />
          <F label="الدور" name="floor" def={editU?.floor} /><F label="الغرف" name="rooms" def={editU?.rooms} />
          <F label="الشاغل (للوحدات الفرعية)" name="occupant" def={editU?.occupant} /><F label="الإيجار الشهري (للفرعية)" name="monthly_rent" type="number" def={editU?.monthly_rent} />
          <F label="المساحة (م²)" name="area" type="number" def={editU?.area} /><F label="رقم عداد الكهرباء" name="elec_meter" def={editU?.elec_meter} dir="ltr" /><F label="رقم عداد المياه" name="water_meter" def={editU?.water_meter} dir="ltr" />
          <F label="المواصفات (واجهة، دورات مياه، مكيفات…)" name="features" type="textarea" def={editU?.features} wide />
          <F label="ملاحظة" name="note" def={editU?.note} wide />
          <FileFields cats={ATT_CATS.unit} label="صور الوحدة / محاضر الاستلام (أكثر من ملف)" />
        </Form>
        {editU && isAdmin && <form action={deleteUnit} className="inl"><Hidden n="id" v={editU.id} /><Hidden n="property_id" v={p.id} /><button className="btn sm danger" type="submit">حذف الوحدة</button></form>}
      </div></details>}

</> },
        { id: 'contracts', label: `العقود (${cs.length})`, content: <>      <div className="card"><h2>العقود السارية ({active.length})</h2>
        {active.length === 0 ? <p className="note warn">لا يوجد عقد ساري لهذا العقار.</p> :
        <div className="tbl"><table><thead><tr><th>الوحدة</th><th>المستأجر</th><th className="n">البداية</th><th className="n">النهاية</th><th className="n">هجري</th><th className="n">الإيجار السنوي</th><th>الدفع</th><th className="n">متأخر مؤكد</th><th className="n">يحتاج تأكيداً</th></tr></thead>
          <tbody>{active.map((c) => (<tr key={c.id}><td><Link href={`/contracts/${c.id}`}>{a.U.get(c.unit_id)?.code}</Link></td>
            <td><Link href={`/tenants/${c.tenant_id}`}>{a.T.get(c.tenant_id)?.name}</Link>{c.trade_name && <div className="muted">{c.trade_name}</div>}</td><td className="n">{date(c.start_date)}</td><td className="n">{date(c.end_date)}</td>
            <td className="n">{hijri(c.end_date)}</td><td className="n">{money(c.annual_rent)}</td><td>{FREQ[c.frequency ?? ''] ?? '—'}</td>
            <td className="n">{bal(c.id, 'overdue') ? money(bal(c.id, 'overdue')) : '—'}</td><td className="n">{bal(c.id, 'unconfirmed') ? money(bal(c.id, 'unconfirmed')) : '—'}</td></tr>))}
            <tr className="tot"><td>الإجمالي</td><td></td><td></td><td></td><td></td><td className="n">{money(s.rent)}</td><td></td><td className="n">{money(s.arrears)}</td><td className="n">{money(s.pending)}</td></tr>
          </tbody></table></div>}</div>

      {past.length > 0 && <div className="card"><h2>العقود السابقة ({past.length})</h2>
        <div className="tbl"><table><thead><tr><th>الوحدة</th><th>المستأجر</th><th className="n">البداية</th><th className="n">النهاية</th><th className="n">الإيجار السنوي</th><th>الحالة</th></tr></thead>
          <tbody>{past.map((c) => (<tr key={c.id}><td><Link href={`/contracts/${c.id}`}>{a.U.get(c.unit_id)?.code}</Link></td><td>{a.T.get(c.tenant_id)?.name}{c.trade_name && <div className="muted">{c.trade_name}</div>}</td>
            <td className="n">{date(c.start_date)}</td><td className="n">{date(c.end_date)}</td><td className="n">{money(c.annual_rent)}</td><td><Tag tone="mute">{CSTATUS[c.status]}</Tag></td></tr>))}</tbody></table></div></div>}

</> },
        { id: 'valuation', label: `القيمة والتقييمات (${s.vals.length})`, content: <ValuationPanel p={p} vals={s.vals} files={db.attachments} isAdmin={isAdmin} /> },
        { id: 'compliance', label: `الامتثال (${lics.length})`, content: <div className="card"><h2>الرخص والشهادات والتأمين</h2><LicenseTable rows={lics} props={a.P} back={`/properties/${p.id}?tab=compliance`} isAdmin={isAdmin} showProp={false} files={licFiles} />
          {canEdit && <details className="box"><summary>إضافة مستند نظامي</summary><div className="in"><LicenseForm props={db.properties} pid={p.id} back={`/properties/${p.id}?tab=compliance`} /></div></details>}</div> },
        { id: 'changes', label: 'سجل التغييرات', content: <ChangeLog entity="property" id={p.id} /> },
        { id: 'documents', label: 'المستندات', content: <>      <Attachments entity="property" id={p.id} items={db.attachments} back={`/properties/${p.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={ATT_CATS.property} title="مستندات العقار" />
</> },
        { id: 'maintenance', label: 'الصيانة', content: <>      <div className="card"><h2><Ic n="tool" />طلبات الصيانة ({db.maintenance.filter((x) => x.property_id === p.id).length}) {canEdit && <Link href={`/maintenance/new?property=${p.id}`}>＋ طلب صيانة</Link>}</h2>
        {db.maintenance.filter((x) => x.property_id === p.id).length === 0 ? <Empty>لا توجد طلبات.</Empty> : <div className="tbl"><table><thead><tr><th className="n">التاريخ</th><th>الطلب</th><th>الأولوية</th><th>الحالة</th><th className="n">التكلفة</th></tr></thead>
          <tbody>{db.maintenance.filter((x) => x.property_id === p.id).map((m) => <tr key={m.id}><td className="n">{date(m.opened_on)}</td><td><Link href={`/maintenance/${m.id}`}>{m.title}</Link></td><td>{m.priority}</td>
            <td><Tag tone={m.status === 'done' ? 'ok' : m.status === 'cancelled' ? 'mute' : 'warn'}>{{ open: 'مفتوح', progress: 'قيد التنفيذ', done: 'مغلق', cancelled: 'ملغى' }[m.status]}</Tag></td><td className="n">{m.cost != null ? money(m.cost) : m.est_cost != null ? `~${money(m.est_cost)}` : '—'}</td></tr>)}</tbody></table></div>}</div>
</> },
        { id: 'expenses', label: 'المصروفات', content: <>      <div className="card"><h2>المصروفات ({exp.length}) {canEdit && <Link href={`/expenses/new?property=${p.id}`}>＋ مصروف</Link>}</h2>
        {exp.length === 0 ? <Empty>لا توجد مصروفات مسجلة.</Empty> : <div className="tbl"><table><thead><tr><th className="n">التاريخ</th><th>البند</th><th>الوصف</th><th>المورد</th><th className="n">المبلغ</th></tr></thead>
          <tbody>{exp.map((e) => (<tr key={e.id}><td className="n">{date(e.date)}</td><td>{e.category}</td><td>{e.description}</td><td>{e.vendor}</td><td className="n">{money(e.amount)}</td></tr>))}
            <tr className="tot"><td>الإجمالي</td><td></td><td></td><td></td><td className="n">{money(exp.reduce((x, e) => x + e.amount, 0))}</td></tr></tbody></table></div>}</div>
</> },
      ]} />
    </Page>
  );
}
