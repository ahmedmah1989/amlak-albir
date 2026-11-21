import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Tag, Empty } from '@/components/ui';
import { Ic } from '@/components/icons';
import { matchBankLine, ignoreBankLine } from '@/lib/actions2';
import { suggest, confidence } from '@/lib/match';
import { money, date } from '@/lib/fmt';

export default async function Match() {
  const { db, a, org, asOf, canEdit } = await ctx();
  const open = db.bankLines.filter((l) => l.status === 'open').sort((x, y) => x.date.localeCompare(y.date));
  const unp = a.payments.filter((p) => !p.bank_line_id);
  const data = open.map((l) => { const c = suggest(db, a, l); const amb = c.length > 1 && c[1].score >= c[0].score - 5; return { l, c, amb }; });
  const sure = data.filter((d) => d.c[0] && !d.amb && confidence(d.c[0].score) === 'ok').length;
  return (
    <Page title="المطابقة البصرية" sub="إيداعات البنك ← ما يقابلها في النظام ← حالة منصة إيجار" org={org} asOf={asOf} print actions={<Link className="btn ghost" href="/bank"><Ic n="up" />استيراد كشف</Link>}>
      <div className="kpis">
        <Kpi tone="hero" l="إيداعات مفتوحة" v={String(open.length)} s={`${money(open.reduce((x, l) => x + l.amount, 0))} ريال`} />
        <Kpi tone="info" l="مقترح بثقة عالية" v={String(sure)} s="تأكيدها بضغطة" />
        <Kpi tone="warn" l="سندات غير مطابقة" v={String(unp.length)} s={`${money(unp.reduce((x, p) => x + p.amount, 0))} ريال`} href="/payments" />
        <Kpi l="مطابق حتى الآن" v={String(db.bankLines.filter((l) => l.status === 'matched').length)} href="/bank/lines" />
      </div>
      {!open.length ? <Empty>لا إيداعات مفتوحة. استورد كشف بنك جديداً.</Empty> :
      <div className="mx">
        <div className="row" style={{ background: 'var(--g-d)', color: '#fff', fontWeight: 600 }}><div>إيداع البنك</div><div>المقابل المقترح في النظام (وحالة إيجار)</div><div>إجراء آخر</div></div>
        {data.map(({ l, c, amb }) => <div className="row" key={l.id}>
          <div className="bank"><small>{date(l.date)}</small><b>{money(l.amount)}</b><small>{l.description}</small>{l.ref && <small dir="ltr">{l.ref}</small>}</div>
          <div>{amb && <p className="note warn" style={{ marginTop: 0 }}>أكثر من مقابل بنفس المبلغ؛ المعتاد تخصيص الإيداع لأقدم قسط غير مسدد (الأول في القائمة).</p>}{c.length ? c.map((x, k) => { const cf = amb && confidence(x.score) === 'ok' ? 'maybe' : confidence(x.score); return <div key={k} className={`cand ${cf}`}>
            <span className="cf">{cf === 'ok' ? '✓ مرجح' : cf === 'maybe' ? '؟ محتمل' : 'ضعيف'}</span>
            <div><b>{x.label}</b>{x.sub}{x.ejar && <> • <Tag tone={x.ejar.includes('تم الدفع') ? 'ok' : 'warn'}>{x.ejar}</Tag></>}</div>
            {canEdit && <form action={matchBankLine}><input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="kind" value={x.kind} /><input type="hidden" name="ids" value={x.ids.join(',')} />
              <button className={'btn sm ' + (cf === 'ok' ? '' : 'ghost')}>{x.kind === 'payment' ? 'ربط بالسند' : 'إنشاء سند ومطابقة'}</button></form>}</div>; })
            : <p className="muted">لا يوجد مقابل بنفس المبلغ. قد يكون إيداعاً مجمّعاً أو ليس إيجاراً.</p>}</div>
          <div>{canEdit && <form action={ignoreBankLine} className="rowact"><input type="hidden" name="line_id" value={l.id} /><input name="note" placeholder="سبب الاستبعاد" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '2px 8px' }} /><button className="btn sm ghost">ليس إيجاراً</button></form>}</div>
        </div>)}</div>}
      <p className="muted">الترجيح يعتمد على: تطابق المبلغ، وقرب التاريخ من الاستحقاق (دفعات إيجار عبر سداد قد تتأخر حتى 5 أيام عمل)، ووجود اسم المستأجر أو رقم العقد في وصف التحويل. الإيداع الذي يساوي مجموع عدة أقساط متتالية لنفس العقد يُقترح كدفعة واحدة.</p>
    </Page>
  );
}
