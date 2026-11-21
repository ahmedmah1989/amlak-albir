'use client';
import { useSearchParams } from 'next/navigation';
export default function Flash() {
  const sp = useSearchParams();
  const ok = sp.get('ok'), err = sp.get('err');
  if (!ok && !err) return null;
  return <div className={'flash noprint ' + (err ? 'err' : 'ok')} role="status">{err ? '⚠ ' + err : '✓ ' + ok}</div>;
}
