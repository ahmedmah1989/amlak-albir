'use client';
export default function PrintButton({ label = 'طباعة' }: { label?: string }) {
  return <button type="button" className="btn ghost print-btn" onClick={() => window.print()}><svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></svg>{label}</button>;
}
