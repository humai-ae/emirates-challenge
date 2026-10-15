import type { Translation } from "./translation";
import type { uiEn } from "./ui-en";

export const uiAr: Translation<typeof uiEn> = {
  appName: "مدقق الامتثال للموارد البشرية",
  syntheticData: "بيانات اصطناعية فقط",
  language: { label: "اللغة", en: "English", ar: "العربية" },
  nav: { label: "القائمة الرئيسية", switchRole: "تبديل الدور", signOut: "تسجيل الخروج" },
  roles: {
    admin: "المسؤول",
    analyst: "محلل الامتثال",
    lead: "قائد فريق العمليات",
    auditor: "المدقق الداخلي",
  },
  states: { loading: "جارٍ التحميل…", error: "حدث خطأ ما. حاول مرة أخرى." },
  audit: {
    title: "سجل التدقيق",
    subtitle: "كل إجراء قام به الأشخاص أو النظام، الأحدث أولاً. لا يمكن تعديل الإدخالات أو حذفها.",
    columns: { when: "الوقت", who: "المستخدم", what: "الإجراء", object: "العنصر" },
    actions: {
      auth_sign_in: "سجّل الدخول",
      auth_sign_out: "سجّل الخروج",
      user_preferences_update: "غيّر اللغة إلى {{locale}}",
      audit_integrity_check: "تحقّق من سلامة سجل التدقيق",
    },
    empty: "لا توجد إدخالات بعد.",
    checkIntegrity: "تحقّق من عدم تغيير أي شيء",
    integrityOk: "جميع الإدخالات ({{count}}) سليمة. لم يُغيَّر أو يُحذف أي شيء.",
    integrityBroken: "تم تغيير الإدخال {{eventId}} بعد كتابته. اعتبر كل ما بعده غير موثوق.",
    reason: "السبب: {{reason}}",
    showMore: "عرض المزيد",
  },
};
