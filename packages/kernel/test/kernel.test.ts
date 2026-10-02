import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptField, encryptField, normalizeArabic, render, searchPattern, secretFromEnv, TEMPLATES, verifyChain, type AuditRow } from "../src";

describe("search normalisation (D-10, R-099)", () => {
  it("folds hamza seats, alef maqsura, ta marbuta, diacritics, tatweel and Arabic-Indic digits", () => {
    expect(normalizeArabic("جمعيّة إطعام الأيتام")).toBe("جمعيه اطعام الايتام");
    expect(normalizeArabic("مُسـتشفى")).toBe("مستشفي");
    expect(normalizeArabic("ط-٢٠٢٦-٠٠٠١")).toBe("ط-2026-0001");
    expect(normalizeArabic("۱۲۳ ABC")).toBe("123 abc");
  });
  it("matches the SQL app.normalize_ar() outputs on the same inputs", () => {
    // Values produced by app.normalize_ar() for the same strings (search_reporting migration).
    const sql: Record<string, string> = { "أُسرة": "اسره", "مؤسسة نورة": "موسسه نوره", "ئ": "ي" };
    for (const [input, out] of Object.entries(sql)) expect(normalizeArabic(input)).toBe(out);
  });
  it("escapes LIKE wildcards and ignores one-character queries", () => {
    expect(searchPattern("50%_")).toBe("%50\\%\\_%");
    expect(searchPattern("ا")).toBeNull();
  });
});

describe("field encryption (architecture §8)", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const B = "22222222-2222-2222-2222-222222222222";
  it("round-trips per tenant and never across tenants", () => {
    const blob = encryptField(A, "SA0380000000608010167519");
    expect(decryptField(A, blob)).toBe("SA0380000000608010167519");
    expect(() => decryptField(B, blob)).toThrow();
  });
  it("uses a fresh IV each time", () => {
    expect(encryptField(A, "x").equals(encryptField(A, "x"))).toBe(false);
  });
});

describe("secrets fail closed in production", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it("returns the configured value", () => {
    vi.stubEnv("WBL_TEST_SECRET", "real");
    expect(secretFromEnv("WBL_TEST_SECRET", "dev")).toBe("real");
  });
  it("falls back to the dev value outside production only", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(secretFromEnv("WBL_TEST_MISSING", "dev")).toBe("dev");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => secretFromEnv("WBL_TEST_MISSING", "dev")).toThrow(/required in production/);
  });
});

describe("notifications (R-108)", () => {
  it("fills parameters and leaves an unknown one visible rather than blank", () => {
    expect(render({ subject: "الطلب {ref}", body: "مرحباً {name}" }, { ref: "ط-2026-0001" })).toEqual({ subject: "الطلب ط-2026-0001", body: "مرحباً {name}" });
  });
  it("every template renders a subject and a body", () => {
    for (const tpl of Object.values(TEMPLATES)) { expect(tpl!.subject.length).toBeGreaterThan(0); expect(tpl!.body.length).toBeGreaterThan(0); }
  });
});

describe("audit chain verification (R-095)", () => {
  const T = "11111111-1111-1111-1111-111111111111";
  const make = (rows: Array<Omit<AuditRow, "prev_hash" | "hash">>): AuditRow[] => {
    let prev = "genesis";
    return rows.map((r) => {
      const hash = createHash("sha256").update(`${prev}|${r.tenant_id}|${r.at}|${r.actor ?? ""}|${r.action}|${r.entity_kind}|${r.entity_id ?? ""}|${JSON.stringify(r.before)}|${JSON.stringify(r.after)}`).digest("hex");
      const row = { ...r, prev_hash: prev, hash };
      prev = hash;
      return row;
    });
  };
  const text = (r: AuditRow) => ({ at: r.at, before: JSON.stringify(r.before), after: JSON.stringify(r.after) });
  const rows = make([
    { id: 1, tenant_id: T, at: "2026-10-01", actor: null, action: "insert", entity_kind: "application", entity_id: "a", before: null, after: { status: "draft" } },
    { id: 2, tenant_id: T, at: "2026-10-02", actor: null, action: "update", entity_kind: "application", entity_id: "a", before: { status: "draft" }, after: { status: "submitted" } },
  ]);
  it("accepts an intact chain", () => { expect(verifyChain(rows, text)).toEqual({ ok: true }); });
  it("points at the first tampered row", () => {
    const tampered = rows.map((r) => (r.id === 2 ? { ...r, after: { status: "approved" } } : r));
    expect(verifyChain(tampered, text)).toEqual({ ok: false, brokenAt: 2 });
  });
});
