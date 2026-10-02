import type { EventType } from "../events";

/**
 * Notification templates (R-102, R-094, R-103). Arabic, direct, no apology.
 * Variables are filled from the event payload; a missing one stays visible as {name}.
 */
export type Template = { subject: string; body: string; whatsappTemplate?: string };

export const TEMPLATES: Partial<Record<EventType, Template>> = {
  "application.submitted": { subject: "أُرسل طلبكم {ref}", body: "استلمنا طلبكم «{title}» برقم {ref}، وسيصلكم الإشعار عند كل تغيير في حالته." },
  "application.assigned": { subject: "أُسند إليك الطلب {ref}", body: "أُسند إليك الطلب «{title}». المهلة: {due}." },
  "application.reassigned": { subject: "نُقل الطلب {ref}", body: "نُقل الطلب «{title}» من {from} إلى {to}. السبب: {reason}. يمكنك الاعتراض من صفحة الطلب." },
  "application.info_requested": { subject: "مطلوب استكمال للطلب {ref}", body: "{message}\n\nاستكمل الآن من صفحة الطلب.", whatsappTemplate: "info_request_v1" },
  "application.info_answered": { subject: "استكملت الجمعية الطلب {ref}", body: "ردت الجمعية على طلب الاستكمال، والطلب عاد إليك." },
  "study_file.ready": { subject: "ملف الدراسة جاهز: {ref}", body: "جهّز مانح ملف دراسة الطلب «{title}»." },
  "approval.opened": { subject: "بانتظار اعتمادك: {ref}", body: "الطلب «{title}» ينتظر اعتمادك في مستوى {level}." },
  "grant.decided": { subject: "قرار الطلب {ref}", body: "صدر قرار المؤسسة في طلبكم «{title}»: {decision}." },
  "agreement.issued": { subject: "اتفاقية المنحة جاهزة {ref}", body: "صدرت اتفاقية المنحة. يرفع صاحب الصلاحية النسخة الموقعة من صفحة الاتفاقية." },
  "agreement.fully_signed": { subject: "اكتمل توقيع الاتفاقية {ref}", body: "اكتمل التوقيعان، وأُنشئ المشروع {project}." },
  "deliverable.reminder": { subject: "تذكير: تسليم «{label}»", body: "موعد التسليم «{label}» في {due}.", whatsappTemplate: "deliverable_reminder_v1" },
  "deliverable.overdue": { subject: "تسليم متأخر: «{label}»", body: "تجاوز التسليم «{label}» موعده {due}.", whatsappTemplate: "deliverable_overdue_v1" },
  "deliverable.accepted": { subject: "قُبل التسليم «{label}»", body: "قُبل التسليم، وفُتح أمر صرف الدفعة المرتبطة." },
  "deliverable.returned": { subject: "أُعيد التسليم «{label}» للاستكمال", body: "الملاحظات: {note}" },
  "disbursement.executed": { subject: "صُرفت دفعة بمبلغ {amount}", body: "حُوّل مبلغ {amount} إلى الحساب المنتهي بـ {last4}. ارفعوا مستند الاستلام خلال {days} أيام عمل." },
  "disbursement.returned": { subject: "أُرجع أمر الصرف {ref}", body: "السبب: {reason}" },
  "receipt.overdue": { subject: "مستند استلام متأخر", body: "لم يصل مستند استلام الدفعة {ref}، وأُوقفت التعاملات حتى رفعه.", whatsappTemplate: "receipt_overdue_v1" },
  "association.suspended": { subject: "إيقاف التعاملات مؤقتاً", body: "أُوقفت التعاملات مع الجمعية: {reason}. تُرفع آلياً عند المعالجة." },
  "org_document.expiring": { subject: "وثيقة تقترب من الانتهاء", body: "تنتهي «{doc}» في {date}. ارفعوا النسخة المحدثة قبل ذلك حتى لا تسقط الجاهزية.", whatsappTemplate: "doc_expiring_v1" },
  "bank_account.change_requested": { subject: "طلب تغيير الحساب البنكي", body: "استلمنا طلب تغيير الحساب البنكي إلى حساب ينتهي بـ {last4}. لن تُصرف دفعة عليه قبل إقرار المالية." },
  "bank_account.acknowledged": { subject: "أُقرّ الحساب البنكي", body: "أقرت المالية الحساب المنتهي بـ {last4}." },
  "amendment.decided": { subject: "قرار طلب التعديل", body: "صدر القرار في طلب التعديل: {decision}." },
  "sla.breached": { subject: "تجاوز المهلة: {ref}", body: "تجاوز «{title}» المدة المعيارية لمرحلة {stage}." },
};

export function render(tpl: Template, params: Record<string, unknown>): { subject: string; body: string } {
  const f = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] === undefined || params[k] === null ? `{${k}}` : String(params[k])));
  return { subject: f(tpl.subject), body: f(tpl.body) };
}
