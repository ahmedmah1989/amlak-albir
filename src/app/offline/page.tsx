export const dynamic = 'force-static';
export default function Offline() {
  return <main className="paypage"><div className="pay-card"><h1 style={{ margin: 0, fontSize: '1.3rem' }}>لا يوجد اتصال بالإنترنت</h1>
    <p>البرنامج يحتاج اتصالاً ليعرض البيانات المحدثة. تأكد من الشبكة ثم أعد المحاولة.</p><a className="btn pay-btn" href="/">إعادة المحاولة</a></div></main>;
}
