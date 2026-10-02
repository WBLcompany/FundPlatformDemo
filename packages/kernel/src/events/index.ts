/**
 * The event catalogue (architecture §7). Writers emit inside the same
 * transaction as the state change; consumers in apps/worker react, each at
 * most once per event (kernel.outbox_deliveries).
 */
export const EVENT_TYPES = [
  "association.registered", "association.letter_reviewed", "association.suspended", "association.reinstated",
  "org_document.uploaded", "org_document.confirmed", "org_document.expiring", "org_document.expired", "file.infected",
  "application.created", "application.submitted", "application.assigned", "application.reassigned", "application.withdrawn",
  "application.info_requested", "application.info_answered", "application.recommended", "application.coi_declared",
  "study_file.requested", "study_file.ready", "assessment.recorded",
  "approval.opened", "approval.acted", "approval.completed",
  "committee.decided", "grant.decided",
  "agreement.issued", "agreement.association_signed", "agreement.fully_signed",
  "project.created", "project.suspended", "project.resumed", "project.closed",
  "deliverable.submitted", "deliverable.accepted", "deliverable.returned", "deliverable.rejected", "deliverable.reminder", "deliverable.overdue",
  "disbursement.ordered", "disbursement.blocked", "disbursement.ready", "disbursement.executed", "disbursement.returned", "disbursement.suspended", "disbursement.resumed",
  "receipt.overdue", "receipt.received",
  "bank_account.change_requested", "bank_account.acknowledged",
  "amendment.requested", "amendment.decided",
  "final_report.submitted", "final_report.decided",
  "framework.version_approved", "policy.approved",
  "ai.task_requested", "ai.task_settled", "sla.breached", "membership.changed", "invitation.sent", "invitation.responded",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type DomainEvent = {
  type: EventType;
  entityKind?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
};

/** Events that must reach the association's official email (R-094). */
export const OFFICIAL_EVENTS: EventType[] = [
  "application.submitted", "application.info_requested", "grant.decided", "agreement.issued", "agreement.fully_signed",
  "disbursement.executed", "deliverable.overdue", "receipt.overdue", "association.suspended", "bank_account.change_requested",
  "bank_account.acknowledged", "amendment.decided", "org_document.expiring",
];
