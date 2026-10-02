import { describe, expect, it } from "vitest";
import { cycle, framework } from "../src";

const { canTransition, assertTransition, addBusinessDays, businessDaysBetween, dueTone, checkReadiness, documentState, pickAssignee, heldDuring, canDeactivate, checkEligibility, checkCatalogRequest, ASSOCIATION_STAGE } = cycle;

describe("R-023 application state machine", () => {
  it("R-023 allows the documented path draft → project", () => {
    const path = ["draft", "submitted", "in_review", "in_approval", "approved", "agreement", "project"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
  });
  it("R-023 refuses skipping review or deciding from draft", () => {
    expect(canTransition("submitted", "approved")).toBe(false);
    expect(canTransition("draft", "in_review")).toBe(false);
    expect(() => assertTransition("rejected", "in_review")).toThrow(/illegal_transition/);
  });
  it("R-043 a return sends the application back to review", () => {
    expect(canTransition("in_approval", "in_review")).toBe(true);
  });
  it("R-023 every status maps to an association-facing stage", () => {
    for (const s of cycle.APPLICATION_STATUSES) expect(ASSOCIATION_STAGE[s].label.length).toBeGreaterThan(0);
  });
});

describe("R-044 business-day SLA", () => {
  // 2026-10-04 is a Sunday.
  const sunday = new Date("2026-10-04T07:00:00Z");
  it("R-044 counts Sunday–Thursday only", () => {
    const due = addBusinessDays(sunday, 5);
    expect(due.toISOString()).toBe("2026-10-11T20:59:59.000Z"); // next Sunday 23:59:59 Riyadh
  });
  it("R-044 skips the donor's holidays", () => {
    const due = addBusinessDays(sunday, 1, new Set(["2026-10-05"]));
    expect(due.toISOString()).toBe("2026-10-06T20:59:59.000Z");
  });
  it("R-044 a clock started on Friday counts from Sunday", () => {
    const fri = new Date("2026-10-09T10:00:00Z");
    expect(addBusinessDays(fri, 1).toISOString()).toBe("2026-10-11T20:59:59.000Z");
  });
  it("R-044 business days between ignore weekends", () => {
    expect(businessDaysBetween(new Date("2026-10-08T08:00:00Z"), new Date("2026-10-12T08:00:00Z"))).toBe(2);
  });
  it("R-044 tone turns near within a business day and late after the due instant", () => {
    const due = addBusinessDays(sunday, 3);
    expect(dueTone(due, sunday)).toBe("active");
    expect(dueTone(due, new Date("2026-10-07T07:00:00Z"))).toBe("near");
    expect(dueTone(due, new Date("2026-10-08T07:00:00Z"))).toBe("late");
  });
});

describe("R-015 readiness", () => {
  const base = {
    accountActive: true, associationStatus: "active" as const, overdueObligations: 0, noOverdueObligations: true, programOpen: true, today: "2026-10-04",
    requiredDocuments: ["license", "bank_certificate"], documentLabels: { license: "ترخيص الجمعية", bank_certificate: "شهادة الحساب البنكي" },
    documents: [{ type: "license", expiryDate: "2027-03-01", confirmed: true }, { type: "bank_certificate", expiryDate: "2026-12-01", confirmed: true }],
  };
  it("R-015 a complete association is ready", () => {
    expect(checkReadiness(base).ready).toBe(true);
  });
  it("R-015 an association with an expired document cannot submit", () => {
    const r = checkReadiness({ ...base, documents: [base.documents[0]!, { type: "bank_certificate", expiryDate: "2026-10-01", confirmed: true }] });
    expect(r.ready).toBe(false);
  });
  it("R-016 says exactly what is missing and why", () => {
    const r = checkReadiness({ ...base, documents: [base.documents[0]!], overdueObligations: 2 });
    expect(r.items.filter((i) => !i.ok).map((i) => `${i.label}: ${i.reason}`)).toEqual(["شهادة الحساب البنكي: لم تُرفع بعد", "الالتزامات: 2 التزامات متأخرة"]);
  });
  it("R-017 readiness drops on the expiry day, not before", () => {
    expect(documentState("2026-10-04", "2026-10-04")).toBe("near");
    expect(documentState("2026-10-03", "2026-10-04")).toBe("expired");
    expect(documentState("2026-11-10", "2026-10-04")).toBe("valid");
  });
  it("R-015 an unconfirmed (AI-suggested) document does not count yet", () => {
    const r = checkReadiness({ ...base, documents: [base.documents[0]!, { type: "bank_certificate", expiryDate: "2027-01-01", confirmed: false }] });
    expect(r.ready).toBe(false);
  });
  it("R-067 a suspended association is not ready, with the reason", () => {
    const r = checkReadiness({ ...base, associationStatus: "suspended", suspendedReason: "مستند استلام متأخر" });
    expect(r.items.find((i) => i.key === "association")!.reason).toContain("مستند استلام متأخر");
  });
});

describe("R-024 assignment", () => {
  const c = (id: string, load: number, extra = {}) => ({ membershipId: id, personId: `p-${id}`, openLoad: load, active: true, ...extra });
  it("R-024 every submitted application gets the lightest-loaded specialist", () => {
    expect(pickAssignee({ candidates: [c("a", 5), c("b", 2), c("c", 9)], today: "2026-10-04" })!.membershipId).toBe("b");
  });
  it("R-024 programme specialists come first, load second", () => {
    expect(pickAssignee({ candidates: [c("a", 5), c("b", 2)], programSpecialists: ["a"], today: "2026-10-04" })!.membershipId).toBe("a");
  });
  it("R-026 the absent receive nothing during their absence", () => {
    const r = pickAssignee({ candidates: [c("a", 0, { absentFrom: "2026-10-01", absentUntil: "2026-10-10" }), c("b", 7)], today: "2026-10-04" });
    expect(r!.membershipId).toBe("b");
  });
  it("N-08 a conflict-of-interest declaration excludes the declarer", () => {
    expect(pickAssignee({ candidates: [c("a", 0), c("b", 4)], conflicted: ["a"], today: "2026-10-04" })!.membershipId).toBe("b");
  });
  it("R-024 ties break deterministically", () => {
    expect(pickAssignee({ candidates: [c("b", 1), c("a", 1)], today: "2026-10-04" })!.membershipId).toBe("a");
  });
  it("R-024 falls back to all specialists when the programme's are all away", () => {
    const r = pickAssignee({ candidates: [c("a", 0, { absentFrom: "2026-10-01" }), c("b", 3)], programSpecialists: ["a"], today: "2026-10-04" });
    expect(r!.membershipId).toBe("b");
  });
  it("R-028 custody windows end at the reassignment", () => {
    const spans = [{ membershipId: "a", from: "2026-10-01", to: "2026-10-05" }, { membershipId: "b", from: "2026-10-05", to: null }];
    expect(heldDuring(spans, "a", "2026-10-03")).toBe(true);
    expect(heldDuring(spans, "a", "2026-10-06")).toBe(false);
  });
  it("R-029 an account with open custody cannot be deactivated", () => {
    expect(canDeactivate(3).ok).toBe(false);
    expect(canDeactivate(0).ok).toBe(true);
  });
});

describe("R-031 eligibility from the framework", () => {
  const program = framework.defaultProgram();
  const facts = { association: { ready: true, openApplicationsInProgram: 0, licenseValid: true, overdueObligations: 0 }, application: { requestedHalalas: 100 }, program: { capHalalas: program.capHalalas, isOpen: true, id: program.id } };
  it("R-004 a rule in the approved policy refuses a non-compliant application automatically", () => {
    const v = checkEligibility(program, { ...facts, application: { requestedHalalas: program.capHalalas + 1 } });
    expect(v.reasons.map((r) => r.reason)).toEqual(["المبلغ يتجاوز سقف البرنامج"]);
  });
  it("R-020 catalogue quantities respect the association cap and remaining stock", () => {
    expect(checkCatalogRequest({ perAssociationMax: 5, totalQuantity: 100 }, 3, 1, 50)).toEqual([]);
    expect(checkCatalogRequest({ perAssociationMax: 5, totalQuantity: 100 }, 5, 1, 50)).toEqual(["الكمية تتجاوز سقف الجمعية لهذا البند"]);
    expect(checkCatalogRequest({ perAssociationMax: 5, totalQuantity: 100 }, 2, 0, 99)).toEqual(["الكمية تتجاوز الرصيد المتبقي للبند"]);
  });
});
