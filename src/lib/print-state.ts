import { cache } from 'react';
// بيانات ترويسة الطباعة وصلاحية التصدير للطلب الحالي (تُضبط في ctx)
export const printState = cache(() => ({ user: '', org: '', exp: true }));
