/**
 * R-110: roles and permissions for the twelve roles. `can()` is the single
 * authorisation decision in application code; the RLS helpers in
 * supabase/migrations mirror it, and supabase/tests/002_matrix.sql checks the
 * database half of the same matrix.
 */
export const STAFF_ROLES = ["system_admin", "grants_specialist", "grants_manager", "committee_secretary", "finance", "executive"] as const;
export const ASSOCIATION_ROLES = ["assoc_owner", "assoc_applicant", "assoc_coordinator"] as const;
export const ROLES = [...STAFF_ROLES, "external_reviewer", ...ASSOCIATION_ROLES, "supplier_rep"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role | "operator", string> = {
  system_admin: "مدير النظام", grants_specialist: "أخصائي المنح", grants_manager: "مدير المنح", committee_secretary: "أمين اللجنة",
  finance: "المالية", executive: "المدير التنفيذي", external_reviewer: "مقيّم خارجي", assoc_owner: "صاحب الصلاحية الرسمي",
  assoc_applicant: "مقدّم الطلبات", assoc_coordinator: "منسق المشروع", supplier_rep: "مندوب المورّد", operator: "مشغّل المنصة",
};

export type Grant = { role: Role; membershipId: string; orgId?: string | null; scopeApplicationId?: string | null; scopeExpiresAt?: string | null };
export type Actor = { personId: string; tenantId: string; grants: Grant[]; operator?: boolean };

export type Resource = {
  tenantId: string;
  orgId?: string | null;                   // owning association/supplier
  applicationId?: string;
  assigneeMembershipId?: string | null;    // current custody
  awaitingRoles?: string[];                // approval: roles the current level waits for
  requestedBy?: string | null;             // person who requested a sensitive change
  targetPersonId?: string | null;          // membership/KPI subject
  managerOfTarget?: string | null;         // target's direct manager person id
  status?: string;
};

export type Action =
  | "application.create" | "application.submit" | "application.withdraw" | "application.read" | "application.study"
  | "application.request_info" | "application.recommend" | "application.reassign" | "application.declare_coi" | "application.respond_info"
  | "approval.act" | "committee.record"
  | "agreement.sign_association" | "agreement.sign_donor" | "agreement.issue"
  | "deliverable.submit" | "deliverable.decide"
  | "disbursement.view" | "disbursement.execute" | "disbursement.return"
  | "bank.request_change" | "bank.acknowledge"
  | "framework.edit" | "framework.approve"
  | "membership.manage" | "association.approve_letter" | "association.manage_users"
  | "amendment.request" | "final_report.submit" | "final_report.decide"
  | "report.view" | "person.view_kpis" | "query.ask" | "support.grant"
  | "supplier_order.confirm" | "invitation.send" | "invitation.respond" | "search";

const has = (a: Actor, roles: readonly string[]) => a.grants.some((g) => roles.includes(g.role) && (!g.scopeExpiresAt || Date.parse(g.scopeExpiresAt) > Date.now()));
const inOrg = (a: Actor, roles: readonly string[], orgId?: string | null) => !!orgId && a.grants.some((g) => roles.includes(g.role) && g.orgId === orgId);
const holds = (a: Actor, r: Resource) => !!r.assigneeMembershipId && a.grants.some((g) => g.membershipId === r.assigneeMembershipId);
const PROGRAM_STAFF = ["system_admin", "grants_specialist", "grants_manager", "committee_secretary", "executive"] as const;

export function can(actor: Actor, action: Action, r: Resource, opts: { naturalLanguageRoles?: string[] } = {}): boolean {
  if (actor.operator) return false;                       // R-085: the operator reads no tenant data here
  if (actor.tenantId !== r.tenantId) return false;        // R-109
  const A = actor;
  switch (action) {
    case "application.create":
    case "application.submit":
      return inOrg(A, ["assoc_owner", "assoc_applicant"], r.orgId);
    case "application.withdraw":
      return inOrg(A, ["assoc_owner", "assoc_applicant"], r.orgId) && ["submitted", "in_review", "awaiting_info"].includes(r.status ?? "");
    case "application.respond_info":
      return inOrg(A, ["assoc_owner", "assoc_applicant"], r.orgId);
    case "application.read":
      return has(A, PROGRAM_STAFF) || inOrg(A, ASSOCIATION_ROLES, r.orgId)
        || A.grants.some((g) => g.role === "external_reviewer" && g.scopeApplicationId === r.applicationId && (!g.scopeExpiresAt || Date.parse(g.scopeExpiresAt) > Date.now()));
    case "application.study":
    case "application.request_info":
    case "application.recommend":
      return has(A, ["grants_manager"]) || (has(A, ["grants_specialist"]) && holds(A, r));
    case "application.declare_coi":
      return has(A, ["grants_specialist", "grants_manager"]);
    case "application.reassign":
      return has(A, ["grants_manager"]);
    case "approval.act":
      return !!r.awaitingRoles && has(A, r.awaitingRoles);
    case "committee.record":
      return has(A, ["committee_secretary"]);
    case "agreement.issue":
      return has(A, ["grants_specialist", "grants_manager"]);
    case "agreement.sign_association":
      return inOrg(A, ["assoc_owner"], r.orgId);
    case "agreement.sign_donor":
      return has(A, ["executive", "grants_manager"]);
    case "deliverable.submit":
    case "final_report.submit":
      return inOrg(A, ["assoc_owner", "assoc_coordinator"], r.orgId);
    case "deliverable.decide":
    case "final_report.decide":
      return has(A, ["grants_manager"]) || (has(A, ["grants_specialist"]) && holds(A, r));
    case "disbursement.view":
      return has(A, ["finance", "grants_manager", "executive", "system_admin"]) || inOrg(A, ASSOCIATION_ROLES, r.orgId);
    case "disbursement.execute":
    case "disbursement.return":
      return has(A, ["finance"]);
    case "bank.request_change":
      return inOrg(A, ["assoc_owner"], r.orgId);
    case "bank.acknowledge":
      return has(A, ["finance"]) && r.requestedBy !== A.personId;
    case "framework.edit":
      return has(A, ["system_admin"]);
    case "framework.approve":
      return has(A, ["system_admin", "executive"]);
    case "membership.manage":
      return has(A, ["system_admin"]) && r.targetPersonId !== A.personId;    // R-091
    case "association.manage_users":
      return inOrg(A, ["assoc_owner"], r.orgId) && r.targetPersonId !== A.personId;
    case "association.approve_letter":
      return has(A, ["system_admin", "grants_manager"]);
    case "amendment.request":
      return inOrg(A, ["assoc_owner"], r.orgId) || (has(A, ["grants_specialist"]) && holds(A, r)) || has(A, ["grants_manager"]);
    case "report.view":
      return has(A, ["executive", "grants_manager", "system_admin", "finance"]);
    case "person.view_kpis":                                                   // R-098
      return r.targetPersonId === A.personId || r.managerOfTarget === A.personId || has(A, ["grants_manager", "executive"]);
    case "query.ask":
      return has(A, opts.naturalLanguageRoles ?? ["executive", "grants_manager"]);
    case "support.grant":
      return has(A, ["system_admin"]);
    case "supplier_order.confirm":
      return inOrg(A, ["supplier_rep", "assoc_owner", "assoc_coordinator"], r.orgId);
    case "invitation.send":
      return has(A, ["grants_manager", "system_admin"]);
    case "invitation.respond":
      return inOrg(A, ["assoc_owner", "assoc_applicant"], r.orgId);
    case "search":
      return A.grants.length > 0;
  }
}

export function isStaff(a: Actor) { return has(a, STAFF_ROLES); }
export function isAssociation(a: Actor) { return has(a, ASSOCIATION_ROLES); }
export function primaryOrg(a: Actor): string | null { return a.grants.find((g) => g.orgId)?.orgId ?? null; }
export function rolesOf(a: Actor): Role[] { return [...new Set(a.grants.map((g) => g.role))]; }
