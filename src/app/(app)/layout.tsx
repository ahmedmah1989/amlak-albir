import Shell from '@/components/Shell';
import DisplayWorkspace from '@/components/DisplayWorkspace';
import { displaysFromPrefs } from '@/lib/display-view';
import { requireUser, ROLE_LABEL } from '@/lib/auth';
import { getSettings, loadDB } from '@/lib/data';
import { analyze } from '@/lib/calc';
import { buildTasks } from '@/lib/tasks';
import { SCREENS, levelFor, parsePerms, canExport, screenOf } from '@/lib/perms';
import { parseFeatures } from '@/lib/features';
import { ensureScheduler } from '@/lib/scheduler';
import { q } from '@/lib/db';
export const dynamic = 'force-dynamic';
const FONTS = ['Readex Pro', 'Almarai', 'Tajawal', 'Cairo', 'IBM Plex Sans Arabic', 'Noto Kufi Arabic', 'Noto Naskh Arabic'];
const mix = (a: string, b: string, t: number) => { const h = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)); const x = h(a), y = h(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const __dt = (l: string) => console.log('[layout-diag]', l, Date.now());
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  __dt('start');
  const u = await requireUser(); __dt('requireUser');
  ensureScheduler();
  const s = await getSettings(); __dt('getSettings');
  const p = (() => { try { return JSON.parse(u.prefs || '{}'); } catch { return {}; } })();
  const font = FONTS.includes(p.font) ? p.font : FONTS.includes(s.font_default) ? s.font_default : 'Readex Pro';
  const pr = s.brand_primary || '#456a42', ac = s.brand_accent || '#ba8f0e', sd = s.brand_side || '#23361f', bg = s.brand_bg || '#f4f5f1';
  const css = `:root{--g:${pr};--g-l:${mix(pr, '#ffffff', 0.88)};--gold:${ac};--gold-d:${mix(ac, '#000000', 0.28)};--gold-l:${mix(ac, '#ffffff', 0.86)};--g-d:${sd};--g-dd:${mix(sd, '#000000', 0.35)};--bg:${bg};--fz:${(p.fz ?? 100) / 100};--font:"${font}"}`;
  const pm = parsePerms(u.perms);
  const allowed = SCREENS.filter((x) => levelFor(u.role, pm, x.key) >= 1).map((x) => x.key);
  let badge = 0; try { __dt('loadDB:start'); const db = await loadDB(); __dt('loadDB:done'); badge = buildTasks(db, analyze(db)).filter((t) => { const sc = screenOf(t.href); return !t.done && (!sc || levelFor(u.role, pm, sc.key) >= 1); }).length; __dt('badge:done'); } catch (e) { console.log('[layout-diag] badge error', String(e).slice(0,200)); }
  let unread = 0; try { [{ n: unread }] = await q(`select count(*)::int as n from notifications where user_id=$1 and read_by=''`, [u.id]); __dt('unread:done'); } catch (e) { console.log('[layout-diag] unread error', String(e).slice(0,200)); }
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <script dangerouslySetInnerHTML={{ __html: `(function(){var t=${JSON.stringify(p.theme ?? 'light')};if(t==='auto')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;})();` }} />
      {font !== 'Readex Pro' && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;600;700&display=swap`} />}
      <DisplayWorkspace initial={displaysFromPrefs(u.prefs)}><Shell org={s.org} logo="/api/logo" allowed={allowed} features={parseFeatures(s.features)} user={{ name: u.full_name, role: u.role, roleLabel: ROLE_LABEL[u.role] }} theme={p.theme ?? 'light'} fz={p.fz ?? 100} badges={{ '/': badge, '/notifications': unread }}>{children}</Shell>
      <span id="amlak-meta" hidden data-user={u.full_name} data-org={s.org} data-export={canExport(u.role, pm) ? '1' : '0'} /></DisplayWorkspace>
    </>
  );
}
