// تحويل المبلغ إلى كتابة عربية لسند القبض
const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUND = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100, out: string[] = [];
  if (h) out.push(HUND[h]);
  if (r) out.push(r < 10 ? ONES[r] : r < 20 ? TEENS[r - 10] : (r % 10 ? ONES[r % 10] + ' و' : '') + TENS[Math.floor(r / 10)]);
  return out.join(' و');
}
function group(n: number, one: string, two: string, few: string): string {
  if (n === 1) return one; if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${under1000(n)} ${few}`;
  return `${under1000(n)} ${n % 100 >= 11 ? one + 'اً' : one}`;
}
function words(n: number): string {
  if (n === 0) return 'صفر';
  const b = Math.floor(n / 1e9), m = Math.floor((n % 1e9) / 1e6), t = Math.floor((n % 1e6) / 1000), r = n % 1000, out: string[] = [];
  if (b) out.push(group(b, 'مليار', 'ملياران', 'مليارات'));
  if (m) out.push(group(m, 'مليون', 'مليونان', 'ملايين'));
  if (t) out.push(group(t, 'ألف', 'ألفان', 'آلاف'));
  if (r) out.push(under1000(r));
  return out.join(' و');
}
export function tafqit(amount: number) {
  const riyals = Math.floor(amount + 1e-9), hal = Math.round((amount - riyals) * 100);
  return `فقط ${words(riyals)} ريال سعودي${hal ? ` و${words(hal)} هللة` : ''} لا غير`;
}
