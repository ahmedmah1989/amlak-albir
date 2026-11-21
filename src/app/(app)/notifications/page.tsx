import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { getSettings } from '@/lib/data';
import { smtpFrom } from '@/lib/mailer';
import { smsReady, waReady } from '@/lib/sms';
import { CHANNELS, KINDS, STATUS, ensureDefaultRules } from '@/lib/notify';
import { runNotifyNow, previewNotify, approveAndSend, cancelItems, markManualSent, setTenantOptOut, markRead, saveRule, deleteRule, saveNotifySettings } from '@/lib/notify-actions';
import { date } from '@/lib/fmt';
export const dynamic = 'force-dynamic';

const TABS: [string, string][] = [['queue', 'بانتظار الإجراء'], ['log', 'سجل الإرسال'], ['mine', 'تنبيهاتي'], ['rules', 'القواعد'], ['settings', 'الإعدادات']];
const CH = Object.fromEntries(CHANNELS);
const KL = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));
const dt = (v: unknown) => v ? new Date(String(v)).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function RuleForm({ r, kinds }: { r?: Record<string, any>; kinds: typeof KINDS }) {
  const ch = new Set(String(r?.channels ?? 'sms').split(','));
  return <form action={saveRule} className="frm nt-rule-form">
    {r && <input type="hidden" name="id" value={r.id} />}
    <div className="grid">
      <label className="fld"><span>نوع التنبيه</span><select name="kind" defaultValue={r?.kind ?? 'due_soon'}>{kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
      <label className="fld"><span>اسم القاعدة</span><input name="name" defaultValue={r?.name} required maxLength={80} /></label>
      <label className="fld"><span>عدد الأيام</span><input name="offset_days" type="number" min={0} max={365} defaultValue={r?.offset_days ?? 7} /><small>قبل الاستحقاق/الانتهاء، أو بعد التأخر</small></label>
      <label className="fld"><span>التكرار كل (يوم)</span><input name="repeat_days" type="number" min={0} max={365} defaultValue={r?.repeat_days ?? 0} /><small>للمطالبات فقط — 0 = مرة واحدة</small></label>
      <fieldset className="fld wide"><span>القنوات</span><div className="chips">{CHANNELS.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" name="channels" value={k} defaultChecked={ch.has(k)} /> {l}</label>)}</div></fieldset>
      <label className="fld"><span>طريقة الإرسال</span><select name="mode" defaultValue={r?.mode ?? 'review'}><option value="review">بعد مراجعة موظف (موصى به)</option><option value="auto">تلقائي بدون مراجعة</option></select></label>
      <label className="fld"><span>الحالة</span><select name="active" defaultValue={r?.active === false ? '0' : '1'}><option value="1">مفعّلة</option><option value="0">موقوفة</option></select></label>
      <label className="fld wide"><span>عنوان البريد</span><input name="subject" defaultValue={r?.subject} maxLength={120} /></label>
      <label className="fld wide"><span>نص الرسالة</span><textarea name="template" rows={5} defaultValue={r?.template} /><small>المتغيرات حسب النوع: {(kinds.find((k) => k.key === (r?.kind ?? 'due_soon')) ?? kinds[0]).vars}</small></label>
    </div>
    <div className="fa"><button className="btn" type="submit">{r ? 'حفظ التعديل' : 'إضافة القاعدة'}</button></div>
  </form>;
}

export default async function Notifications({ searchParams }: { searchParams: { tab?: string; st?: string } }) {
  const { org, asOf, user, level, isAdmin } = await ctx();
  await ensureDefaultRules();
  const tab = TABS.some((t) => t[0] === searchParams.tab) ? searchParams.tab! : level >= 2 ? 'queue' : 'mine';
  const S = await getSettings();
  const [counts] = await q(`select count(*) filter (where status='pending')::int as pending, count(*) filter (where status='manual')::int as manual, count(*) filter (where status='failed')::int as failed,
    count(*) filter (where status='sent' and sent_at > now() - interval '30 days')::int as sent30, count(*) filter (where status='skipped' and created_at > now() - interval '30 days')::int as skipped30 from notify_queue`);
  const back = `/notifications?tab=${tab}`;
  const ready = { email: !!smtpFrom(S), sms: smsReady(S), whatsapp: true, internal: true } as Record<string, boolean>;
  const tabsEl = <nav className="detail-tabbar" aria-label="أقسام التنبيهات">{TABS.filter(([k]) => (k !== 'rules' && k !== 'settings') || isAdmin).filter(([k]) => level >= 2 || k === 'mine').map(([k, l]) =>
    <Link key={k} href={`/notifications?tab=${k}`} className={'nt-tab' + (tab === k ? ' on' : '')}>{l}{k === 'queue' && counts.pending + counts.manual + counts.failed ? <em>{counts.pending + counts.manual + counts.failed}</em> : null}</Link>)}</nav>;

  let body: JSX.Element;
  if (tab === 'mine') {
    const rows = await q(`select * from notifications where user_id=$1 order by created_at desc limit 200`, [user.id]);
    body = <div className="card"><div className="card-head"><h2>تنبيهاتي</h2>{rows.some((r) => !r.read_by) && <form action={markRead}><button className="btn sm ghost" type="submit">تعليم الكل كمقروء</button></form>}</div>
      {rows.length ? <ul className="nt-list">{rows.map((r) => <li key={r.id} className={(r.read_by ? 'read ' : '') + r.tone}>
        <div><b>{r.title}</b><small>{dt(r.created_at)}</small></div><p>{r.body}</p>
        <form action={markRead}><input type="hidden" name="id" value={r.id} />{r.href && <input type="hidden" name="href" value={r.href} />}
          {r.href ? <button className="btn sm" type="submit">فتح</button> : !r.read_by ? <button className="btn sm ghost" type="submit">تمت القراءة</button> : null}</form></li>)}</ul>
        : <p className="muted empty">لا توجد تنبيهات. يصلك هنا الملخص اليومي وتنبيهات العقود حسب القواعد.</p>}</div>;
  } else if (tab === 'rules' && isAdmin) {
    const rules = await q('select * from notify_rules order by audience desc, created_at');
    body = <>{rules.map((r) => <details key={r.id} className="card nt-rule"><summary>
        <b>{r.name}</b> <Tag tone={r.active ? 'ok' : 'mute'}>{r.active ? 'مفعّلة' : 'موقوفة'}</Tag> <Tag tone={r.mode === 'auto' ? 'warn' : 'info'}>{r.mode === 'auto' ? 'تلقائي' : 'بمراجعة'}</Tag>
        <span className="muted">{KL[r.kind]} • {r.kind === 'staff_digest' ? 'يومياً' : `${r.offset_days} يوماً`}{r.repeat_days ? ` • يتكرر كل ${r.repeat_days} يوماً` : ''} • {String(r.channels).split(',').map((c: string) => CH[c]).join('، ')}</span></summary>
        <RuleForm r={r} kinds={KINDS} />
        <form action={deleteRule} className="inline"><input type="hidden" name="id" value={r.id} /><button className="btn sm danger" type="submit">حذف القاعدة</button></form></details>)}
      <details className="card"><summary><b>＋ قاعدة جديدة</b></summary><RuleForm kinds={KINDS} /></details></>;
  } else if (tab === 'settings' && isAdmin) {
    body = <div className="card"><h2>إعدادات التشغيل والقنوات</h2>
      <div className="nt-ch">{CHANNELS.map(([k, l]) => <div key={k} className={'nt-chs ' + (k === 'whatsapp' ? (waReady(S) ? 'ok' : 'info') : ready[k] ? 'ok' : 'bad')}><b>{l}</b><span>{k === 'whatsapp' ? (waReady(S) ? 'عبر بوابة API' : 'يدوي: زر يفتح المحادثة جاهزة') : ready[k] ? 'جاهز' : k === 'email' ? 'يحتاج إعداد البريد' : 'يحتاج بوابة الرسائل'}</span></div>)}</div>
      {(!ready.email || !ready.sms) && <p className="note">البريد وبوابة الرسائل النصية يُضبطان من <Link href="/settings">الإعدادات ← البريد والرسائل</Link>.</p>}
      <form action={saveNotifySettings} className="frm"><div className="grid">
        <label className="fld"><span>التشغيل التلقائي اليومي</span><select name="notify_enabled" defaultValue={S.notify_enabled === '1' ? '1' : '0'}><option value="0">موقوف (تشغيل يدوي فقط)</option><option value="1">مفعّل</option></select></label>
        <label className="fld"><span>ساعة التشغيل (بتوقيت الرياض)</span><input name="notify_hour" type="number" min={0} max={23} defaultValue={S.notify_hour || '9'} /><small>يعمل مرة يومياً بعد هذه الساعة، طالما البرنامج شغال</small></label>
        <label className="fld wide"><span>رابط بوابة واتساب (اختياري)</span><input name="wa_url" dir="ltr" defaultValue={S.wa_url} placeholder="https://..." /><small>من مزود واتساب للأعمال. يمكن أن يحتوي {'{phone}'} و{'{message}'}. بدونه يكون الإرسال يدوياً برابط</small></label>
        <label className="fld"><span>طريقة الطلب</span><select name="wa_method" defaultValue={S.wa_method || 'POST'}><option>POST</option><option>GET</option></select></label>
        <label className="fld"><span>جسم الطلب (لـ POST)</span><input name="wa_body" dir="ltr" defaultValue={S.wa_body} placeholder='{"to":"{phone}","text":"{message}"}' /></label>
        <label className="fld"><span>{S.wa_auth ? 'ترويسة التفويض (محفوظة — اكتب جديدة أو - للحذف)' : 'ترويسة التفويض Authorization'}</span><input name="wa_auth" type="password" dir="ltr" autoComplete="off" /></label>
      </div><div className="fa"><button className="btn" type="submit">حفظ الإعدادات</button></div></form>
      <p className="muted">آخر تشغيل تلقائي: {S.notify_last_run ? date(S.notify_last_run) : 'لم يحدث بعد'}.</p></div>;
  } else {
    const isLog = tab === 'log', st = searchParams.st ?? '';
    const where = isLog ? (st ? `status=$1` : `status in ('sent','skipped','cancelled')`) : `status in ('pending','manual','failed','approved')`;
    const rows = await q(`select n.*, t.notify_opt_out from notify_queue n left join tenants t on t.id=n.tenant_id where ${where} and n.channel<>'internal' order by n.created_at desc limit 400`, isLog && st ? [st] : []);
    body = <>
      {!isLog && <div className="kpis"><Kpi tone={counts.pending ? 'warn' : ''} l="بانتظار المراجعة" v={String(counts.pending)} /><Kpi tone="info" l="واتساب جاهز للإرسال اليدوي" v={String(counts.manual)} /><Kpi tone={counts.failed ? 'bad' : ''} l="فشل الإرسال" v={String(counts.failed)} /><Kpi l="أُرسل خلال 30 يوماً" v={String(counts.sent30)} s={counts.skipped30 ? `${counts.skipped30} لم تُرسل لنقص البيانات` : undefined} /></div>}
      {isLog && <div className="chips noprint">{[['', 'الكل'], ['sent', 'أُرسل'], ['skipped', 'لم يُرسل'], ['cancelled', 'أُلغي']].map(([k, l]) => <a key={k} href={`/notifications?tab=log${k ? '&st=' + k : ''}`} className={st === k ? 'on' : ''}>{l}</a>)}</div>}
      {rows.length ? <form className="card nt-queue"><input type="hidden" name="back" value={back} />
        {!isLog && <div className="nt-bulk noprint"><label className="chk"><input type="checkbox" className="nt-all" /> تحديد الكل</label>
          <button className="btn sm" formAction={approveAndSend} type="submit">اعتماد وإرسال المحدد</button>
          <button className="btn sm ghost" formAction={markManualSent} type="submit">تسجيل المحدد كمُرسل يدوياً</button>
          <button className="btn sm ghost danger" formAction={cancelItems} type="submit">إلغاء المحدد</button></div>}
        <div className="tbl"><table><thead><tr>{!isLog && <th />}<th>التاريخ</th><th>النوع</th><th>المستلم</th><th>القناة</th><th>الرسالة</th><th>الحالة</th>{!isLog && <th />}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}>
            {!isLog && <td><input type="checkbox" name="ids" value={r.id} aria-label="تحديد" /></td>}
            <td className="nowrap">{date(r.scheduled_on)}{isLog && r.sent_at && <div className="muted">{dt(r.sent_at)}</div>}</td>
            <td>{KL[r.kind] ?? r.kind}</td>
            <td>{r.tenant_id ? <Link href={`/tenants/${r.tenant_id}`}>{r.recipient}</Link> : r.recipient}<div className="muted" dir="ltr">{r.to_addr}</div></td>
            <td>{CH[r.channel]}</td>
            <td className="nt-msg"><details><summary>{String(r.body).split('\n')[1] ?? String(r.body).slice(0, 80)}</summary><pre>{r.body}</pre></details></td>
            <td><Tag tone={(STATUS[r.status]?.[1] ?? 't-mute').slice(2)}>{STATUS[r.status]?.[0] ?? r.status}</Tag>{r.error && <div className="muted">{r.error}</div>}{r.sent_by && isLog && <div className="muted">{r.sent_by}</div>}</td>
            {!isLog && <td className="nowrap">{r.status === 'manual' && <a className="btn sm" href={`/api/notify-wa?id=${r.id}`} target="_blank" rel="noopener">فتح واتساب</a>}
              {r.tenant_id && <button className="btn sm ghost" formAction={setTenantOptOut} name="tenant_id" value={r.tenant_id} title="لن تُرسل تذكيرات لهذا المستأجر">إيقاف مراسلته</button>}<input type="hidden" name="on" value="1" /></td>}
          </tr>)}</tbody></table></div>
        <script dangerouslySetInnerHTML={{ __html: `document.querySelectorAll('.nt-all').forEach(a=>a.addEventListener('change',()=>a.closest('form').querySelectorAll('input[name=ids]').forEach(c=>c.checked=a.checked)))` }} />
      </form> : <p className="muted empty card">{isLog ? 'لا يوجد سجل بعد.' : 'لا توجد تذكيرات بانتظار الإجراء. اضغط «تشغيل الآن» لإنشاء تذكيرات اليوم حسب القواعد.'}</p>}</>;
  }
  return (
    <Page title="التنبيهات والتذكيرات" sub={`تذكيرات المستأجرين بالأقساط والمتأخرات وانتهاء العقود، وتنبيهات الموظفين. التشغيل التلقائي: ${S.notify_enabled === '1' ? `مفعّل يومياً الساعة ${S.notify_hour || 9}` : 'موقوف'}.`} org={org} asOf={asOf}
      actions={level >= 2 ? <><form action={previewNotify} className="inline"><input type="hidden" name="back" value={back} /><button className="btn ghost" type="submit">تجهيز تذكيرات اليوم بدون إرسال</button></form>
        <form action={runNotifyNow} className="inline"><input type="hidden" name="back" value={back} /><button className="btn" type="submit">تشغيل الآن</button></form></> : undefined}>
      {tabsEl}
      {body}
    </Page>
  );
}
