// Daily backup tick. Calls the app's existing /api/cron/backup route, which
// runs runBackup('auto') for each active org. Destinations are whatever the
// app has configured (folder on persistent hosts, Supabase Storage when
// SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY are set); with neither configured the
// run is recorded as 'download-only' in backups_log and costs one invocation.
// 06:00 UTC = 09:00 Asia/Riyadh, matching the app's default notify_hour.
export default async () => {
  const base = process.env.URL || 'https://amlak-albir.netlify.app';
  const res = await fetch(`${base}/api/cron/backup`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  if (!res.ok) throw new Error(`backup tick failed: ${res.status}`);
  console.log('backup tick ok', res.status);
};

export const config = { schedule: '0 6 * * *' };
