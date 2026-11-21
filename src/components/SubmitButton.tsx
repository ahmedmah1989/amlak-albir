'use client';
import { useFormStatus } from 'react-dom';
export default function SubmitButton({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={'btn' + (danger ? ' danger' : ' alt')} disabled={pending}>{pending ? 'جارٍ الحفظ…' : label}</button>;
}
