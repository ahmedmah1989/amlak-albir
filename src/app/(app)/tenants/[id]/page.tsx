import Link from 'next/link';
import DetailHeader from '@/components/DetailHeader';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Kpi, Btn, Empty } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import { addFollowUp } from '@/lib/actions';
import Attachments from '@/components/Attachments';
import DetailTabs from '@/components/DetailTabs';
import InstallmentBoard, { Prog } from '@/components/InstallmentBoard';
import { ATT_CATS, TENANT_TYPE } from '@/lib/fmt';
import { money, date, FREQ, CSTATUS, FOLLOW_TYPES, opts } from '@/lib/fmt';
import { tenantLedger } from '@/lib/statement';
import { daysBetween } from '@/lib/calc';
import { waLink, waTemplates } from '@/lib/messages';
import { q, MULTI, currentOrg } from '@/lib/db';
import Timeline from '@/components/Timeline';
import { timeline } from '@/lib/timeline';
import { setTenantOptOut } from '@/lib/notify-actions';
import { CHANNELS, KINDS, STATUS as NST } from '@/lib/notify';
const NCH = Object.fromEntries(CHANNELS), NKL = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));
import ChangeLog from '@/components/ChangeLog';
import { UnitCard } from '@/components/PartyCards';
import { setCollector, portalToken } from '@/lib/actions4';
import { headers } from 'next/headers';

