'use client';
import { useState } from 'react';
export default function CopyButton({ text, label = 'نسخ الرابط' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="btn sm ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1600); } catch { window.prompt('انسخ الرابط', text); } }}>{ok ? '✓ نُسخ' : label}</button>;
}
