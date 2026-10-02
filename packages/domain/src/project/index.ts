import { DomainError } from "../shared";

export const DELIVERABLE_TRANSITIONS = [["pending", "submitted"], ["submitted", "accepted"], ["submitted", "returned"], ["submitted", "rejected"], ["returned", "submitted"]] as const;
export type DeliverableStatus = "pending" | "submitted" | "accepted" | "returned" | "rejected";
export function assertDeliverableTransition(from: DeliverableStatus, to: DeliverableStatus) {
  if (!DELIVERABLE_TRANSITIONS.some(([a, b]) => a === from && b === to)) throw new DomainError("illegal_transition", `${from} → ${to}`);
}

export const PROJECT_TRANSITIONS = [["active", "suspended"], ["suspended", "active"], ["active", "closing"], ["closing", "active"], ["closing", "closed"]] as const;
export type ProjectStatus = "active" | "suspended" | "closing" | "closed";
export function assertProjectTransition(from: ProjectStatus, to: ProjectStatus) {
  if (!PROJECT_TRANSITIONS.some(([a, b]) => a === from && b === to)) throw new DomainError("illegal_transition", `${from} → ${to}`);
}

export const AMENDMENT_TRANSITIONS = [["submitted", "in_approval"], ["in_approval", "approved"], ["in_approval", "rejected"], ["in_approval", "awaiting_signatory"], ["awaiting_signatory", "approved"], ["awaiting_signatory", "rejected"], ["awaiting_signatory", "expired"]] as const;
export type AmendmentStatus = "submitted" | "in_approval" | "awaiting_signatory" | "approved" | "rejected" | "expired";
export function assertAmendmentTransition(from: AmendmentStatus, to: AmendmentStatus) {
  if (!AMENDMENT_TRANSITIONS.some(([a, b]) => a === from && b === to)) throw new DomainError("illegal_transition", `${from} → ${to}`);
}

/**
 * R-058: an amendment the DONOR initiates needs the association signatory's consent;
 * one the association initiates already carries it. Approval completes into
 * awaiting_signatory only on the donor side.
 */
export function afterApproval(side: "association" | "donor"): AmendmentStatus {
  return side === "donor" ? "awaiting_signatory" : "approved";
}

/** A literal diff of approved terms (the manual fallback for amendment.diff, R-056). */
export type Terms = { amountHalalas: number; schedule: Array<{ label: string; percent: number }>; deliverables: Array<{ label: string; dueDate: string }> };
export function literalDiff(before: Terms, after: Partial<Terms>): string[] {
  const d: string[] = [];
  if (after.amountHalalas !== undefined && after.amountHalalas !== before.amountHalalas) d.push(`المبلغ: ${before.amountHalalas / 100} ← ${after.amountHalalas / 100} ريال`);
  if (after.deliverables) {
    for (const nd of after.deliverables) {
      const od = before.deliverables.find((x) => x.label === nd.label);
      if (!od) d.push(`تسليم جديد: ${nd.label} (${nd.dueDate})`);
      else if (od.dueDate !== nd.dueDate) d.push(`موعد «${nd.label}»: ${od.dueDate} ← ${nd.dueDate}`);
    }
    for (const od of before.deliverables) if (!after.deliverables.some((x) => x.label === od.label)) d.push(`حذف تسليم: ${od.label}`);
  }
  if (after.schedule && JSON.stringify(after.schedule) !== JSON.stringify(before.schedule)) d.push("جدول الدفعات");
  return d;
}

/** R-051 / R-054: reminder N days before; escalation the day after the due date. */
export function deliverableAlerts(due: string, today: string, reminderDays: number, status: DeliverableStatus, alreadyReminded: boolean, alreadyEscalated: boolean) {
  const out: Array<"remind" | "escalate"> = [];
  if (status !== "pending" && status !== "returned") return out;
  const remindOn = new Date(`${due}T00:00:00Z`);
  remindOn.setUTCDate(remindOn.getUTCDate() - reminderDays);
  if (!alreadyReminded && today >= remindOn.toISOString().slice(0, 10) && today <= due) out.push("remind");
  if (!alreadyEscalated && today > due) out.push("escalate");
  return out;
}