export default async function TenantPage({ params, searchParams }: { params: { id: string }; searchParams: { from?: string; to?: string; c?: string; tk?: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const s = a.tenantStats.find((x) => x.t.id === params.id); if (!s) notFound();
  const t = s.t, company = t.tenant_type === 'company';
  const open = s.rows.filter((r) => r.balance > 0 && r.status !== 'upcoming');
  const fus = db.followups.filter((f) => f.tenant_id === t.id);
  const adj = db.adjustments.filter((x) => x.tenant_id === t.id);
  const pays = a.payments.filter((p) => p.tenant_id === t.id);
  const trades = [...new Set(s.contracts.map((c) => c.trade_name).filter(Boolean))];
  const led = tenantLedger(db, a, t.id, { from: searchParams.from, to: searchParams.to, contractId: searchParams.c });
  const exp = (d: string | null) => d ? <>{date(d)} {daysBetween(asOf, d) < 0 ? <Tag tone="bad">منتهية</Tag> : daysBetween(asOf, d) <= 60 ? <Tag tone="warn">تنتهي قريباً</Tag> : null}</> : <span className="muted">—</span>;
  const val = (v: string | null | undefined, ltr = false) => v ? <b dir={ltr ? 'ltr' : undefined}>{v}</b> : <b><Tag tone="warn">غير مسجل</Tag></b>;
  const events = await timeline(db, a, { tenantId: t.id });
  const po = MULTI ? `?o=${currentOrg()}` : '';
  const reminders = await q(`select scheduled_on, kind, channel, status, error from notify_queue where tenant_id=$1 order by created_at desc limit 8`, [t.id]);
  const nextR = s.rows.filter((r) => r.balance > 0 && r.due_date >= asOf).sort((x, y) => x.due_date.localeCompare(y.due_date))[0];
  const wa = waTemplates({ org, name: t.name, trade: trades[0], arrears: s.arrears, overdueCount: s.overdueCount, next: nextR ? { amount: nextR.balance, due: nextR.due_date } : null });
  let origin = ''; try { const h = headers(); origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`; } catch {}
  const nDocs = (e: string, id: string) => db.attachments.filter((x) => x.entity === e && x.entity_id === id).length;
  const futureOpen = s.rows.filter((r) => r.balance > 0 && r.status === 'upcoming').reduce((x, r) => x + r.balance, 0);
  return (
    <Page title={t.name} sub={[trades.join(' • '), TENANT_TYPE[t.tenant_type ?? 'individual'], t.phone && `جوال ${t.phone}`].filter(Boolean).join(' • ')}
      org={org} asOf={asOf} print sig back={['/tenants', 'المستأجرون']}>
      {s.completeness.missing > 0 && <div className="note warn noprint complete"><span>اكتمال بيانات المستأجر {s.completeness.pct}%</span><Prog pct={s.completeness.pct} />{canEdit && <Link href={`/tenants/${t.id}/edit`}>استكمال البيانات</Link>}</div>}
      <DetailHeader title={t.name} tags={<>{s.arrears > 0 ? <Tag tone="bad">متأخر {money(s.arrears)}</Tag> : <Tag tone="ok">لا متأخرات</Tag>}{s.activeContracts.length ? <Tag tone="info">{s.activeContracts.length} عقود سارية</Tag> : <Tag tone="mute">بلا عقد ساري</Tag>}</>}
        facts={[['النوع', TENANT_TYPE[t.tenant_type ?? 'individual']], ['الجوال', t.phone ? <a href={`tel:${t.phone}`} dir="ltr">{t.phone}</a> : '—'], ['الهوية / السجل', t.national_id ?? t.cr_no ?? '—'], ['الوحدات', s.activeContracts.map((c) => a.U.get(c.unit_id)?.code).join('، ') || '—'],
          ['اكتمال البيانات', `${s.completeness.pct}%`], ['آخر سداد', s.lastPayment ? date(s.lastPayment.paid_on) : '—'], ['آخر متابعة', s.lastFollow ? `${date(s.lastFollow.date)} — ${s.lastFollow.type}` : 'لا توجد'], ['موظف التحصيل', t.collector ?? '—']]}
        primary={canEdit ? <Link className="btn" href={`/payments/new?tenant=${t.id}`}>تسجيل سند قبض</Link> : undefined}
        menu={[...(canEdit && s.arrears + s.pending > 0 ? [['رابط دفع إلكتروني', `/paylinks/new?tenant=${t.id}`]] as [string, string][] : []), ['—', 'المستأجر'], ...(canEdit ? [['تعديل البيانات', `/tenants/${t.id}/edit`], ['عقد جديد', `/contracts/new?tenant=${t.id}`], ['تسجيل متابعة', '#tab=followups']] as [string, string][] : []),
          ['—', 'تواصل وطباعة'], ['خطاب تذكير', `/tenants/${t.id}/letter?type=reminder`], ['خطاب مطالبة', `/tenants/${t.id}/letter?type=claim`], ['خطاب إنذار', `/tenants/${t.id}/letter?type=warning`], ['كشف الحساب للطباعة', `/reports/statement?t=${t.id}`],
          ['—', 'العقود'], ...s.contracts.map((c) => [`عقد ${a.U.get(c.unit_id)?.code ?? ''} (${CSTATUS[c.status]})`, `/contracts/${c.id}`] as [string, string])]} />
      <div className="kpis">
        <Kpi l="متأخر مؤكد" v={money(s.arrears)} unit="ريال" tone="bad" s={s.overdueCount ? `${s.overdueCount} أقساط — أقدمها ${s.maxLate} يوماً` : 'لا متأخرات'} />
        <Kpi l="المستحق حتى اليوم" v={money(open.reduce((x, r) => x + r.balance, 0))} unit="ريال" tone="info" s={s.pending ? `منها يحتاج تأكيداً ${money(s.pending)}` : undefined} />
        <Kpi l="أقساط قادمة" v={money(futureOpen)} unit="ريال" s={`${s.activeContracts.length} عقود سارية • ${money(s.activeContracts.reduce((x, c) => x + c.annual_rent, 0))} سنوياً`} />
        <Kpi l="متوسط التأخر في السداد" v={s.avgDelay == null ? '—' : String(s.avgDelay)} unit={s.avgDelay == null ? '' : 'يوماً'} s={s.lastPayment ? `آخر سداد ${date(s.lastPayment.paid_on)}` : 'لا سندات'} />
      </div>
      <DetailTabs tabs={[
        { id: 'profile', label: 'البيانات', content: <>
          <div className="g2">
            <div className="card"><h2>الهوية</h2><div className="facts">
              <div><span>النوع</span><b>{TENANT_TYPE[t.tenant_type ?? 'individual']}</b></div>
              <div><span>{company ? 'هوية الممثل' : 'رقم الهوية / الإقامة'}</span>{val(t.national_id, true)}</div>
              <div><span>انتهاء الهوية</span><b>{exp(t.id_expiry)}</b></div>
              {!company && <div><span>الجنسية</span>{val(t.nationality)}</div>}
              {(company || t.cr_no) && <><div><span>السجل التجاري</span>{val(t.cr_no, true)}</div><div><span>انتهاء السجل</span><b>{exp(t.cr_expiry)}</b></div></>}
              <div><span>الرقم الضريبي</span><b dir="ltr">{t.vat_no ?? '—'}</b></div>
              <div><span>الأنشطة التجارية</span><b>{trades.join('، ') || '—'}</b></div>
            </div></div>
            <div className="card"><h2>التواصل والكفيل</h2><div className="facts">
              <div><span>الجوال</span>{val(t.phone, true)}</div><div><span>جوال إضافي</span><b dir="ltr">{t.phone2 ?? '—'}</b></div>
              <div><span>البريد</span><b dir="ltr">{t.email ?? '—'}</b></div><div><span>مسؤول التواصل</span><b>{t.contact_person ?? '—'}</b></div>
              <div><span>العنوان الوطني</span>{val(t.address)}</div>
              <div><span>الكفيل</span><b>{t.guarantor_name ?? '—'}{t.guarantor_phone && <div dir="ltr" className="muted">{t.guarantor_phone}</div>}</b></div>
              <div><span>المتابعة القادمة</span><b>{s.nextFollow ? date(s.nextFollow) : '—'}</b></div>
            </div>{t.notes && <p className="note">{t.notes}</p>}</div>
          </div>
          {s.activeContracts.map((c) => { const u = a.U.get(c.unit_id), p = a.P.get(c.property_id); return u && p ? <UnitCard key={c.id} u={u} p={p} docs={nDocs('unit', u.id)} edit={canEdit} /> : null; })}
          <div className="card"><h2>العقود ({s.contracts.length})</h2><div className="tbl"><table>
            <thead><tr><th>العقار / الوحدة</th><th>النشاط</th><th className="n">البداية</th><th className="n">النهاية</th><th className="n">الإيجار السنوي</th><th>الدفع</th><th className="n">المتبقي</th><th>الحالة</th></tr></thead>
            <tbody>{s.contracts.map((c) => { const bal = s.rows.filter((r) => r.contract_id === c.id).reduce((x, r) => x + r.balance, 0); return (<tr key={c.id}><td><Link href={`/contracts/${c.id}`}>{a.P.get(c.property_id)?.short} — {a.U.get(c.unit_id)?.code}</Link></td><td>{c.trade_name ?? '—'}</td>
              <td className="n">{date(c.start_date)}</td><td className="n">{date(c.end_date)}</td><td className="n">{money(c.annual_rent)}</td>
              <td>{FREQ[c.frequency ?? ''] ?? '—'}</td><td className="n">{bal ? money(bal) : '—'}</td><td><Tag tone={c.status === 'active' ? 'ok' : 'mute'}>{CSTATUS[c.status]}</Tag></td></tr>); })}</tbody></table></div></div>
        </> },
        { id: 'statement', label: 'كشف الحساب', content: <div className="card">
          <form method="get" className="filter-panel noprint">
            <label className="fld"><span>من</span><input type="date" name="from" defaultValue={searchParams.from} /></label>
            <label className="fld"><span>إلى</span><input type="date" name="to" defaultValue={searchParams.to ?? asOf} /></label>
            <label className="fld"><span>العقد</span><select name="c" defaultValue={searchParams.c ?? ''}><option value="">كل العقود</option>{s.contracts.map((c) => <option key={c.id} value={c.id}>{a.U.get(c.unit_id)?.code} — {date(c.start_date)}</option>)}</select></label>
            <button className="btn sm" type="submit" style={{ alignSelf: 'flex-end' }}>عرض</button>
            <a className="btn sm ghost" style={{ alignSelf: 'flex-end' }} href={`/api/export?r=statement&id=${t.id}${searchParams.from ? '&from=' + searchParams.from : ''}${searchParams.to ? '&to=' + searchParams.to : ''}${searchParams.c ? '&c=' + searchParams.c : ''}`}>⬇ إكسل</a></form>
          <h2>كشف حساب من {led.from ? date(led.from) : 'بداية التعامل'} إلى {date(led.to)}</h2>
          <div className="tbl"><table className="ledger"><thead><tr><th className="n">التاريخ</th><th>المرجع</th><th>البيان</th><th className="n">مدين (مستحق)</th><th className="n">دائن (مسدد)</th><th className="n">الرصيد</th></tr></thead>
            <tbody>{led.from && <tr className="open"><td className="n">{date(led.from)}</td><td>رصيد سابق</td><td></td><td></td><td></td><td className="n">{money(led.opening)}</td></tr>}
              {led.lines.length === 0 && <tr><td colSpan={6} className="muted">لا توجد حركات في الفترة.</td></tr>}
              {led.lines.map((l, i) => <tr key={i}><td className="n">{date(l.date)}</td><td>{l.href ? <Link href={l.href}>{l.ref}</Link> : l.ref}</td><td className="muted">{l.desc}</td>
                <td className="n dr">{l.debit ? money(l.debit) : ''}</td><td className="n cr">{l.credit ? money(l.credit) : ''}</td><td className="n"><b>{money(Math.abs(l.balance))}</b> {l.balance < 0 ? <small className="ok">دائن</small> : null}</td></tr>)}
              <tr className="tot"><td></td><td>الإجمالي</td><td></td><td className="n">{money(led.debit)}</td><td className="n">{money(led.credit)}</td><td className="n">{money(Math.abs(led.closing))} {led.closing < 0 ? 'دائن' : led.closing > 0 ? 'مستحق' : ''}</td></tr></tbody></table></div>
          <p className="muted">الأقساط تُقيَّد مديناً في تاريخ استحقاقها، والسندات دائناً في تاريخ استلامها. الأقساط القادمة بعد تاريخ الكشف لا تظهر.</p>
        </div> },
        { id: 'installments', label: `الأقساط (${s.rows.filter((r) => r.balance > 0).length} مفتوحة)`, content: <>
          {s.rows.filter((r) => r.balance > 0).length === 0 ? <Empty>لا توجد أقساط مفتوحة.</Empty> : <InstallmentBoard rows={s.rows.filter((r) => r.balance > 0)} canEdit={canEdit} showContract />}
        </> },
        { id: 'payments', label: `المقبوضات (${pays.length})`, content: <div className="card"><h2>سندات القبض ({pays.length})</h2>
          {pays.length === 0 ? <Empty>لا توجد سندات مسجلة في النظام.</Empty> : <div className="tbl"><table><thead><tr><th>السند</th><th className="n">التاريخ</th><th>العقد</th><th className="n">المبلغ</th><th>الطريقة</th></tr></thead>
            <tbody>{pays.map((p) => { const c = p.contract_id ? a.C.get(p.contract_id) : undefined; return (<tr key={p.id}><td><Link href={`/payments/${p.id}`}>{p.receipt_no}</Link></td><td className="n">{date(p.paid_on)}</td>
              <td>{c ? `${a.P.get(c.property_id)?.short} — ${a.U.get(c.unit_id)?.code}` : '—'}</td><td className="n">{money(p.amount)}</td><td>{p.method}</td></tr>); })}
              <tr className="tot"><td>الإجمالي</td><td></td><td></td><td className="n">{money(pays.reduce((x, p) => x + p.amount, 0))}</td><td></td></tr></tbody></table></div>}</div> },
        { id: 'followups', label: `المتابعة (${fus.length})`, content: <>
          <div className="card noprint"><div className="card-head"><h2>التذكيرات التلقائية</h2>
            {canEdit && <form action={setTenantOptOut} className="inline"><Hidden n="tenant_id" v={t.id} /><Hidden n="on" v={t.notify_opt_out ? '0' : '1'} /><Hidden n="back" v={`/tenants/${t.id}?tab=followups`} />
              <button className={'btn sm ' + (t.notify_opt_out ? '' : 'ghost')} type="submit">{t.notify_opt_out ? 'إعادة تفعيل التذكيرات' : 'إيقاف التذكيرات لهذا المستأجر'}</button></form>}</div>
            <p>{t.notify_opt_out ? <Tag tone="mute">موقوفة بطلب المستأجر</Tag> : <Tag tone="ok">مفعّلة</Tag>} {!t.phone && !t.email && <Tag tone="warn">لا يوجد جوال أو بريد — لن تصله تذكيرات</Tag>}</p>
            {reminders.length > 0 && <div className="tbl"><table><tbody>{reminders.map((r, i) => <tr key={i}><td>{date(r.scheduled_on)}</td><td>{NKL[r.kind] ?? r.kind}</td><td>{NCH[r.channel]}</td><td><Tag tone={(NST[r.status]?.[1] ?? 't-mute').slice(2)}>{NST[r.status]?.[0] ?? r.status}</Tag>{r.error && <span className="muted"> {r.error}</span>}</td></tr>)}</tbody></table></div>}
            <p className="muted"><Link href="/notifications">إدارة التذكيرات ←</Link></p></div>
          {db.meta.features.collection_plan && <div className="card noprint"><h2>موظف التحصيل</h2>{canEdit ? <form action={setCollector} className="inl"><Hidden n="tenant" v={t.id} /><Hidden n="back" v={`/tenants/${t.id}`} />
            <select name="collector" defaultValue={t.collector ?? ''}><option value="">بدون</option>{db.users.filter((u) => u.active && u.role !== 'viewer').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select> <button className="btn sm" type="submit">حفظ</button></form>
            : <p>{db.users.find((u) => u.id === t.collector)?.full_name ?? 'غير معيّن'}</p>}</div>}
          {db.meta.features.portal && <div className="card noprint"><h2>بوابة المستأجر</h2>
            {t.portal_token ? <><p>الرابط الخاص: <code dir="ltr" style={{ userSelect: 'all' }}>{`${origin}/portal/${t.portal_token}${po}`}</code> <a className="btn sm ghost" href={`/portal/${t.portal_token}${po}`} target="_blank" rel="noreferrer">فتح</a>
              {(() => { const h = waLink(t.phone, `السلام عليكم ${t.name}،\nرابط كشف حسابكم ورفع إشعارات التحويل لدى ${org}:\n${origin}/portal/${t.portal_token}${po}`); return h ? <a className="btn sm ghost" href={h} target="_blank" rel="noopener noreferrer">إرسال بواتساب</a> : null; })()}</p>
              <p className="muted">يعمل الرابط لمن يصل لعنوان البرنامج: داخل شبكة الجمعية، أو من الإنترنت في النسخة السحابية فقط. إذا فُتح البرنامج بـ localhost فافتحه بعنوان IP الجهاز قبل نسخ الرابط.</p></> : <p className="muted">لا يوجد رابط فعّال.</p>}
            {canEdit && <form action={portalToken} className="inl"><Hidden n="tenant_id" v={t.id} /><button className="btn sm" type="submit" name="mode" value="new">{t.portal_token ? 'تجديد الرابط' : 'إنشاء رابط'}</button>{t.portal_token && <button className="btn sm danger" type="submit" name="mode" value="revoke">إيقاف الرابط</button>}</form>}</div>}
          <div className="card noprint"><h2>التواصل والخطابات</h2>
            <div className="wa">{wa.length === 0 ? <span className="muted">لا توجد مستحقات تستدعي رسالة.</span> : wa.map((m) => { const href = waLink(t.phone, m.text); return href ? <a key={m.key} href={href} target="_blank" rel="noopener noreferrer">واتساب: {m.label}</a> : <span key={m.key} className="tag t-warn">{m.label}: سجّل رقم الجوال أولاً</span>; })}</div>
            <div className="wa"><Link className="btn sm ghost" href={`/tenants/${t.id}/letter?type=reminder`}>خطاب تذكير</Link><Link className="btn sm ghost" href={`/tenants/${t.id}/letter?type=claim`}>خطاب مطالبة</Link><Link className="btn sm ghost" href={`/tenants/${t.id}/letter?type=warning`}>خطاب إنذار</Link></div>
            <p className="muted">الرسالة تُفتح جاهزة في واتساب برقم المستأجر؛ بعد الإرسال سجّلها متابعةً أدناه.</p></div>
          {canEdit && <details className="box" open={s.arrears > 0}><summary>تسجيل متابعة جديدة</summary><div className="in">
            <Form action={addFollowUp} submit="تسجيل المتابعة"><Hidden n="tenant_id" v={t.id} />
              <F label="التاريخ" name="date" type="date" req def={asOf} /><F label="نوع المتابعة" name="type" req opts={opts(FOLLOW_TYPES)} />
              <F label="موعد المتابعة التالية" name="next_date" type="date" hint="يمنع ظهور المستأجر في «متأخر بلا متابعة» حتى هذا التاريخ" /><F label="التفاصيل" name="details" type="textarea" wide /></Form></div></details>}
          <div className="g2">
          <div className="card"><h2>سجل المتابعة ({fus.length})</h2>
            {fus.length === 0 ? <p className="note warn">لا توجد متابعة مسجلة.</p> :
            <div className="tbl"><table><thead><tr><th className="n">التاريخ</th><th>النوع</th><th>التفاصيل</th><th className="n">المتابعة التالية</th></tr></thead>
              <tbody>{fus.map((f) => (<tr key={f.id}><td className="n">{date(f.date)}</td><td><Tag tone="info">{f.type}</Tag></td><td>{f.details}{f.created_by && <div className="muted">بواسطة {f.created_by}</div>}</td><td className="n">{date(f.next_date)}</td></tr>))}</tbody></table></div>}</div>
          <div className="card"><h2>الخصومات والإعفاءات ({adj.length})</h2>
            {adj.length === 0 ? <Empty>لا توجد.</Empty> : <div className="tbl"><table><thead><tr><th>القسط</th><th>النوع</th><th className="n">المبلغ</th><th>المعتمد</th><th>رقم القرار</th></tr></thead>
              <tbody>{adj.map((x) => (<tr key={x.id}><td className="n">{x.installment_id ? <Link href={`/installments/${x.installment_id}`}>{x.installment_no}</Link> : x.installment_no}</td><td>{x.type}</td><td className="n">{money(x.amount)}</td>
                <td>{x.approved_by ?? '—'}</td><td>{x.decision_no ?? <Tag tone="bad">غير مسجل</Tag>}</td></tr>))}</tbody></table></div>}</div>
          </div></> },
        { id: 'timeline', label: `الخط الزمني (${events.length})`, content: <Timeline events={events} kind={searchParams.tk} base={`/tenants/${t.id}?x=1`} /> },
        { id: 'changes', label: 'سجل التغييرات', content: <ChangeLog entity="tenant" id={t.id} /> },
        { id: 'documents', label: `المستندات (${nDocs('tenant', t.id) + s.contracts.reduce((x, c) => x + nDocs('contract', c.id), 0)})`, content: <>
          <Attachments entity="tenant" id={t.id} items={db.attachments} back={`/tenants/${t.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={ATT_CATS.tenant} title="مستندات المستأجر (الهوية، السجل، العنوان الوطني)" />
          {s.contracts.filter((c) => c.status === 'active' || nDocs('contract', c.id)).map((c) => <Attachments key={c.id} entity="contract" id={c.id} items={db.attachments} back={`/tenants/${t.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={ATT_CATS.contract} title={`مستندات عقد ${a.U.get(c.unit_id)?.code} (${date(c.start_date)})`} />)}
        </> },
      ]} merge={[['account', 'الحساب (الكشف والأقساط والمقبوضات)', ['statement', 'installments', 'payments']], ['log', 'السجل (المتابعة والتغييرات)', ['followups', 'changes']]]} />
    </Page>
  );
}
