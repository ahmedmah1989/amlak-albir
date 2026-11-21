import { cache } from 'react';
// صيغة عرض التاريخ للطلب الحالي (تُضبط في ctx من تفضيل المستخدم أو إعداد الجمعية)
export const dfState = cache(() => ({ v: 'dd/MM/yyyy' }));
