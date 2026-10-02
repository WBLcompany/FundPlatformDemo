import { describe, expect, it } from "vitest";
import { evaluate, refusals, validateTable, type DecisionTable } from "../src";

const eligibility: DecisionTable<{ refuse: true }> = {
  id: "eligibility", name: "الأهلية", hitPolicy: "COLLECT",
  rules: [
    { id: "license", when: [{ field: "association.licenseValid", op: "eq", value: false }], then: { refuse: true }, reason: "الترخيص غير ساري" },
    { id: "cap", when: [{ field: "application.requestedHalalas", op: "gt", valueFrom: "program.capHalalas" }], then: { refuse: true }, reason: "المبلغ يتجاوز سقف البرنامج" },
    { id: "duplicate", when: [{ field: "association.openApplications", op: "gte", value: 1 }], then: { refuse: true }, reason: "لدى الجمعية طلب مفتوح" },
    { id: "overdue", when: [{ field: "association.overdueObligations", op: "gt", value: 0 }], then: { refuse: true }, reason: "التزامات متأخرة" },
  ],
};

const facts = (over: Record<string, unknown> = {}) => ({
  association: { licenseValid: true, openApplications: 0, overdueObligations: 0, ...(over.association as object) },
  application: { requestedHalalas: 38_600_000, ...(over.application as object) },
  program: { capHalalas: 40_000_000 },
});

describe("decision tables", () => {
  it("R-004 an eligible application passes with no reasons", () => {
    expect(refusals(eligibility, facts())).toEqual({ pass: true, reasons: [] });
  });

  it("R-031 eligibility refuses an invalid licence and says why", () => {
    const v = refusals(eligibility, facts({ association: { licenseValid: false } }));
    expect(v.pass).toBe(false);
    expect(v.reasons.map((r) => r.reason)).toEqual(["الترخيص غير ساري"]);
  });

  it("R-008 an amount above the cap is refused with the trace of both values", () => {
    const v = refusals(eligibility, facts({ application: { requestedHalalas: 40_000_001 } }));
    expect(v.reasons[0]!.ruleId).toBe("cap");
    expect(v.reasons[0]!.trace[0]).toMatchObject({ actual: 40_000_001, expected: 40_000_000, held: true });
  });

  it("R-008 the cap is inclusive: exactly the cap passes", () => {
    expect(refusals(eligibility, facts({ application: { requestedHalalas: 40_000_000 } })).pass).toBe(true);
  });

  it("R-031 duplication is caught", () => {
    expect(refusals(eligibility, facts({ association: { openApplications: 1 } })).reasons[0]!.ruleId).toBe("duplicate");
  });

  it("R-031 collects every failing rule, not just the first", () => {
    const v = refusals(eligibility, facts({ association: { licenseValid: false, overdueObligations: 2 } }));
    expect(v.reasons.map((r) => r.ruleId)).toEqual(["license", "overdue"]);
  });

  it("FIRST stops at the first match and uses the default when nothing matches", () => {
    const tier: DecisionTable<string> = { id: "tier", name: "", hitPolicy: "FIRST", default: "small",
      rules: [{ id: "big", when: [{ field: "amount", op: "gt", value: 300 }], then: "big" }, { id: "mid", when: [{ field: "amount", op: "gt", value: 100 }], then: "mid" }] };
    expect(evaluate(tier, { amount: 500 }).outcomes).toEqual(["big"]);
    expect(evaluate(tier, { amount: 150 }).outcomes).toEqual(["mid"]);
    expect(evaluate(tier, { amount: 50 })).toMatchObject({ outcomes: ["small"], usedDefault: true });
  });

  it("ANY refuses conflicting outcomes", () => {
    const t: DecisionTable<string> = { id: "x", name: "", hitPolicy: "ANY", rules: [
      { id: "a", when: [], then: "yes" }, { id: "b", when: [], then: "no" }] };
    expect(() => evaluate(t, {})).toThrow(/conflicting/);
  });

  it("supports in, between, exists, missing, contains and nested paths", () => {
    const t: DecisionTable<boolean> = { id: "ops", name: "", hitPolicy: "COLLECT", rules: [
      { id: "in", when: [{ field: "a.city", op: "in", value: ["الرياض", "جدة"] }], then: true },
      { id: "between", when: [{ field: "n", op: "between", value: [1, 3] }], then: true },
      { id: "exists", when: [{ field: "x", op: "exists" }], then: true },
      { id: "missing", when: [{ field: "y", op: "missing" }], then: true },
      { id: "contains", when: [{ field: "tags", op: "contains", value: "يتيم" }], then: true },
      { id: "dates", when: [{ field: "expiry", op: "lt", value: "2026-10-04" }], then: true },
    ] };
    const ev = evaluate(t, { a: { city: "جدة" }, n: 3, x: 0, y: "", tags: ["يتيم"], expiry: "2026-10-01" });
    expect(ev.matches.map((m) => m.ruleId)).toEqual(["in", "between", "exists", "missing", "contains", "dates"]);
  });

  it("a type mismatch never holds (no silent coercion of '5' to 5)", () => {
    const t: DecisionTable<boolean> = { id: "t", name: "", hitPolicy: "COLLECT", rules: [{ id: "r", when: [{ field: "n", op: "gt", value: 1 }], then: true }] };
    expect(evaluate(t, { n: "5" }).matches).toHaveLength(0);
  });

  it("validateTable reports duplicate ids and bad operands", () => {
    const errs = validateTable({ id: "t", name: "", hitPolicy: "COLLECT", rules: [
      { id: "a", when: [{ field: "x", op: "in", value: 3 }], then: 1 }, { id: "a", when: [], then: 1 }] });
    expect(errs).toContain("duplicate rule id a");
    expect(errs.some((e) => e.includes("needs an array"))).toBe(true);
  });
});
