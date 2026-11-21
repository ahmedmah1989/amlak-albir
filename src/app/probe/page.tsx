import { probe, probeRedirect } from '@/lib/probe';

export const dynamic = 'force-dynamic';

export default function ProbePage() {
  return (
    <div style={{ padding: 20 }}>
      <form action={probe as unknown as (fd: FormData) => void}><button name="k" value="probe">probe</button></form>
      <form action={probeRedirect as unknown as (fd: FormData) => void}><button name="k" value="redirect">redirect</button></form>
    </div>
  );
}
