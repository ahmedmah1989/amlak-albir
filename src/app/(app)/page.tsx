import { ctx } from '@/lib/ctx';
import { buildTasks } from '@/lib/tasks';
import { Page } from '@/components/ui';
import { Form, F } from '@/components/form';
import TaskBoard from '@/components/TaskBoard';
import { addTask } from '@/lib/actions2';
import { workspaceFromPrefs } from '@/lib/task-view';
import { uid } from '@/lib/db';
import { dfState } from '@/lib/df';
import { date } from '@/lib/fmt';
import { screenOf, levelFor, parsePerms } from '@/lib/perms';
import { setPref } from '@/lib/actions2';
import Link from 'next/link';

export default async function Home() {
  const { db, a, org, asOf, canEdit, user } = await ctx();
  const pm = parsePerms(user.perms);
  // تظهر للمستخدم المهام التي تقع شاشتها ضمن صلاحياته فقط
  const tasks = buildTasks(db, a).filter((t) => { const sc = screenOf(t.href); return !sc || levelFor(user.role, pm, sc.key) >= 1; });
  return (
    <Page title="مركز العمل اليومي" sub={`أولويات العمل والمتابعة حسب بيانات ${date(asOf)}. اختر عرضك وافتح تفاصيل الحالة عند الحاجة.`} org={org} asOf={asOf} print>
      {(() => { const pr = (() => { try { return JSON.parse(user.prefs || '{}'); } catch { return {}; } })(); if (pr.tour === 'done') return null;
        const steps: [string, string, string][] = [
          ...(user.role === 'admin' ? [['/settings', 'بيانات الجهة والشعار', 'الاسم والرقم الضريبي والعنوان والشعار تظهر في كل المطبوعات.'] as [string, string, string]] : []),
          ['/properties', 'العقارات والوحدات', 'راجع العقارات وقيمها، أو استورد بياناتك من الإكسل.'],
          ['/contracts', 'العقود والأقساط', 'كل عقد بجدول أقساطه، ومنه تسجل السندات والتجديد.'],
          ['/notifications', 'التذكيرات التلقائية', 'تذكير المستأجرين قبل الاستحقاق وبعد التأخر.'],
          ['/account', 'طرق استعادة كلمة المرور', 'بريدك وجوالك وسؤال سري، حتى لا تفقد الدخول.']];
        return <section className="tour noprint" aria-label="ابدأ من هنا"><div className="tour-h"><div><b>ابدأ من هنا</b><span>خمس خطوات تجهّز البرنامج للعمل اليومي. افتح أي خطوة، ثم أخفِ هذه البطاقة عند الانتهاء.</span></div>
          <form action={setPref}><input type="hidden" name="tour" value="done" /><input type="hidden" name="back" value="/" /><button className="btn sm ghost" type="submit">تم، إخفاء</button></form></div>
          <ol>{steps.map(([h, t, d]) => <li key={h}><Link href={h}><b>{t}</b><span>{d}</span></Link></li>)}</ol></section>; })()}
      <TaskBoard tasks={tasks} canEdit={canEdit} df={dfState().v} today={asOf} workspace={workspaceFromPrefs(user.prefs)} followToken={uid('tf')} />
      {canEdit && <details className="box"><summary>إضافة مهمة يدوية</summary><div className="in">
        <Form action={addTask} submit="إضافة المهمة"><F label="العنوان" name="title" req wide /><F label="الموعد" name="due" type="date" />
          <F label="المسؤول" name="assignee" /><F label="الأولوية" name="priority" req def="p2" opts={[['p1', 'عاجل'], ['p2', 'هذا الأسبوع'], ['p3', 'للمتابعة']]} /><F label="التفاصيل" name="details" type="textarea" wide /></Form></div></details>}
    </Page>
  );
}
