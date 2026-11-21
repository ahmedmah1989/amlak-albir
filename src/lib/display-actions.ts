'use server';
import { requireUser } from './auth';
import { q } from './db';
import { cleanGridWorkspace, GRID_KEYS } from './display-view';
export async function saveDisplayWorkspace(key: string, raw: unknown) {
  const user=await requireUser();
  if(!GRID_KEYS.includes(key)||(JSON.stringify(raw)||'').length>40000)return {ok:false,message:'إعدادات العرض غير صالحة.'};
  const workspace=cleanGridWorkspace(raw);
  await q(`update users set prefs=jsonb_set(coalesce(nullif(prefs,''),'{}')::jsonb,'{table_views}',coalesce(coalesce(nullif(prefs,''),'{}')::jsonb->'table_views','{}'::jsonb)||jsonb_build_object($1::text,$2::jsonb),true)::text where id=$3`,[key,JSON.stringify(workspace),user.id]);
  return {ok:true,message:'حُفظ العرض في حسابك مع فلاتر الصفحة الحالية.'};
}
