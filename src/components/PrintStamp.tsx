'use client';
import { useEffect, useState } from 'react';
const fmt = () => {
  const d = new Date();
  const g = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', '');
  let h = ''; try { h = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'numeric', year: 'numeric' }).format(d).replace(/[^\d/]/g, '') + 'هـ'; } catch {}
  return `${g}${h ? ' • ' + h : ''}`;
};
/** تاريخ ووقت الطباعة الفعلي (يُحدَّث لحظة الطباعة) */
export default function PrintStamp() {
  const [t, setT] = useState('');
  useEffect(() => { setT(fmt()); const on = () => setT(fmt()); window.addEventListener('beforeprint', on); return () => window.removeEventListener('beforeprint', on); }, []);
  return <span suppressHydrationWarning>{t}</span>;
}
