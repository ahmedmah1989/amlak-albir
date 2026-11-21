import { ctx } from '@/lib/ctx';
import { getSettings } from '@/lib/data';
import { Page } from '@/components/ui';
import { Ic } from '@/components/icons';
import { saveAppearance } from '@/lib/actions2';
import SubmitButton from '@/components/SubmitButton';
const PRE: [string, string[]][] = [['هوية الجمعية', ['#456a42', '#ba8f0e', '#23361f', '#f4f5f1']], ['أخضر الموقع', ['#0a6206', '#ba8f0e', '#063803', '#f3f6f2']], ['كحلي رسمي', ['#1d4e89', '#ba8f0e', '#14243d', '#f2f4f8']], ['رمادي هادئ', ['#3b4f5c', '#b07d2b', '#1f2a30', '#f3f4f4']]];
const FONTS = ['Readex Pro', 'Almarai', 'Tajawal', 'Cairo', 'IBM Plex Sans Arabic', 'Noto Kufi Arabic', 'Noto Naskh Arabic'];
export default async function Appearance() {
  const { org, asOf } = await ctx('admin'); const s = await getSettings();
  const pick = (k: string, l: string, h: string) => <label className="fld"><span>{l}</span><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="color" name={k} defaultValue={s[k]} style={{ width: 52, height: 40, padding: 0, border: 0 }} /><small>{h}</small></span></label>;
  return (
    <Page title="الهوية والمظهر" sub="ألوان الجمعية وشعارها وخطها الافتراضي لكل المستخدمين. حجم الخط ونوعه لكل مستخدم من «حسابي»." org={org} asOf={asOf}>
      <form action={saveAppearance} className="frm">
        <div className="g2">
          <div className="card"><h2><Ic n="bld" />الشعار</h2><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: '#fff' }}><img src="/api/logo" alt="الشعار" style={{ height: 80 }} /></div>
            <div style={{ borderRadius: 12, padding: 14, background: 'var(--g-d)' }}><img src="/api/logo" alt="" style={{ height: 80, filter: 'brightness(0) invert(1)' }} /></div></div>
            <label className="fld" style={{ marginTop: 10 }}><span>رفع شعار جديد (PNG شفاف أو SVG، حتى 1 م.ب)</span><input type="file" name="logo" accept="image/png,image/svg+xml,image/jpeg,image/webp" /></label></div>
          <div className="card"><h2><Ic n="doc" />الخط الافتراضي</h2><label className="fld"><span>نوع الخط</span><select name="font_default" defaultValue={s.font_default}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
            <p className="muted">موقع الجمعية يستخدم Droid Arabic Kufi؛ الأقرب له Readex Pro أو Noto Kufi Arabic.</p></div>
        </div>
        <div className="card"><h2><Ic n="palette" />الألوان</h2>
          <div className="grid">{pick('brand_primary', 'اللون الأساسي', 'الأزرار والعناوين')}{pick('brand_accent', 'لون التمييز', 'الشريط العلوي والتنبيهات')}{pick('brand_side', 'لون القائمة', 'القائمة الجانبية والبطاقات الرئيسية')}{pick('brand_bg', 'الخلفية', 'مساحة العمل')}</div>
          <p className="muted">مجموعات جاهزة (تُطبَّق بعد الحفظ):</p>
          <div className="rowact">{PRE.map(([n, c]) => <button key={n} type="submit" className="btn ghost" formAction={async (fd: FormData) => { 'use server'; fd.set('brand_primary', c[0]); fd.set('brand_accent', c[1]); fd.set('brand_side', c[2]); fd.set('brand_bg', c[3]); await saveAppearance(fd); }}>
            <span style={{ display: 'flex', borderRadius: 6, overflow: 'hidden' }}>{[c[2], c[0], c[1]].map((x) => <i key={x} style={{ width: 14, height: 20, background: x }} />)}</span>{n}</button>)}</div>
          <p className="muted">ألوان الحالات (مسدد، مستحق، متأخر، قادم) ثابتة المعنى ولا تتغير مع الهوية.</p></div>
        <div className="fa"><SubmitButton label="حفظ الهوية" /><button className="btn ghost" name="reset" value="1">استعادة هوية الجمعية</button></div>
      </form>
    </Page>
  );
}
