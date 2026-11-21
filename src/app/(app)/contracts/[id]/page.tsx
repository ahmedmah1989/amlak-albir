import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Kpi, Btn, Empty } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import { updateContract, terminateContract, addInstallment, completeSchedule, rescheduleContract } from '@/lib/actions';
import Attachments from '@/components/Attachments';
import DetailTabs from '@/components/DetailTabs';
import InstallmentBoard, { Prog, InstStat } from '@/components/InstallmentBoard';
import ContractFields from '@/components/ContractFields';
import { ATT_CATS, FREQ_OPTS } from '@/lib/fmt';
import { money, date, hijri, FREQ, CSTATUS, pct } from '@/lib/fmt';
import { daysBetween, addMonths, missingSchedule } from '@/lib/calc';
import { vacateContract } from '@/lib/actions3';
import ChangeLog from '@/components/ChangeLog';
import { missingDocs } from '@/lib/docs';
import { parseFeatureCfg } from '@/lib/features';
import { lateFeeFor } from '@/lib/late-fee';
import { TenantCard, UnitCard } from '@/components/PartyCards';
import DetailHeader from '@/components/DetailHeader';
import Timeline from '@/components/Timeline';
import { q } from '@/lib/db';
import { timeline } from '@/lib/timeline';

export default async function ContractPage({ params, searchParams }: { params: { id: string }; searchParams: { v?: string; tk?: string; deduct?: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const c = a.C.get(params.id); if (!c) notFound();
  const view = searchParams.v === 'table' ? 'table' : 'cards';
  const rows = a.rows.filter((r) => r.contract_id === c.id).sort((x, y) => x.due_date.localeCompare(y.due_date) || x.no - y.no);
  const sum = (st: string) => rows.filter((r) => r.status === st).reduce((x, r) => x + r.balance, 0);
  const p = a.P.get(c.property_id)!, u = a.U.get(c.unit_id)!, t = a.T.get(c.tenant_id)!;
  const left = daysBetween(asOf, c.end_date);
  const pays = a.payments.filter((x) => x.contract_id === c.id);
  const prev = c.renewed_from ? a.C.get(c.renewed_from) : undefined, next = db.contracts.find((x) => x.renewed_from === c.id);
  const total = rows.reduce((x, r) => x + r.amount, 0), open = rows.reduce((x, r) => x + r.balance, 0);
  const due = sum('overdue') + sum('unconfirmed') + sum('due');
  const miss = c.status === 'active' ? missingSchedule(c, rows) : [];
  const lastCovered = rows.reduce((m, r) => ((r.period_to ?? r.due_date) > m ? (r.period_to ?? r.due_date) : m), '');
  const nextDue = rows.find((r) => r.balance > 0 && r.due_date >= asOf);
  const sameUnit = db.contracts.filter((x) => x.unit_id === c.unit_id && x.id !== c.id).sort((x, y) => x.start_date.localeCompare(y.start_date));
  const F_ = db.meta.features, fcfg = parseFeatureCfg(db.meta.settings);
  const reqMiss = F_.doc_required && c.status === 'active' ? missingDocs(db, c, fcfg.required_docs) : [];
  const feeRows = F_.late_fees ? rows.map((r) => ({ r, f: lateFeeFor(r, fcfg) })).filter((x) => x.f.amount > 0) : [];
  const nDocs = (e: string, id: string) => db.attachments.filter((x) => x.entity === e && x.entity_id === id).length;
  const vatAmt = c.vat_rate ? (c.annual_rent * c.vat_rate) / 100 : 0;
  const events = await timeline(db, a, { contractId: c.id });
  const insp = (await q(`select id, kind, to_char(date,'DD/MM/YYYY') as date from inspections where contract_id=$1 order by date`, [c.id])) as { id: string; kind: string; date: string }[];
  const qv = (v: string) => `?v=${v}#tab=installments`;
  return (
    <Page title={`عقد ${p.short} — ${u.code}`} sub={`المستأجر: ${t.name}${c.trade_name ? ` • ${c.trade_name}` : ''}`} org={org} asOf={asOf} print sig back={[`/properties/${p.id}`, p.name]}>

      <DetailHeader title={<>{t.name}{c.trade_name && <span className="cell-sub"> — {c.trade_name}</span>}</>}
        tags={<><Tag tone={c.status !== 'active' ? 'mute' : left < 0 ? 'bad' : left <= 90 ? 'warn' : 'ok'}>{c.status === 'active' ? (left < 0 ? 'انتهت مدته' : left <= 90 ? `ينتهي خلال ${left} يوماً` : 'ساري') : CSTATUS[c.status]}</Tag>{sum('overdue') > 0 && <Tag tone="bad">متأخر {money(sum('overdue'))}</Tag>}</>}
        facts={[['العقار والوحدة', <Link href={`/units/${u.id}`}>{p.short} — {u.code}</Link>], ['المدة', `${date(c.start_date)} – ${date(c.end_date)}`], ['الإيجار السنوي', `${money(c.annual_rent)}${c.vat_rate ? ` + ضريبة ${c.vat_rate}%` : ''}`],
          ['الدورية', FREQ[c.frequency ?? ''] ?? '—'], ['رقم العقد في إيجار', c.contract_no ?? '—'], ['الجوال', t.phone ?? '—']]}
        primary={canEdit && c.status === 'active' ? <Link className="btn" href={`/payments/new?tenant=${t.id}&contract=${c.id}`}>تسجيل سند قبض</Link> : undefined}
        menu={[['—', 'العقد'], ...(canEdit && c.status === 'active' ? [['تجديد العقد', `/contracts/${c.id}/renew`], ['تعديل البيانات أو القيمة أو الدورية', `#tab=actions`]] as [string, string][] : []),
          ...(isAdmin && due > 0 ? [['اتفاق جدولة للمتأخرات', `/contracts/${c.id}/settle`]] as [string, string][] : []), ...(canEdit && open > 0 ? [['رابط دفع إلكتروني للمستأجر', `/paylinks/new?contract=${c.id}`]] as [string, string][] : []), ...(canEdit && c.status === 'active' ? [['إخلاء وتسوية التأمين', '#tab=actions']] as [string, string][] : []), ...(canEdit && (c.deposit ?? 0) > 0 ? [['سند صرف لرد التأمين', `/vouchers/new?contract=${c.id}`]] as [string, string][] : []),
          ...(canEdit ? [['—', 'محاضر الفحص'], ['محضر استلام المستأجر للوحدة', `/contracts/${c.id}/inspection?kind=move_in`], ['محضر فحص عند الإخلاء', `/contracts/${c.id}/inspection?kind=move_out`]] as [string, string][] : []), ...insp.map((x) => [`عرض ${x.kind === 'move_in' ? 'محضر الاستلام' : 'محضر الإخلاء'} ${x.date}`, `/inspections/${x.id}`] as [string, string]),
          ['—', 'طباعة'], ...(nextDue ? [['إشعار مطالبة بالقسط القادم', `/installments/${nextDue.id}/notice`]] as [string, string][] : []), ['خطاب تذكير للمستأجر', `/tenants/${t.id}/letter?type=reminder`], ['خطاب مطالبة', `/tenants/${t.id}/letter?type=claim`],
          ...(c.vacated_on ? [['محضر الإخلاء والتسليم', `/contracts/${c.id}/handover`]] as [string, string][] : []), ['كشف حساب المستأجر', `/reports/statement?t=${t.id}`],
          ['—', 'انتقال'], ['ملف المستأجر', `/tenants/${t.id}`], ['صفحة الوحدة', `/units/${u.id}`], ['العقار', `/properties/${p.id}`]]} />
      {miss.length > 0 && <details className="alert warn noprint"><summary><b>جدول الأقساط ينتهي في {date(lastCovered)} بينما ينتهي العقد في {date(c.end_date)}.</b></summary>
        <p>ينقص {miss.length} أقساط بقيمة {money(miss.reduce((x, i) => x + i.amount, 0))} ريال. بدونها لا تظهر الاستحقاقات القادمة ولا التدفق المتوقع.</p>
        {canEdit && <form action={completeSchedule}><Hidden n="id" v={c.id} /><button className="btn sm" type="submit">استكمال الجدول حتى نهاية العقد</button></form>}</details>}
      <div className="kpis contract-kpis">
        <Kpi tone="bad" l="متأخر مؤكد" v={money(sum('overdue'))} unit="ريال" s={`${rows.filter((r) => r.status === 'overdue').length} أقساط`} />
        <Kpi tone="info" l="المستحق حتى اليوم" v={money(due)} unit="ريال" s={sum('unconfirmed') ? `منها يحتاج تأكيداً ${money(sum('unconfirmed'))}` : 'متأخر + ضمن المهلة'} />
        <Kpi l="القسط القادم" v={nextDue ? money(nextDue.balance) : '—'} unit={nextDue ? 'ريال' : ''} s={nextDue ? `في ${date(nextDue.due_date)}` : 'لا أقساط قادمة'} />
        <Kpi l="نسبة السداد من الجدول" v={total ? pct(((total - open) / total) * 100) : '—'} s={`محصّل ${money(total - open)} من ${money(total)}`} />
      </div>

      <DetailTabs tabs={[
        { id: 'overview', label: 'بيانات العقد', content: <>
          {reqMiss.length > 0 && <div className="note warn"><b>مستندات مطلوبة ناقصة:</b><div className="reqdocs">{reqMiss.map((x, i) => <Link key={i} className="tag t-warn" href={x.href}>{x.scope === 'tenant' ? 'المستأجر' : x.scope === 'unit' ? 'الوحدة' : 'العقد'}: {x.label}</Link>)}</div></div>}
          {feeRows.length > 0 && <div className="note warn"><b>غرامات تأخير مستحقة حسب الإعداد ({fcfg.late_fee_pct}% شهرياً بعد {fcfg.late_fee_after} يوماً):</b> {money(feeRows.reduce((x, y) => x + y.f.amount, 0))} ريال على {feeRows.length} أقساط. <span className="muted">تُصدر من صفحة القسط باعتماد المدير.</span></div>}
          <div className="card"><h2>النشاط</h2><div className="facts">
            <div><span>الاسم التجاري / النشاط</span><b>{c.trade_name ?? '—'}</b></div><div><span>نوع الاستخدام</span><b>{c.usage ?? '—'}</b></div>
            <div><span>مستندات العقد</span><b>{nDocs('contract', c.id) ? `${nDocs('contract', c.id)} ملف` : <Tag tone="warn">لا توجد نسخة مرفقة</Tag>}</b></div>
          </div></div>
          <div className="g2"><TenantCard t={t} today={asOf} docs={nDocs('tenant', t.id)} edit={canEdit} /><UnitCard u={u} p={p} docs={nDocs('unit', u.id)} edit={canEdit} /></div>
          <div className="card"><h2>المدة والقيمة</h2><div className="facts">
            <div><span>رقم عقد إيجار</span><b dir="ltr">{c.contract_no ?? <Tag tone="warn">غير مسجل</Tag>}</b></div>
            <div><span>تاريخ التوقيع</span><b>{date(c.signed_on)}</b></div>
            <div><span>البداية</span><b>{date(c.start_date)}</b></div><div><span>النهاية</span><b>{date(c.end_date)} <small className="muted">({hijri(c.end_date)})</small></b></div>
            <div><span>الحالة</span><b>{c.status === 'active' ? <Tag tone={left < 0 ? 'bad' : left <= 365 ? 'warn' : 'ok'}>{left < 0 ? 'انتهت مدته' : `ساري — متبقٍ ${left} يوماً`}</Tag> : <Tag tone="mute">{CSTATUS[c.status]}</Tag>}</b></div>
            <div><span>الإيجار السنوي</span><b>{money(c.annual_rent)}</b></div>
            <div><span>دورية الدفع</span><b>{FREQ[c.frequency ?? ''] ?? '—'}</b></div>
            <div><span>الضريبة</span><b>{c.vat_rate ? `${c.vat_rate}% = ${money(vatAmt)} سنوياً` : 'غير خاضع / غير محدد'}</b></div>
            <div><span>الزيادة السنوية</span><b>{c.escalation_pct ? `${c.escalation_pct}%` : '—'}</b></div>
            <div><span>التأمين</span><b>{c.deposit ? `${money(c.deposit)} — ${c.deposit_status ?? 'حالة غير محددة'}` : '—'}</b></div>
            <div><span>رسوم إيجار / السعي</span><b>{money(c.ejar_fees)} / {money(c.brokerage)}</b></div>
            <div><span>الكهرباء والمياه</span><b>{c.utilities ?? '—'}</b></div>
            {c.vacated_on && <div><span>الإخلاء</span><b><Link href={`/contracts/${c.id}/handover`}>{date(c.vacated_on)}</Link></b></div>}
            <div><span>التجديد</span><b>{c.auto_renew ? 'تلقائي' : 'بعقد جديد'}{c.notice_days ? ` • إشعار ${c.notice_days} يوماً` : ''}</b></div>
            {c.status === 'active' && <div><span>موعد بدء التفاوض</span><b>{date(addMonths(c.end_date, -3))}</b></div>}
            {c.broker && <div><span>مكتب الوساطة</span><b>{c.broker}</b></div>}
            {c.ejar_property_id && <div><span>رقم العقار في إيجار</span><b dir="ltr">{c.ejar_property_id}</b></div>}
          </div>{c.notes && <p className="note">{c.notes}</p>}</div>
          <div className="card"><h2>تسلسل عقود الوحدة</h2>
            {!sameUnit.length && !prev ? <Empty>لا توجد عقود أخرى على هذه الوحدة.</Empty> : <div className="tbl"><table>
              <thead><tr><th>المستأجر</th><th className="n">البداية</th><th className="n">النهاية</th><th className="n">الإيجار</th><th>الحالة</th><th>الربط</th></tr></thead>
              <tbody>{[...sameUnit, c].sort((x, y) => x.start_date.localeCompare(y.start_date)).map((x) => <tr key={x.id} className={x.id === c.id ? 'hl' : ''}>
                <td>{x.id === c.id ? <b>{a.T.get(x.tenant_id)?.name} (هذا العقد)</b> : <Link href={`/contracts/${x.id}`}>{a.T.get(x.tenant_id)?.name}</Link>}</td>
                <td className="n">{date(x.start_date)}</td><td className="n">{date(x.end_date)}</td><td className="n">{money(x.annual_rent)}</td>
                <td><Tag tone={x.status === 'active' ? 'ok' : 'mute'}>{CSTATUS[x.status]}</Tag></td>
                <td>{x.renewed_from ? `مجدَّد من عقد ${date(a.C.get(x.renewed_from)?.start_date)}` : '—'}</td></tr>)}</tbody></table></div>}
            {next && <p className="muted">جُدِّد بعقد يبدأ <Link href={`/contracts/${next.id}`}>{date(next.start_date)}</Link>.</p>}
          </div>
        </> },
        { id: 'installments', label: `الأقساط (${rows.length})`, content: <>
          <div className="view-switch noprint"><Link href={qv('cards')} className={view === 'cards' ? 'on' : ''}>بطاقات حسب السنة</Link><Link href={qv('table')} className={view === 'table' ? 'on' : ''}>جدول تفصيلي</Link></div>
          <p className="muted noprint">القسط يقبل التحصيل على أكثر من دفعة: اضغط «تحصيل» وأدخل المبلغ المستلم فقط، ويبقى الباقي مفتوحاً على القسط.</p>
          {rows.length === 0 ? <Empty>لا توجد أقساط مسجلة لهذا العقد.</Empty> : view === 'cards' ? <InstallmentBoard rows={rows} canEdit={canEdit && c.status !== 'terminated'} /> :
          <div className="card"><div className="tbl"><table>
            <thead><tr><th className="n">#</th><th>الفترة</th><th className="n">الاستحقاق</th><th className="n">القيمة</th><th className="n">المسدَّد</th><th>التقدم</th><th className="n">المتبقي</th><th>الحالة</th><th className="n">دفعات</th><th className="n">أيام التأخير</th><th>ملاحظة</th></tr></thead>
            <tbody>{rows.map((r) => (<tr key={r.id}><td className="n"><Link href={`/installments/${r.id}`}>{r.no}</Link></td>
              <td className="n">{r.period_from ? `${date(r.period_from)} – ${date(r.period_to)}` : '—'}</td><td className="n">{date(r.due_date)}</td>
              <td className="n">{money(r.amount)}</td><td className="n">{r.amount - r.balance ? money(r.amount - r.balance) : '—'}</td><td><Prog pct={r.paidPct} /></td>
              <td className="n">{r.balance ? money(r.balance) : '—'}</td><td><InstStat r={r} /></td><td className="n">{r.receipts || '—'}</td><td className="n">{r.daysLate || '—'}</td><td className="muted">{r.note}</td></tr>))}
              <tr className="tot"><td></td><td>الإجمالي</td><td></td><td className="n">{money(total)}</td><td className="n">{money(total - open)}</td><td></td><td className="n">{money(open)}</td><td></td><td></td><td></td><td></td></tr>
            </tbody></table></div></div>}
        </> },
        { id: 'payments', label: `المقبوضات (${pays.length})`, content: <div className="card"><h2>سندات القبض على العقد ({pays.length})</h2>
          {pays.length === 0 ? <Empty>لا توجد سندات مسجلة في النظام لهذا العقد.</Empty> : <div className="tbl"><table><thead><tr><th>السند</th><th className="n">التاريخ</th><th className="n">المبلغ</th><th>الأقساط المسددة</th><th>الطريقة</th><th>المرجع</th></tr></thead>
            <tbody>{pays.map((x) => (<tr key={x.id}><td><Link href={`/payments/${x.id}`}>{x.receipt_no}</Link></td><td className="n">{date(x.paid_on)}</td><td className="n">{money(x.amount)}</td>
              <td>{db.allocations.filter((al) => al.payment_id === x.id).map((al) => { const r = rows.find((z) => z.id === al.installment_id); return r ? `ق${r.no}: ${money(al.amount)}` : ''; }).filter(Boolean).join(' • ')}</td>
              <td>{x.method}</td><td dir="ltr">{x.bank_ref}</td></tr>))}
              <tr className="tot"><td>الإجمالي</td><td></td><td className="n">{money(pays.reduce((s, x) => s + x.amount, 0))}</td><td></td><td></td><td></td></tr></tbody></table></div>}</div> },
        { id: 'timeline', label: `الخط الزمني (${events.length})`, content: <Timeline events={events} kind={searchParams.tk} base={`/contracts/${c.id}?v=${view}`} /> },
        { id: 'changes', label: 'سجل التغييرات', content: <ChangeLog entity="contract" id={c.id} /> },
        { id: 'documents', label: `المستندات (${nDocs('contract', c.id) + nDocs('tenant', t.id) + nDocs('unit', u.id)})`, content: <>
          <Attachments entity="contract" id={c.id} items={db.attachments} back={`/contracts/${c.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={ATT_CATS.contract} title="مستندات العقد" />
          <Attachments entity="tenant" id={t.id} items={db.attachments} back={`/contracts/${c.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={ATT_CATS.tenant} title={`مستندات المستأجر: ${t.name}`} />
          <Attachments entity="unit" id={u.id} items={db.attachments} back={`/contracts/${c.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={ATT_CATS.unit} title={`مستندات وصور الوحدة: ${u.code}`} />
        </> },
        ...(canEdit ? [{ id: 'actions', label: 'إدارة العقد', content: <>
          <details className="box" open><summary>تعديل بيانات العقد وشروطه</summary><div className="in">
            <Form action={updateContract}><Hidden n="id" v={c.id} />
              <F label="رقم العقد (منصة إيجار)" name="contract_no" def={c.contract_no} dir="ltr" />
              <F label="مُجدَّد من عقد" name="renewed_from" def={c.renewed_from} opts={sameUnit.map((x) => [x.id, `${a.T.get(x.tenant_id)?.name} — ${date(x.start_date)} إلى ${date(x.end_date)}`])} hint="لربط سلسلة التجديد على نفس الوحدة" />
              <ContractFields c={c} />
              <F label="ملاحظات" name="notes" type="textarea" def={c.notes} wide /></Form></div></details>
          {isAdmin && c.status === 'active' && <details className="box"><summary>تعديل مدة العقد أو قيمته أو دوريته</summary><div className="in">
            <p className="note">تُحذف الأقساط غير المسددة التي تستحق من «تاريخ بدء التطبيق» فما بعد، ثم يُعاد توليدها بالقيم الجديدة. الأقساط التي عليها سداد أو خصم لا تُمس.</p>
            <Form action={rescheduleContract} submit="تطبيق وإعادة توليد الأقساط"><Hidden n="id" v={c.id} />
              <F label="تاريخ النهاية" name="end_date" type="date" req def={c.end_date} /><F label="الإيجار السنوي" name="annual_rent" type="number" req def={c.annual_rent} />
              <F label="دورية الدفع" name="frequency" req def={c.frequency ?? 'quarterly'} opts={FREQ_OPTS} /><F label="تاريخ بدء التطبيق" name="from_date" type="date" req def={asOf} /></Form></div></details>}
          <details className="box"><summary>إضافة قسط يدوي</summary><div className="in">
            <Form action={addInstallment} submit="إضافة القسط"><Hidden n="contract_id" v={c.id} />
              <F label="تاريخ الاستحقاق" name="due_date" type="date" req /><F label="المبلغ" name="amount" type="number" req />
              <F label="الفترة من" name="period_from" type="date" /><F label="الفترة إلى" name="period_to" type="date" /><F label="ملاحظة" name="note" wide /></Form></div></details>
          {isAdmin && due > 0 && <p><Link className="btn ghost" href={`/contracts/${c.id}/settle`}>اتفاق جدولة للمتأخرات ({money(due)} ريال)</Link></p>}
          {c.vacated_on && <p><Link className="btn ghost" href={`/contracts/${c.id}/handover`}>محضر الإخلاء والتسليم</Link></p>}
          {isAdmin && c.status === 'active' && <details className="box"><summary>إخلاء وتسليم الوحدة وتسوية التأمين</summary><div className="in">
            <p className="note">يُغلق العقد (منتهٍ أو منهى مبكراً حسب التاريخ) وتُحذف الأقساط اللاحقة غير المسددة، ويُحفظ محضر التسليم للطباعة. الأقساط المستحقة قبل الإخلاء تبقى قائمة.</p>
            <Form action={vacateContract} submit="تسجيل الإخلاء" danger><Hidden n="id" v={c.id} />
              <F label="تاريخ الإخلاء والتسليم" name="vacated_on" type="date" req def={asOf} />
              <F label={`المستقطع من التأمين (التأمين ${money(c.deposit ?? 0)})`} name="deposit_deduction" type="number" min="0" def={searchParams.deduct} />
              <F label="المسترد للمستأجر" name="deposit_refund" type="number" min="0" />
              <F label="حالة الوحدة عند التسليم" name="handover_notes" type="textarea" req wide hint="العدادات، المفاتيح، الأضرار، النظافة، الملاحظات" /></Form></div></details>}
          {isAdmin && c.status === 'active' && <details className="box"><summary>إنهاء العقد مبكراً</summary><div className="in">
            <p className="note warn">تُحذف الأقساط التي يحل موعدها بعد تاريخ الإنهاء ما لم يكن عليها سداد. الأقساط المتأخرة تبقى قائمة.</p>
            <Form action={terminateContract} submit="إنهاء العقد" danger><Hidden n="id" v={c.id} />
              <F label="تاريخ الإنهاء" name="date" type="date" req def={asOf} /><F label="السبب" name="reason" req wide /></Form></div></details>}
        </> }] : []),
      ]} defaultTab={undefined} merge={[['account', 'الحساب (الأقساط والمقبوضات)', ['installments', 'payments']]]} />
    </Page>
  );
}
