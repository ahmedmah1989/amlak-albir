import Link from 'next/link';
export default function NotFound() {
  return <div className="card"><h2>الصفحة غير موجودة</h2><Link className="btn" href="/">العودة للوحة المتابعة</Link></div>;
}
