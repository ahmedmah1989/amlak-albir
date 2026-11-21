import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Tag, Empty, XL } from '@/components/ui';
import { Ic } from '@/components/icons';
import { Hidden } from '@/components/form';
import { resolveNote } from '@/lib/actions';
import { requestException, revokeException } from '@/lib/actions2';
import { RULES, runAudit } from '@/lib/audit';
import { money, date } from '@/lib/fmt';

const LV: Record<string, [string, string]> = { high: ['bad', 'عالية'], mid: ['warn', 'متوسطة'], low: ['info', 'منخفضة'] };
export default async function Audit({ searchParams }: { searchParams: { r?: string; tab?: string; p?: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const au = runAudit(db, a); const tab = searchParams.tab ?? 'rules', r = searchParams.r;
  const rule = RULES.find((x) => x.id === r);
  const list = au.findings.filter((f) => f.rule === r && (!searchParams.p || f.property_id === searchParams.p));
  const inp = { border: '1px solid var(--line)', borderRadius: 8, padding: '2px 8px', fontFamily: 'inherit', fontSize: '.85rem' };
  return (
    <Page title="تدقيق البيانات والاستثناءات" sub="قواعد فحص تعمل تلقائياً على كل البيانات. الحالة المبررة تُستثنى بطلب معتمد ولا تُحذف." org={org} asOf={asOf} print actions={<XL r="audit" />}>
      <div className="kpis">
        <Kpi tone="hero" l="مؤشر جودة البيانات بعد الاستثناء" v={`${au.score}%`} s={`قبل الاستثناء ${au.rawScore}%`} />
        <Kpi tone="bad" l="حالات عالية الأهمية" v={String(au.open.filter((f) => RULES.find((x) => x.id === f.rule)?.level === 'high').length)} />
        <Kpi tone="warn" l="كل الحالات المفتوحة" v={String(au.open.length)} />
        <Kpi tone="info" l="مستثناة باعتماد" v={String(au.excepted.length)} s={`${db.exceptions.filter((x) => x.status === 'pending').length} طلبات بانتظار الاعتماد`} href="/approvals" />
      </div>
      <p className="note">المؤشر إرشادي: يُحسب من عدد الملاحظات مقابل {au.checked} فحصاً تقديرياً؛ ولا يعني أن هذه النسبة من السجلات سليمة بالكامل. توجد {au.excepted.length} حالة مستثناة باعتماد، وتظل ظاهرة في سجل الاستثناءات.</p>
      <div className="filters">{[['rules', 'القواعد'], ['exc', 'الاستثناءات'], ['notes', 'ملاحظات المراجعة المستوردة']].map(([k, l]) => <Link key={k} href={`?tab=${k}`} className={tab === k ? 'on' : ''}>{l}</Link>)}</div>
      {tab === 'rules' && !rule && <div className="card"><div className="tbl"><table><thead><tr><th>القاعدة</th><th>الأهمية</th><th className="n">مفتوحة</th><th className="n">مستثناة</th><th>الإجراء المطلوب</th></tr></thead>
        <tbody>{RULES.map((x) => { const o = au.open.filter((f) => f.rule === x.id).length, e = au.excepted.filter((f) => f.rule === x.id).length;
          return <tr key={x.id}><td><Link href={`?r=${x.id}`}>{x.title}</Link></td><td><Tag tone={LV[x.level][0]}>{LV[x.level][1]}</Tag></td><td className="n">{o ? <b style={{ color: 'var(--bad)' }}>{o}</b> : <Tag tone="ok">سليم</Tag>}</td><td className="n">{e || '—'}</td><td className="muted">{x.fix}</td></tr>; })}</tbody></table></div></div>}
      {tab === 'rules' && rule && <div className="card"><h2><Ic n="audit" />{rule.title} <Link href="?">← كل القواعد</Link></h2><p className="muted">المطلوب: {rule.fix}</p>
        {!list.length ? <Empty>لا حالات.</Empty> : <div className="tbl"><table><thead><tr><th>السجل</th><th>التفاصيل</th><th className="n">التاريخ</th><th className="n">المبلغ</th><th>الحالة</th>{canEdit && <th className="noprint">استثناء</th>}</tr></thead>
          <tbody>{list.map((f) => <tr key={f.rule + f.entity_id}><td><Link href={f.href}>{f.title}</Link></td><td className="muted">{f.sub}</td><td className="n">{date(f.date)}</td><td className="n">{f.amount != null ? money(f.amount) : '—'}</td>
            <td>{f.excepted ? <><Tag tone="est">مستثنى</Tag><div className="muted">{f.excepted.reason}</div></> : <Tag tone="warn">مفتوحة</Tag>}</td>
            {canEdit && <td className="noprint">{!f.excepted && <form action={requestException} className="rowact"><Hidden n="rule" v={f.rule} /><Hidden n="scope" v="record" /><Hidden n="entity_id" v={f.entity_id} /><Hidden n="back" v={`/audit?r=${f.rule}`} />
              <input name="reason" placeholder="مبرر الاستثناء" required style={inp} /><input type="date" name="expires_on" title="ينتهي الاستثناء في (اختياري)" style={inp} /><button className="btn sm ghost">طلب</button></form>}</td>}</tr>)}</tbody></table></div>}
        {canEdit && list.length > 0 && <details className="box" style={{ marginTop: '.8rem' }}><summary>استثناء جماعي لهذه القاعدة</summary><div className="in">
          <form action={requestException} className="frm"><Hidden n="rule" v={rule.id} /><Hidden n="back" v={`/audit?r=${rule.id}`} /><div className="grid">
            <label className="fld"><span>النطاق</span><select name="scope"><option value="before">كل الحالات قبل تاريخ</option><option value="property">كل الحالات في عقار</option></select></label>
            <label className="fld"><span>التاريخ (لنطاق «قبل تاريخ»)</span><input type="date" name="before_date" /></label>
            <label className="fld"><span>العقار (لنطاق «عقار»)</span><select name="property_id"><option value="">—</option>{db.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="fld"><span>ينتهي في (اختياري)</span><input type="date" name="expires_on" /></label>
            <label className="fld wide"><span>المبرر</span><textarea name="reason" required rows={2} /></label></div><div className="fa"><button className="btn">إرسال للاعتماد</button></div></form></div></details>}</div>}
      {tab === 'exc' && <div className="card"><h2><Ic n="shield" />سجل الاستثناءات ({db.exceptions.length})</h2>{!db.exceptions.length ? <Empty>لا يوجد.</Empty> :
        <div className="tbl"><table><thead><tr><th>القاعدة</th><th>النطاق</th><th>المبرر</th><th>طلبه</th><th>اعتمده</th><th className="n">ينتهي</th><th>الحالة</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>{db.exceptions.map((x) => <tr key={x.id}><td>{RULES.find((r) => r.id === x.rule)?.title ?? x.rule}</td><td>{x.scope === 'record' ? 'سجل محدد' : x.scope === 'before' ? `قبل ${date(x.before_date)}` : `عقار ${a.P.get(x.property_id ?? '')?.short ?? ''}`}</td>
            <td>{x.reason}</td><td>{x.requested_by}</td><td>{x.approved_by ?? '—'}</td><td className="n">{date(x.expires_on)}</td><td><Tag tone={x.status === 'approved' ? 'est' : x.status === 'pending' ? 'warn' : 'mute'}>{{ approved: 'معتمد', pending: 'بانتظار', rejected: 'مرفوض/ملغى' }[x.status]}</Tag></td>
            {isAdmin && <td>{x.status === 'approved' && <form action={revokeException}><Hidden n="id" v={x.id} /><button className="btn sm ghost">إلغاء</button></form>}</td>}</tr>)}</tbody></table></div>}</div>}
      {tab === 'notes' && <div className="card"><h2>ملاحظات المراجعة المستوردة ({db.notes.filter((n) => n.status === 'open').length} مفتوحة)</h2><div className="tbl"><table>
        <thead><tr><th>النوع</th><th>العقار</th><th>المستأجر</th><th className="n">المبلغ</th><th>المرجع</th><th>المطلوب</th><th>الحالة</th>{canEdit && <th className="noprint"></th>}</tr></thead>
        <tbody>{db.notes.map((n) => <tr key={n.id}><td><b>{n.category}</b></td><td>{n.property_id ? a.P.get(n.property_id)?.short : '—'}</td><td>{n.tenant_name ?? '—'}{n.unit && <div className="muted">{n.unit}</div>}</td><td className="n">{n.amount != null ? money(n.amount) : '—'}</td>
          <td>{n.ref ?? '—'}{n.ref_date && <div className="muted">{date(n.ref_date)}</div>}</td><td className="muted">{n.details}</td><td>{n.status === 'open' ? <Tag tone="warn">مفتوحة</Tag> : <><Tag tone="ok">مغلقة</Tag><div className="muted">{n.resolution}</div></>}</td>
          {canEdit && <td className="noprint">{n.status === 'open' ? <form action={resolveNote} className="rowact"><Hidden n="id" v={n.id} /><Hidden n="back" v="/audit?tab=notes" /><input name="resolution" placeholder="الإجراء المتخذ" required style={inp} /><button className="btn sm">إغلاق</button></form>
            : <form action={resolveNote}><Hidden n="id" v={n.id} /><Hidden n="back" v="/audit?tab=notes" /><Hidden n="reopen" v="1" /><button className="btn sm ghost">إعادة فتح</button></form>}</td>}</tr>)}</tbody></table></div></div>}
    </Page>
  );
}
