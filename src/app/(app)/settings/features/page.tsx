import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import { Form, F } from '@/components/form';
import { saveFeatures, saveFeatureCfg } from '@/lib/actions4';
import { FEATURES, parseFeatureCfg } from '@/lib/features';

export default async function Features() {
  const { db, org, asOf } = await ctx('admin');
  const f = db.meta.features, cfg = parseFeatureCfg(db.meta.settings), S = db.meta.settings;
  return (
    <Page title="الميزات الاختيارية" sub="كل ميزة تعمل فقط عند تفعيلها. الإيقاف يخفي الشاشات والإجراءات والتنبيهات دون حذف أي بيانات." org={org} asOf={asOf}>
      <form action={saveFeatures} className="card frm">
        <div className="feat-list">{FEATURES.map((x) => <label key={x.key} className={'feat' + (f[x.key] ? ' on' : '')}>
          <input type="checkbox" name={'f_' + x.key} defaultChecked={f[x.key]} />
          <span><b>{x.label}</b> {f[x.key] ? <Tag tone="ok">مفعّلة</Tag> : <Tag tone="mute">مقفلة</Tag>}<small>{x.desc}</small></span></label>)}</div>
        <div className="fa"><button className="btn" type="submit">حفظ الميزات</button></div>
      </form>
      <div className="card"><h2>إعدادات الميزات</h2>
        <Form action={saveFeatureCfg}>
          <h3 className="sec-title">غرامات التأخير</h3>
          <F label="نسبة الغرامة الشهرية % من الرصيد" name="late_fee_pct" type="number" def={cfg.late_fee_pct} req min="0" max="10" />
          <F label="تبدأ بعد (يوم تأخير بعد المهلة)" name="late_fee_after" type="number" def={cfg.late_fee_after} req min="0" max="365" />
          <F label="الحد الأقصى % من رصيد القسط" name="late_fee_cap_pct" type="number" def={cfg.late_fee_cap_pct} req min="0" max="100" />
          <h3 className="sec-title">العدادات</h3>
          <F label="تعرفة الكهرباء (ريال/كيلوواط)" name="elec_rate" type="number" def={S.elec_rate ?? '0.18'} req />
          <F label="تعرفة المياه (ريال/م³)" name="water_rate" type="number" def={S.water_rate ?? '6'} req />
          <h3 className="sec-title">المستندات المطلوبة</h3>
          <F label="سطر لكل متطلب: الجهة:الأنواع المقبولة مفصولة بـ |" name="required_docs" type="textarea" wide def={cfg.required_docs.join('\n')}
            hint="الجهة: tenant أو contract أو unit. مثال: tenant:الهوية|السجل التجاري — contract:نسخة العقد الموقعة — contract:ضمان / شيك تأمين" />
        </Form></div>
    </Page>
  );
}
