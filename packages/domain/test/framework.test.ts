import { describe, expect, it } from "vitest";
import { framework } from "../src";

const { defaultConfig, validateConfig, validateForm, completeness, mappedValues, nextVersionNumber, diffConfigs, snapshotHash } = framework;

describe("framework", () => {
  it("R-002 the default config is valid as shipped (works without opening settings)", () => {
    const r = validateConfig(defaultConfig());
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("R-002 the default chain exists and the default disbursement chain is one finance level (R-064)", () => {
    const c = defaultConfig();
    expect(c.approvalChains[0]!.levels.length).toBeGreaterThan(0);
    expect(c.disbursementChain.levels.map((l) => l.role)).toEqual(["finance"]);
  });

  it("R-001 criteria weights must total 100", () => {
    const c = defaultConfig();
    c.programs[0]!.criteria[0]!.weight = 30;
    const r = validateConfig(c);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join()).toMatch(/weights total 105/);
  });

  it("R-001 a programme pointing at an unknown chain or account is refused", () => {
    const c = defaultConfig();
    c.programs[0]!.approvalChainId = "nope";
    c.programs[0]!.budgetAccount = "nope";
    const r = validateConfig(c);
    expect(!r.ok && r.errors.length).toBe(2);
  });

  it("R-022 the form validator refuses missing required fields and bad numbers, in Arabic", () => {
    const form = defaultConfig().programs[0]!.form;
    const errs = validateForm(form, { title: "مشروع", amount: "abc", beneficiaries: 2.5 });
    expect(errs.need).toBe("هذا الحقل مطلوب");
    expect(errs.amount).toBe("أدخل رقماً");
    expect(errs.beneficiaries).toBe("أدخل عدداً صحيحاً");
  });

  it("R-022 a partial validation (autosave) does not demand required fields", () => {
    const form = defaultConfig().programs[0]!.form;
    expect(validateForm(form, { title: "مشروع" }, { partial: true })).toEqual({});
  });

  it("N-02 completeness counts the required fields that are filled", () => {
    const form = defaultConfig().programs[0]!.form;
    expect(completeness(form, { title: "x", need: " " })).toMatchObject({ done: 1, total: 6 });
  });

  it("mapped values convert riyals to halalas", () => {
    const form = defaultConfig().programs[0]!.form;
    expect(mappedValues(form, { title: "مطبخ", amount: "386000.5", beneficiaries: "40" })).toEqual({ title: "مطبخ", requestedHalalas: 38600050, beneficiaries: 40 });
  });

  it("R-087 version numbers increment within the year", () => {
    expect(nextVersionNumber([], 2026)).toBe("2026-01");
    expect(nextVersionNumber(["2026-01", "2026-02", "2025-07"], 2026)).toBe("2026-03");
  });

  it("R-087 the snapshot hash is independent of key order", () => {
    const a = defaultConfig();
    const reverse = (v: unknown): unknown => Array.isArray(v) ? v.map(reverse) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)])) : v;
    const b = reverse(a) as typeof a;
    expect(snapshotHash(b)).toBe(snapshotHash(a));
  });

  it("R-088 the diff names what changed", () => {
    const before = defaultConfig();
    const after = defaultConfig();
    after.programs[0]!.capHalalas = 40_000_000;
    expect(diffConfigs(before, after)).toEqual(["سقف «منح المشاريع التنموية»: 500000 ← 400000 ريال"]);
    expect(diffConfigs(null, after)).toEqual(["الإصدار الأول للإطار"]);
  });
});
