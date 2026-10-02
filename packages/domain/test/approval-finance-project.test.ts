import { describe, expect, it } from "vitest";
import { approval, finance, project, splitByPercent, type framework } from "../src";

const chain: framework.ChainConfig = {
  id: "c", name: "مسار", levels: [
    { key: "manager", label: "مدير المنح", role: "grants_manager", committee: false, activation: [] },
    { key: "committee", label: "اللجنة", role: "committee_secretary", committee: true, activation: [{ field: "amountHalalas", op: "gt", value: 10_000_000 }] },
    { key: "ceo", label: "المدير التنفيذي", role: "executive", committee: false, activation: [{ field: "amountHalalas", op: "gt", value: 30_000_000 }] },
  ],
};

describe("R-042 approval engine", () => {
  it("R-042 the application passes only the levels that apply", () => {
    expect(approval.openApproval(chain, { amountHalalas: 5_000_000 }).applicable.map((l) => l.key)).toEqual(["manager"]);
    expect(approval.openApproval(chain, { amountHalalas: 35_000_000 }).applicable.map((l) => l.key)).toEqual(["manager", "committee", "ceo"]);
  });
  it("R-043 approve walks the levels then completes", () => {
    let s = approval.openApproval(chain, { amountHalalas: 20_000_000 });
    s = approval.act(s, { kind: "approve" });
    expect(approval.currentLevel(s)!.key).toBe("committee");
    s = approval.act(s, { kind: "approve" });
    expect(s.status).toBe("approved");
  });
  it("R-043 reject and return require a note", () => {
    const s = approval.openApproval(chain, { amountHalalas: 1 });
    expect(() => approval.act(s, { kind: "reject", note: " " })).toThrow(/note_required/);
    expect(approval.act(s, { kind: "return", note: "أكمل الموازنة" }).status).toBe("returned");
  });
  it("R-057 raising the amount into a higher tier adds that tier's level", () => {
    let s = approval.openApproval(chain, { amountHalalas: 20_000_000 });
    s = approval.act(s, { kind: "approve" });
    s = approval.act(s, { kind: "modify_amount", amountHalalas: 35_000_000, facts: { amountHalalas: 35_000_000 } });
    expect(approval.remainingLabels(s)).toEqual(["اللجنة", "المدير التنفيذي"]);
  });
  it("R-043 modifying the amount never re-opens a level already passed", () => {
    let s = approval.openApproval(chain, { amountHalalas: 35_000_000 });
    s = approval.act(s, { kind: "approve" });
    s = approval.act(s, { kind: "modify_amount", amountHalalas: 1_000_000, facts: { amountHalalas: 1_000_000 } });
    expect(s.passed).toEqual(["manager"]);
    expect(s.status).toBe("open");
    expect(approval.remainingLabels(s)).toEqual([]);
  });
  it("R-079 only the awaited role sees «بانتظار اعتمادك»; the backup only when the primary is absent", () => {
    const c2 = { ...chain, levels: [{ ...chain.levels[0]!, backupRole: "executive" as const }] };
    const s = approval.openApproval(c2, { amountHalalas: 1 });
    expect(approval.isAwaiting(s, ["grants_manager"])).toBe(true);
    expect(approval.isAwaiting(s, ["executive"])).toBe(false);
    expect(approval.isAwaiting(s, ["executive"], false)).toBe(true);
  });
});

describe("finance", () => {
  it("ق٥ split by percent always sums to the total", () => {
    expect(splitByPercent(35_000_001, [40, 40, 20]).reduce((a, b) => a + b, 0)).toBe(35_000_001);
  });
  it("R-050 installments are built from the approved schedule and match the approved amount", () => {
    const inst = finance.buildInstallments(35_000_000, [
      { label: "الأولى", percent: 40, condition: "signature" }, { label: "الثانية", percent: 40, condition: "deliverable" }, { label: "الختامية", percent: 20, condition: "final_report" }], { enabled: true, minPercent: 10 });
    expect(inst.map((i) => i.amountHalalas)).toEqual([14_000_000, 14_000_000, 7_000_000]);
  });
  it("R-074 the final installment must hang on the final report and meet the minimum", () => {
    expect(() => finance.buildInstallments(100, [{ label: "x", percent: 100, condition: "deliverable" }], { enabled: true, minPercent: 10 })).toThrow(/final_installment_required/);
    expect(() => finance.buildInstallments(100, [{ label: "a", percent: 95, condition: "signature" }, { label: "b", percent: 5, condition: "final_report" }], { enabled: true, minPercent: 10 })).toThrow(/too_small/);
  });
  it("R-063 blockers stop an order and name who owns the fix", () => {
    const b = finance.disbursementBlockers({ associationSuspended: false, essentialDocsExpired: ["الترخيص"], bankAccountAcknowledged: false, projectSuspended: false, priorReceiptOverdue: false });
    expect(b.map((x) => [x.key, x.owner])).toEqual([["doc_expired:الترخيص", "association"], ["bank_unacknowledged", "finance"]]);
  });
  it("R-073 no closing with an unresolved amount", () => {
    expect(finance.closureCheck(35_000_000, 28_000_000, 26_000_000, null)).toEqual(["مبلغ غير مصروف (20000 ريال) لم يُحسم مصيره"]);
    expect(finance.closureCheck(35_000_000, 28_000_000, 26_000_000, "returned")).toEqual([]);
  });
  it("R-070 Saudi IBANs are checksum-validated", () => {
    expect(finance.validSaudiIban("SA03 8000 0000 6080 1016 7519")).toBe(true);
    expect(finance.validSaudiIban("SA03 8000 0000 6080 1016 7518")).toBe(false);
    expect(finance.validSaudiIban("GB82WEST12345698765432")).toBe(false);
  });
});

describe("project", () => {
  it("R-052 deliverables follow submitted → accepted/returned/rejected", () => {
    expect(() => project.assertDeliverableTransition("pending", "accepted")).toThrow();
    expect(() => project.assertDeliverableTransition("submitted", "accepted")).not.toThrow();
  });
  it("R-058 a donor-initiated amendment waits for the signatory; an association one does not", () => {
    expect(project.afterApproval("donor")).toBe("awaiting_signatory");
    expect(project.afterApproval("association")).toBe("approved");
  });
  it("R-056 the literal diff is the manual fallback for amendment.diff", () => {
    const before = { amountHalalas: 35_000_000, schedule: [], deliverables: [{ label: "تقرير", dueDate: "2027-03-01" }] };
    expect(project.literalDiff(before, { amountHalalas: 38_000_000, deliverables: [{ label: "تقرير", dueDate: "2027-04-01" }] })).toEqual(["المبلغ: 350000 ← 380000 ريال", "موعد «تقرير»: 2027-03-01 ← 2027-04-01"]);
  });
  it("R-051 reminds before the due date and R-054 escalates after it", () => {
    expect(project.deliverableAlerts("2026-10-20", "2026-10-13", 7, "pending", false, false)).toEqual(["remind"]);
    expect(project.deliverableAlerts("2026-10-20", "2026-10-21", 7, "pending", true, false)).toEqual(["escalate"]);
    expect(project.deliverableAlerts("2026-10-20", "2026-10-21", 7, "submitted", true, false)).toEqual([]);
  });
});
