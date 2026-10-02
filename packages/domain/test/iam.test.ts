import { describe, expect, it } from "vitest";
import { iam } from "../src";

const T = "tenant-a";
const actor = (role: iam.Role, extra: Partial<iam.Grant> = {}, personId = "me"): iam.Actor => ({ personId, tenantId: T, grants: [{ role, membershipId: `m-${role}`, ...extra }] });

// R-110: role × action × relation. Each row: [role, action, resource relation, expected].
type Row = [iam.Role, iam.Action, Partial<iam.Resource>, boolean, string?];
const ORG = "org-1";
const rows: Row[] = [
  ["assoc_owner", "application.submit", { orgId: ORG }, true],
  ["assoc_owner", "application.submit", { orgId: "other" }, false, "another association"],
  ["assoc_coordinator", "application.submit", { orgId: ORG }, false],
  ["grants_specialist", "application.study", { assigneeMembershipId: "m-grants_specialist" }, true, "assigned"],
  ["grants_specialist", "application.study", { assigneeMembershipId: "someone-else" }, false, "not assigned"],
  ["grants_manager", "application.study", {}, true],
  ["finance", "application.read", {}, false, "R-081 finance does not open the proposal"],
  ["finance", "disbursement.execute", {}, true],
  ["grants_specialist", "disbursement.execute", {}, false],
  ["finance", "bank.acknowledge", { requestedBy: "me" }, false, "not their own request"],
  ["finance", "bank.acknowledge", { requestedBy: "someone" }, true],
  ["system_admin", "membership.manage", { targetPersonId: "me" }, false, "R-091 never their own"],
  ["system_admin", "membership.manage", { targetPersonId: "other" }, true],
  ["committee_secretary", "committee.record", {}, true],
  ["grants_specialist", "committee.record", {}, false],
  ["executive", "approval.act", { awaitingRoles: ["executive"] }, true],
  ["grants_manager", "approval.act", { awaitingRoles: ["executive"] }, false, "R-079 not in the chain"],
  ["assoc_owner", "agreement.sign_association", { orgId: ORG }, true],
  ["assoc_applicant", "agreement.sign_association", { orgId: ORG }, false],
  ["executive", "agreement.sign_donor", {}, true],
  ["assoc_coordinator", "deliverable.submit", { orgId: ORG }, true],
  ["supplier_rep", "supplier_order.confirm", { orgId: ORG }, true],
  ["supplier_rep", "application.read", { orgId: "x" }, false],
  ["external_reviewer", "application.read", { applicationId: "app-1" }, true],
  ["external_reviewer", "application.read", { applicationId: "app-2" }, false, "R-041 one application only"],
  ["grants_specialist", "report.view", {}, false],
  ["executive", "query.ask", {}, true],
  ["grants_specialist", "query.ask", {}, false],
];

describe("R-110 permission matrix", () => {
  for (const [role, action, rel, expected, note] of rows) {
    it(`R-110 ${role} ${expected ? "can" : "cannot"} ${action}${note ? ` (${note})` : ""}`, () => {
      const extra: Partial<iam.Grant> = { orgId: role.startsWith("assoc") || role === "supplier_rep" ? ORG : null };
      if (role === "external_reviewer") extra.scopeApplicationId = "app-1";
      expect(iam.can(actor(role, extra), action, { tenantId: T, ...rel })).toBe(expected);
    });
  }
  it("R-109 nothing crosses tenants, whatever the role", () => {
    expect(iam.can(actor("executive"), "report.view", { tenantId: "tenant-b" })).toBe(false);
  });
  it("R-085 the operator is refused every tenant action", () => {
    expect(iam.can({ ...actor("system_admin"), operator: true }, "report.view", { tenantId: T })).toBe(false);
  });
  it("R-041 an expired reviewer scope reads nothing", () => {
    const a = actor("external_reviewer", { scopeApplicationId: "app-1", scopeExpiresAt: "2020-01-01T00:00:00Z" });
    expect(iam.can(a, "application.read", { tenantId: T, applicationId: "app-1" })).toBe(false);
  });
  it("R-098 a colleague cannot see KPIs; the person, their manager, the grants manager can", () => {
    expect(iam.can(actor("grants_specialist", {}, "colleague"), "person.view_kpis", { tenantId: T, targetPersonId: "p", managerOfTarget: "boss" })).toBe(false);
    expect(iam.can(actor("grants_specialist", {}, "p"), "person.view_kpis", { tenantId: T, targetPersonId: "p" })).toBe(true);
    expect(iam.can(actor("grants_specialist", {}, "boss"), "person.view_kpis", { tenantId: T, targetPersonId: "p", managerOfTarget: "boss" })).toBe(true);
  });
});
