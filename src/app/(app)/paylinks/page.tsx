import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { getSettings } from '@/lib/data';
import { money, date } from '@/lib/fmt';
import { waLink } from '@/lib/messages';
import { LINK_STATUS, PROVIDERS, payReady, publicBase, orgQ } from '@/lib/paylinks';
import { cancelPayLink, recheckPayLink, savePaySettings } from '@/lib/paylink-actions';
import { headers } from 'next/headers';
import CopyButton from '@/components/CopyButton';
export const dynamic = 'force-dynamic';
export default async function PayLinks({ searchParams }: { searchParams: { tab?: string; st?: string; open?: string } }) {
  const { org, asOf, canEdit, isAdmin } = await ctx();
  const S = await getSettings(); const h = headers();
  const base = publicBase(S, `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`);
  const tab = searchParams.tab === 'settings' && isAdmin ? 'settings' : 'list';
  const st = searchParams.st ?? '';
  const rows = await q(`select l.*, t.name as tenant_name, t.phone, p.receipt_no from payment_links l join tenants t on t.id=l.tenant_id left join payments p on p.id=l.payment_id ${st ? 'where l.status=$1' : ''} order by l.created_at desc limit 300`, st ? [st] : []);
  const [k] = await q(`select count(*) filter (where status='pending')::int pending, coalesce(sum(amount) filter (where status='pending'),0)::float pending_amt, count(*) filter (where status='paid' and paid_at > now() - interval '30 days')::int paid30, coalesce(sum(paid_amount) filter (where status='paid' and paid_at > now() - interval '30 days'),0)::float paid30_amt, count(*) filter (where error is not null and status='paid')::int unposted from payment_links`);
  const url = (t: string) => `${base}/pay/${t}${orgQ()}`;
  return (
    <Page title="روابط الدفع الإلكتروني" sub={payReady(S) ? `البوابة: ${PROVIDERS.find((p) => p[0] === S.pay_provider)?.[1]}. المستأجر يدفع بمدى أو البطاقة أو Apple Pay، ويُسجَّل السند تلقائياً.` : 'الدفع الإلكتروني غير مفعّل بعد — اضبط البوابة من تبويب الإعدادات.'} org={org} asOf={asOf}
      actions={canEdit ? <Link className="btn" href="/paylinks/new">＋ رابط دفع</Link> : undefined}>
      <nav className="detail-tabbar"><Link href="/paylinks" className={'nt-tab' + (tab === 'list' ? ' on' : '')}>الروابط</Link>{isAdmin && <Link href="/paylinks?tab=settings" className={'nt-tab' + (tab === 'settings' ? ' on' : '')}>الإعدادات</Link>}</nav>
      {tab === 'settings' ? <form action={savePaySettings} className="card frm"><h2>بوابة الدفع</h2>
        <div className="grid">
          <label className="fld"><span>البوابة</span><select name="pay_provider" defaultValue={S.pay_provider ?? ''}><option value="">موقوف</option>{PROVIDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><small>ابدأ ببيئة التجربة لتجرّب الدورة كاملة</small></label>
          <label className="fld"><span>{S.pay_secret ? 'المفتاح السري (محفوظ — اكتب جديداً أو - للحذف)' : 'المفتاح السري من البوابة'}</span><input name="pay_secret" type="password" dir="ltr" autoComplete="off" placeholder="sk_live_…" /><small>من لوحة ميسر أو تاب. لا يدخل في النسخ الاحتياطي</small></label>
          <label className="fld"><span>رابط البرنامج على الإنترنت</span><input name="pay_base_url" dir="ltr" defaultValue={S.pay_base_url} placeholder="https://amlak.example.com" /><small>ضروري لعودة المستأجر من البوابة. على الجهاز المحلي لا يصل المستأجر للرابط إلا بعد الرفع على السحابة أو نشر الجهاز</small></label>
          <label className="fld"><span>صلاحية الرابط (يوم)</span><input name="pay_link_days" type="number" min={1} max={60} defaultValue={S.pay_link_days || '7'} /></label>
          <label className="fld"><span>إضافة رابط الدفع للتذكيرات</span><select name="pay_in_reminders" defaultValue={S.pay_in_reminders === '1' ? '1' : '0'}><option value="0">لا</option><option value="1">نعم — يُستبدل {'{رابط_الدفع}'} في نص التذكير</option></select></label>
        </div><div className="fa"><button className="btn" type="submit">حفظ</button></div>
        <p className="note">رابط الإشعارات (Webhook) اللي تحطه في لوحة البوابة: <code dir="ltr">{base}/api/pay/webhook{orgQ()}</code> — اختياري؛ البرنامج يتحقق كمان عند رجوع المستأجر وكل 10 دقائق.</p></form>
      : <>
        <div className="kpis"><Kpi tone="warn" l="روابط بانتظار الدفع" v={String(k.pending)} s={`${money(k.pending_amt)} ريال`} href="/paylinks?st=pending" /><Kpi tone="info" l="مدفوع خلال 30 يوماً" v={money(k.paid30_amt)} unit="ريال" s={`${k.paid30} عملية`} href="/paylinks?st=paid" />
          <Kpi tone={k.unposted ? 'bad' : ''} l="مدفوع ولم يُسجَّل آلياً" v={String(k.unposted)} s="يحتاج تسجيل سند يدوي" /></div>
        <div className="chips noprint">{[['', 'الكل'], ...Object.entries(LINK_STATUS).map(([k2, v]) => [k2, v[0]])].map(([k2, l]) => <Link key={k2} className={'chip' + (st === k2 ? ' on' : '')} href={`/paylinks${k2 ? '?st=' + k2 : ''}`}>{l}</Link>)}</div>
        <div className="card"><div className="tbl"><table><thead><tr><th>التاريخ</th><th>المستأجر</th><th>الوصف</th><th className="n">المبلغ</th><th>الحالة</th><th>الرابط</th><th /></tr></thead><tbody>
          {rows.map((r) => { const [sl, tone] = LINK_STATUS[r.status] ?? [r.status, 'mute']; const wa = waLink(r.phone, `السلام عليكم ${r.tenant_name}،\nرابط سداد ${r.description} بمبلغ ${money(Number(r.amount))} ريال:\n${url(r.token)}\n${org}`);
            return <tr key={r.id} className={searchParams.open === r.id ? 'hl' : ''}><td className="nowrap">{date(String(r.created_at).slice(0, 10))}</td><td><Link href={`/tenants/${r.tenant_id}`}>{r.tenant_name}</Link></td><td>{r.description}</td><td className="n">{money(Number(r.amount))}</td>
              <td><Tag tone={tone}>{sl}</Tag>{r.receipt_no && <div><Link href={`/payments/${r.payment_id}`}>سند {r.receipt_no}</Link></div>}{r.error && <div className="muted">{r.error}</div>}</td>
              <td className="nowrap">{['pending', 'failed'].includes(r.status) && <><CopyButton text={url(r.token)} />{wa && <a className="btn sm ghost" href={wa} target="_blank" rel="noopener">واتساب</a>}</>}<a className="btn sm ghost" href={`/pay/${r.token}${orgQ()}`} target="_blank" rel="noopener">فتح</a></td>
              <td className="nowrap">{canEdit && ['pending', 'processing', 'failed'].includes(r.status) && r.provider_id && <form action={recheckPayLink} className="inline"><input type="hidden" name="id" value={r.id} /><button className="btn sm ghost" type="submit">تحقق الآن</button></form>}
                {canEdit && ['pending', 'failed', 'expired'].includes(r.status) && <form action={cancelPayLink} className="inline"><input type="hidden" name="id" value={r.id} /><button className="btn sm ghost danger" type="submit">إلغاء</button></form>}</td></tr>; })}
          {!rows.length && <tr><td colSpan={7} className="muted">لا توجد روابط. أنشئ رابطاً من هنا أو من صفحة العقد أو المستأجر.</td></tr>}</tbody></table></div></div></>}
    </Page>
  );
}
