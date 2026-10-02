import { DomainError } from "../shared";

/** The fixed application state machine (architecture §5, invariant 7). Mirrored in cycle.application_transitions. */
export const APPLICATION_STATUSES = ["draft", "submitted", "in_review", "awaiting_info", "in_approval", "approved", "rejected", "withdrawn", "agreement", "project"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_TRANSITIONS: ReadonlyArray<readonly [ApplicationStatus, ApplicationStatus]> = [
  ["draft", "submitted"], ["submitted", "in_review"], ["in_review", "awaiting_info"], ["awaiting_info", "in_review"],
  ["in_review", "in_approval"], ["in_approval", "in_review"], ["in_approval", "approved"], ["in_approval", "rejected"],
  ["approved", "agreement"], ["agreement", "project"], ["submitted", "withdrawn"], ["in_review", "withdrawn"], ["awaiting_info", "withdrawn"],
];

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return APPLICATION_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) throw new DomainError("illegal_transition", `${from} → ${to}`);
}

/** Statuses that carry an SLA clock (R-044). */
export const SLA_STATUSES: ApplicationStatus[] = ["submitted", "in_review", "awaiting_info", "in_approval"];
export const OPEN_STATUSES: ApplicationStatus[] = ["submitted", "in_review", "awaiting_info", "in_approval"];
export const TERMINAL_STATUSES: ApplicationStatus[] = ["rejected", "withdrawn", "project"];

/** R-023: what the association sees for each internal status — the label matches the real stage. */
export const ASSOCIATION_STAGE: Record<ApplicationStatus, { key: string; label: string }> = {
  draft: { key: "draft", label: "مسودة" },
  submitted: { key: "submitted", label: "أُرسل الطلب" },
  in_review: { key: "review", label: "قيد الدراسة" },
  awaiting_info: { key: "review", label: "بانتظار استكمالك" },
  in_approval: { key: "approval", label: "في الاعتماد" },
  approved: { key: "decision", label: "معتمد" },
  rejected: { key: "decision", label: "لم يُعتمد" },
  withdrawn: { key: "withdrawn", label: "مسحوب" },
  agreement: { key: "agreement", label: "الاتفاقية" },
  project: { key: "project", label: "مشروع قيد التنفيذ" },
};
export const STAGE_ORDER = ["submitted", "review", "approval", "decision", "agreement", "project"] as const;

/** Staff-facing labels and tone for each status. */
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: "مسودة", submitted: "مقدّم", in_review: "قيد الدراسة", awaiting_info: "بانتظار الاستكمال", in_approval: "في الاعتماد",
  approved: "معتمد", rejected: "مرفوض", withdrawn: "مسحوب", agreement: "الاتفاقية", project: "مشروع",
};
