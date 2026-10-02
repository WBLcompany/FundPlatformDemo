import type { StatusTone } from "@wbl/ui";
import { cycle } from "@wbl/domain";
import { t } from "../i18n";

export const appTone: Record<string, StatusTone> = {
  draft: "neutral", submitted: "active", in_review: "active", awaiting_info: "near", in_approval: "active",
  approved: "done", rejected: "rejected", withdrawn: "neutral", agreement: "active", project: "done",
};
export const statusLabel = (s: string) => cycle.STATUS_LABEL[s as cycle.ApplicationStatus] ?? s;
export const orderTone: Record<string, StatusTone> = { pending_checks: "neutral", blocked: "late", in_approval: "active", ready: "near", returned: "late", executed: "done", suspended: "late" };
export const delTone: Record<string, StatusTone> = { pending: "neutral", submitted: "active", accepted: "done", returned: "near", rejected: "rejected" };
const labels = (group: string, keys: string[]): Record<string, string> => Object.fromEntries(keys.map((k) => [k, t(`status.${group}.${k}`)]));
export const DEL_LABEL = labels("deliverable", ["pending", "submitted", "accepted", "returned", "rejected"]);
export const PROJECT_LABEL = labels("project", ["active", "suspended", "closing", "closed"]);
export const projectTone: Record<string, StatusTone> = { active: "active", suspended: "late", closing: "near", closed: "done" };
export const INST_LABEL = labels("installment", ["scheduled", "due", "ordered", "paid", "cancelled"]);
export const instTone: Record<string, StatusTone> = { scheduled: "neutral", due: "near", ordered: "active", paid: "done", cancelled: "neutral" };

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}
export function dueLabel(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days < 0) return t("status.due.late", { days: -days });
  if (days === 0) return t("status.due.today");
  return t("status.due.in", { days });
}
