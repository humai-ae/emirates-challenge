import type { Translation } from "@hrcc/ui/app";
import type { adminEn } from "./admin-en";

export const adminAr: Translation<typeof adminEn> = {
  nav: {
    setup: "الإعداد",
    data: "البيانات",
    rules: "القواعد",
    runs: "عمليات الفحص",
    dashboard: "لوحة المعلومات",
    teams: "الفرق",
    audit: "سجل التدقيق",
  },
  pages: {
    setup: {
      title: "إعداد المدقق",
      emptyTitle: "ارفع الملفات الأربعة للبدء",
      emptyBody:
        "سترفع هنا من حزمة البيانات الملفات transactions.csv وemployees.csv وpolicy_rules.md وfinding_format.csv.",
    },
    data: {
      title: "البيانات",
      emptyTitle: "لم يتم تحميل أي بيانات بعد",
      emptyBody: "ارفع ملفي المعاملات والموظفين لعرض عدد الصفوف والأعمدة ومشكلات البيانات.",
    },
    rules: {
      title: "القواعد",
      emptyTitle: "لا توجد قواعد بعد",
      emptyBody:
        "ارفع وثيقة سياسة أو اكتب قاعدة. حمّل البيانات أولاً حتى تتم مطابقة القواعد مع أعمدتك.",
    },
    runs: {
      title: "عمليات الفحص",
      emptyTitle: "لم يتم تشغيل أي فحص بعد",
      emptyBody: "اعتمد قاعدة واحدة على الأقل أولاً.",
    },
    dashboard: {
      title: "لوحة المعلومات: النقاط الساخنة والاتجاهات",
      emptyTitle: "لم يتم تشغيل أي فحص بعد",
      emptyBody: "تظهر النقاط الساخنة والاتجاهات بعد أول فحص.",
    },
    teams: {
      title: "الفرق والتوجيه",
      emptyTitle: "لم يتم اقتراح أي فرق بعد",
      emptyBody: "بعد أول عملية رفع، يقترح النظام فريقًا لكل نوع من المعاملات لتؤكده.",
    },
  },
};
