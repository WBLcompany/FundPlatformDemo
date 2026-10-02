import type { StatusTone } from "@wbl/ui";
import { cycle } from "@wbl/domain";

export const appTone: Record<string, StatusTone> = {
  draft: "neutral", submitted: "active", in_review: "active", awaiting_info: "near", in_approval: "active",
  approved: "done", rejected: "rejected", withdrawn: "neutral", agreement: "active", project: "done",
};
export const statusLabel = (s: string) => cycle.STATUS_LABEL[s as cycle.ApplicationStatus] ?? s;
export const orderTone: Record<string, StatusTone> = { pending_checks: "neutral", blocked: "late", in_approval: "active", ready: "near", returned: "late", executed: "done", suspended: "late" };
export const delTone: Record<string, StatusTone> = { pending: "neutral", submitted: "active", accepted: "done", returned: "near", rejected: "rejected" };
export const DEL_LABEL: Record<string, string> = { pending: "بانتظار الرفع", submitted: "بانتظار المراجعة", accepted: "مقبول", returned: "أُعيد للاستكمال", rejected: "مرفوض" };
export const PROJECT_LABEL: Record<string, string> = { active: "قيد التنفيذ", suspended: "معلّق", closing: "قيد الإقفال", closed: "مُقفل" };
export const projectTone: Record<string, StatusTone> = { active: "active", suspended: "late", closing: "near", closed: "done" };
export const INST_LABEL: Record<string, string> = { scheduled: "مجدولة", due: "مستحقة", ordered: "أمر صرف مفتوح", paid: "صُرفت", cancelled: "ملغاة" };
export const instTone: Record<string, StatusTone> = { scheduled: "neutral", due: "near", ordered: "active", paid: "done", cancelled: "neutral" };

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}
export function dueLabel(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days < 0) return `متأخر ${-days} يوم`;
  if (days === 0) return "اليوم";
  return `بعد ${days} يوم`;
}
