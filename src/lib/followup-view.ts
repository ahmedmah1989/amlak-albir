import type { DB, FollowUp } from './types';
import type { Analysis } from './calc';
export function latestFollowUps(rows: FollowUp[]) {
  const result=new Map<string,FollowUp>();
  for(const row of [...rows].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))) if(!result.has(row.tenant_id))result.set(row.tenant_id,row);
  return result;
}
export function followUpQueue(db: DB,a: Analysis,today: string) {
  const latest=latestFollowUps(db.followups),queue=new Map<string,{id:string;name:string;arrears:number;last:FollowUp|null;reasons:string[]}>();
  for(const t of a.needFollow)queue.set(t.t.id,{id:t.t.id,name:t.t.name,arrears:t.arrears,last:latest.get(t.t.id)||null,reasons:['متأخرات بلا متابعة خلال 30 يومًا']});
  for(const [tid,last]of latest)if(last.next_date&&last.next_date<=today){const prior=queue.get(tid),stats=a.tenantStats.find(t=>t.t.id===tid);if(prior)prior.reasons.push('حل موعد المتابعة التالية');else queue.set(tid,{id:tid,name:a.T.get(tid)?.name||'مستأجر غير متاح',arrears:stats?.arrears||0,last,reasons:['حل موعد المتابعة التالية']});}
  return [...queue.values()].sort((a,b)=>b.arrears-a.arrears||a.name.localeCompare(b.name,'ar'));
}
