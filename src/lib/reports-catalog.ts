/** كتالوج التقارير — مصدر واحد لمركز التقارير والمفضلة وحزمة المجلس */
export type ReportDef = { id: string; href: string; title: string; group: string; desc: string; feature?: string; isNew?: boolean; pack?: boolean };
export const REPORT_GROUPS = ['التحصيل والمتأخرات', 'العقود والإشغال', 'العقارات والأداء', 'المحاسبة والضريبة', 'الحوكمة'];
export const REPORTS: ReportDef[] = [
  { id: 'collection', href: '/reports/collection', title: 'تقرير التحصيل', group: 'التحصيل والمتأخرات', desc: 'المحصّل مقابل المستحق في الفترة، مع المقارنة بفترة سابقة والتجميع حسب الشهر أو العقار أو طريقة السداد', pack: true },
  { id: 'arrears', href: '/reports/arrears', title: 'المتأخرات المؤكدة', group: 'التحصيل والمتأخرات', desc: 'المتأخرات حسب المستأجر والقسط، وآخر متابعة لكل مستأجر', pack: true },
  { id: 'aging', href: '/reports/aging', title: 'أعمار الديون', group: 'التحصيل والمتأخرات', desc: 'المتأخرات موزعة على 30 و90 و180 و365 يوماً لكل مستأجر', pack: true },
  { id: 'cashflow', href: '/reports/cashflow', title: 'التحصيل والتدفق المتوقع', group: 'التحصيل والمتأخرات', desc: 'المستحق مقابل المحصّل شهرياً، والمتوقع خلال 12 شهراً' },
  { id: 'statement', href: '/reports/statement', title: 'كشف حساب مستأجر', group: 'التحصيل والمتأخرات', desc: 'مدين ودائن ورصيد تراكمي لمستأجر في فترة محددة', isNew: true },
  { id: 'unconfirmed', href: '/reports/unconfirmed', title: 'الأقساط التي تحتاج تأكيداً', group: 'التحصيل والمتأخرات', desc: 'أقساط بلا سند أو مطابقة بنكية تحتاج تأكيد السداد' },
  { id: 'collectors', href: '/reports/collectors', title: 'أداء موظفي التحصيل', group: 'التحصيل والمتأخرات', desc: 'لكل موظف: المستأجرون المسندون، المتأخرات، المحصّل في الفترة، وعدد المتابعات', isNew: true },
  { id: 'renewals', href: '/reports/renewals', title: 'التجديدات والعقود المنتهية', group: 'العقود والإشغال', desc: 'العقود التي تنتهي خلال الفترة المختارة مع موعد التفاوض', pack: true },
  { id: 'occupancy', href: '/reports/occupancy', title: 'الإشغال والشواغر', group: 'العقود والإشغال', desc: 'الوحدات المؤجرة والشاغرة لكل عقار، أيام الشغور، والإيجار الضائع التقديري', isNew: true, pack: true },
  { id: 'deposits', href: '/reports/deposits', title: 'التأمينات المحتجزة', group: 'العقود والإشغال', desc: 'تأمينات العقود: المحتجز والمسترد والمستقطع', isNew: true },
  { id: 'tenant-score', href: '/reports/tenant-score', title: 'تصنيف المستأجرين', group: 'العقود والإشغال', desc: 'A/B/C/D حسب نسبة السداد ومتوسط التأخر وأقدم تأخير' },
  { id: 'documents', href: '/documents?f=expiring', title: 'المستندات الناقصة والمنتهية', group: 'العقود والإشغال', desc: 'هويات وسجلات ومستندات تنتهي خلال 60 يوماً، ونواقص العقود', feature: 'doc_required' },
  { id: 'performance', href: '/reports/performance', title: 'أداء العقارات والعائد', group: 'العقارات والأداء', desc: 'الإيجار والتحصيل والمصروفات والعائد الصافي لكل عقار', pack: true },
  { id: 'revenue', href: '/reports/revenue', title: 'الإيرادات الشهرية حسب العقار', group: 'العقارات والأداء', desc: 'المستحق والمحصّل لكل عقار شهراً بشهر في الفترة', isNew: true, pack: true },
  { id: 'valuations', href: '/reports/valuations', title: 'القيم وإعادة التقييم', group: 'العقارات والأداء', desc: 'قيمة الأرض والمبنى لكل عقار وسجل إعادات التقييم', pack: true },
  { id: 'expenses', href: '/reports/expenses', title: 'المصروفات حسب البند', group: 'العقارات والأداء', desc: 'المصروفات في الفترة مجمّعة حسب البند والعقار', isNew: true },
  { id: 'maintenance', href: '/reports/maintenance', title: 'الصيانة وتكاليفها', group: 'العقارات والأداء', desc: 'الطلبات وحالتها وأعمارها وتكلفتها حسب العقار والمورد', isNew: true },
  { id: 'budget', href: '/reports/budget', title: 'الموازنة مقابل الفعلي', group: 'العقارات والأداء', desc: 'لكل عقار: موازنة الإيرادات والمصروفات مقابل الفعلي', feature: 'accounting' },
  { id: 'journal', href: '/reports/journal', title: 'القيود اليومية', group: 'المحاسبة والضريبة', desc: 'قيود الاستحقاق والتحصيل والضريبة للتصدير لبرنامج المحاسبة', feature: 'accounting' },
  { id: 'vat', href: '/reports/vat', title: 'إقرار ضريبة القيمة المضافة', group: 'المحاسبة والضريبة', desc: 'الإيرادات الخاضعة والضريبة المستحقة والمحصلة', feature: 'accounting' },
  { id: 'invoices', href: '/invoices', title: 'سجل الفواتير الضريبية', group: 'المحاسبة والضريبة', desc: 'الفواتير الصادرة وإشعارات الدائن', feature: 'e_invoice' },
  { id: 'reconciliation', href: '/reports/reconciliation', title: 'المطابقة الثلاثية', group: 'المحاسبة والضريبة', desc: 'البنك والنظام ومنصة إيجار: المطابق وغير المطابق' },
  { id: 'vouchers', href: '/reports/vouchers', title: 'سندات الصرف', group: 'المحاسبة والضريبة', desc: 'سندات رد التأمين والمبالغ المسترجعة للمستأجرين حسب الحالة', isNew: true },
  { id: 'analytics', href: '/analytics', title: 'تحليلات الإدارة', group: 'الحوكمة', desc: 'مقارنة الفترة بفترة سابقة، الاتجاه الشهري، ترتيب العقارات بالصافي والعائد، وملاحظات تلقائية', isNew: true, pack: true },
  { id: 'board', href: '/reports/board', title: 'الملخص التنفيذي للمجلس', group: 'الحوكمة', desc: 'صفحة واحدة: الإيجار والتحصيل والمتأخرات والعقود المنتهية والتوقع', pack: true },
  { id: 'discounts', href: '/reports/discounts', title: 'الخصومات والاعتمادات', group: 'الحوكمة', desc: 'الخصومات والإعفاءات والجدولة وقراراتها ومن اعتمدها', isNew: true },
  { id: 'activity', href: '/reports/activity', title: 'نشاط المستخدمين', group: 'الحوكمة', desc: 'كل عمليات المستخدمين في الفترة حسب المستخدم ونوع العملية', isNew: true },
  { id: 'audit', href: '/audit', title: 'ملاحظات التدقيق وجودة البيانات', group: 'الحوكمة', desc: 'الملاحظات المفتوحة والفحوص التلقائية' },
];
export const reportById = (id: string) => REPORTS.find((r) => r.id === id);
