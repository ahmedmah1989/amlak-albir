import { ctx } from '@/lib/ctx';
import { q } from '@/lib/db';
import { Page, Tag } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import { saveUser } from '@/lib/actions';
import { ROLE_LABEL, type Role } from '@/lib/auth';
import { saveUserPerms } from '@/lib/actions3';
import { SCREENS, LEVELS, parsePerms, customized, levelFor, ROLE_RANK } from '@/lib/perms';

const ROLES: [string, string][] = Object.entries(ROLE_LABEL);
export default async function Users() {
  const { org, asOf, user } = await ctx('admin');
  const us = await q('select id,username,full_name,role,active,must_change,perms from users order by created_at');
  return (
    <Page title="المستخدمون والصلاحيات" sub="الدور يحدد الحد الأعلى • صلاحيات الشاشات تقيّد المستخدم بشاشات معينة ومستوى كل شاشة" org={org} asOf={asOf}>
      <div className="card"><div className="tbl"><table><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الدور</th><th>الشاشات</th><th>الحالة</th></tr></thead>
        <tbody>{us.map((u) => <tr key={u.id}><td>{u.full_name}{u.id === user.id && <span className="muted"> (أنت)</span>}</td><td dir="ltr">{u.username}</td><td>{ROLE_LABEL[u.role as Role]}</td><td>{customized(parsePerms(u.perms)) ? <Tag tone="info">مخصصة: {SCREENS.filter((x) => levelFor(u.role, parsePerms(u.perms), x.key) >= 1).length} شاشة</Tag> : <Tag tone="mute">كل شاشات الدور</Tag>}</td>
          <td>{u.active ? <Tag tone="ok">نشط</Tag> : <Tag tone="mute">موقوف</Tag>} {u.must_change && <Tag tone="warn">كلمة مرور مؤقتة</Tag>}</td></tr>)}</tbody></table></div></div>
      {us.map((u) => <details key={u.id} className="box"><summary>تعديل: {u.full_name}</summary><div className="in">
        <Form action={saveUser}><Hidden n="id" v={u.id} /><Hidden n="username" v={u.username} />
          <F label="الاسم" name="full_name" def={u.full_name} req /><F label="الصلاحية" name="role" def={u.role} req opts={ROLES} />
          <F label="كلمة مرور مؤقتة جديدة" name="password" type="password" hint="اتركها فارغة لعدم التغيير" dir="ltr" />
          <label className="fld"><span>الحساب نشط</span><input type="checkbox" name="active" defaultChecked={u.active} style={{ width: 22, height: 22 }} /></label>
        </Form>
        <h3 className="sec-title" style={{ marginTop: 16 }}>صلاحيات الشاشات</h3>
        <p className="muted">المستوى الفعلي لا يتجاوز دور المستخدم ({ROLE_LABEL[u.role as Role]}). «لا يرى» يخفي الشاشة من القائمة ويمنع فتحها بالرابط وتنفيذ أي إجراء منها.</p>
        {(() => { const pm = parsePerms(u.perms), cu = customized(pm), rank = ROLE_RANK[u.role] ?? 1; return <form action={saveUserPerms}><Hidden n="id" v={u.id} />
          <div className="tbl"><table className="perm-grid"><thead><tr><th>الشاشة</th><th>المستوى</th><th>الحالي الفعلي</th></tr></thead><tbody>
            {SCREENS.filter((x) => !x.adminOnly || u.role === 'admin').map((x) => { const cur = cu ? Number(pm.screens?.[x.key] ?? 0) : rank; return <tr key={x.key}><td>{x.label}</td>
              <td><select name={'lv_' + x.key} defaultValue={String(Math.min(cur, rank))}>{LEVELS.filter(([l]) => l <= rank).map(([l, t]) => <option key={l} value={l}>{t}</option>)}</select></td>
              <td>{LEVELS.find(([l]) => l === levelFor(u.role, pm, x.key))?.[1]}</td></tr>; })}
          </tbody></table></div>
          <label className="perm-export"><input type="checkbox" name="export" defaultChecked={!cu || pm.export !== false} /> السماح بتصدير الإكسل</label>
          <div className="fa"><button className="btn" type="submit">حفظ صلاحيات الشاشات</button>{cu && <button className="btn ghost" type="submit" name="mode" value="reset">إعادة لصلاحيات الدور</button>}</div>
        </form>; })()}
        </div></details>)}
      <details className="box" open={us.length < 2}><summary>إضافة مستخدم</summary><div className="in">
        <Form action={saveUser} submit="إضافة المستخدم">
          <F label="الاسم" name="full_name" req /><F label="اسم الدخول (إنجليزي)" name="username" req dir="ltr" />
          <F label="الصلاحية" name="role" req def="accountant" opts={ROLES} /><F label="كلمة مرور مؤقتة" name="password" type="password" req dir="ltr" hint="يُطلب تغييرها عند أول دخول" />
          <input type="hidden" name="active" value="1" />
        </Form></div></details>
    </Page>
  );
}
