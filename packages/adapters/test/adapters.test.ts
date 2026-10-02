import { describe, expect, it } from "vitest";
import { manih, fillTemplate, missingPlaceholders, MockScanner, MockEntitiesRegistry, generateCode, hashCode, rtlHtml, LocalStorage } from "../src";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("R-112 redaction before Manih", () => {
  it("R-112 masks national ids, phones, IBANs, emails and listed names, and restores them", () => {
    const src = "المستفيد محمد أحمد، هوية 1012345678، جوال 0551234567، حساب SA0380000000608010167519، بريد a.b@x.org";
    const r = manih.redact(src, ["محمد أحمد"]);
    expect(r.text).not.toMatch(/1012345678|0551234567|SA03|a\.b@x\.org|محمد أحمد/);
    expect(r.text).toContain("⟦NATIONAL_ID_1⟧");
    expect(manih.restore(r.text, r.map)).toBe(src);
  });
  it("R-112 the same value maps to the same token across a whole object", () => {
    const { value, map } = manih.redactDeep({ a: "0551234567", b: ["اتصل على 0551234567"] });
    expect(value.a).toBe("⟦PHONE_1⟧");
    expect(value.b[0]).toBe("اتصل على ⟦PHONE_1⟧");
    expect(Object.keys(map)).toHaveLength(1);
  });
});

describe("Manih contract", () => {
  it("N-12 a study file without evidence on a score is refused by the schema", () => {
    const bad = manih.mockOutput("application.study_file", { criteria: [{ key: "need", name: "x", max: 5 }], requested_halalas: 100 }) as { scores: Array<{ evidence: unknown[] }> };
    bad.scores[0]!.evidence = [];
    expect(manih.parseOutput("application.study_file", bad).ok).toBe(false);
  });
  it("R-113 every mock output satisfies its schema", () => {
    for (const task of Object.keys(manih.outputs) as manih.TaskType[]) {
      const out = manih.mockOutput(task, { criteria: [{ key: "need", name: "x", max: 5 }], requested_halalas: 1000, application_refs: ["ط-2026-0001"], question: "كم صرفنا هذا العام", candidates: [{ id: "a" }], form_keys: ["title"] });
      expect(manih.parseOutput(task, out).ok, task).toBe(true);
    }
  });
  it("R-039 the study file splits into an open part and a sealed part", () => {
    const out = manih.parseOutput("application.study_file", manih.mockOutput("application.study_file", { criteria: [{ key: "need", name: "x", max: 5 }], requested_halalas: 100 }));
    if (!out.ok) throw new Error(out.error);
    const { open, sealed } = manih.splitStudyFile(out.value);
    expect(Object.keys(open)).not.toContain("scores");
    expect(Object.keys(sealed).sort()).toEqual(["recommendation", "scores"]);
  });
  it("R-112 webhook signatures verify, and stale or forged ones are refused", () => {
    const body = JSON.stringify({ task_id: "t1" });
    const h = manih.signWebhook("s3cret", body, "1700000000000");
    expect(manih.verifyWebhook("s3cret", body, { signature: h["x-manih-signature"], timestamp: h["x-manih-timestamp"] }, 1700000001000)).toEqual({ ok: true });
    expect(manih.verifyWebhook("other", body, { signature: h["x-manih-signature"], timestamp: h["x-manih-timestamp"] }, 1700000001000)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(manih.verifyWebhook("s3cret", body, { signature: h["x-manih-signature"], timestamp: h["x-manih-timestamp"] }, 1700000000000 + 10 * 60_000)).toMatchObject({ ok: false, reason: "stale_timestamp" });
  });
  it("R-113 the mock delivers a signed callback the webhook verifier accepts", async () => {
    let received: { body: string; headers: Record<string, string> } | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => { received = { body: String(init.body), headers: init.headers as Record<string, string> }; return new Response("{}"); }) as unknown as typeof fetch;
    const client = new manih.MockManihClient({ secret: "k", fetchImpl });
    const { task_id } = await client.submit({ task_type: "message.draft", schema_version: "1", tenant_ref: "t", framework_version_ref: null, inputs: { items: ["أ"] }, idempotency_key: "idem-1", callback_url: "http://x/hook" });
    expect(task_id).toMatch(/^mock_/);
    const r = received!;
    expect(manih.verifyWebhook("k", r.body, { signature: r.headers["x-manih-signature"]!, timestamp: r.headers["x-manih-timestamp"]! })).toEqual({ ok: true });
  });
  it("R-113 the same idempotency key yields the same task id", async () => {
    const c = new manih.MockManihClient({ secret: "k", deliver: false });
    const req = { task_type: "message.draft" as const, schema_version: "1", tenant_ref: "t", framework_version_ref: null, inputs: {}, idempotency_key: "same", callback_url: "x" };
    expect((await c.submit(req)).task_id).toBe((await c.submit(req)).task_id);
  });
});

describe("other adapters", () => {
  it("R-010 codes are six digits and hashed with a salt", () => {
    const c = generateCode();
    expect(c).toMatch(/^\d{6}$/);
    expect(hashCode(c, "a")).not.toBe(hashCode(c, "b"));
  });
  it("R-009 the mock registry returns the fixture for a known licence and null otherwise", async () => {
    const r = new MockEntitiesRegistry();
    expect((await r.lookup("1287"))!.name).toBe("جمعية البر بالدار البيضاء");
    expect(await r.lookup("0000")).toBeNull();
  });
  it("the scanner flags EICAR", async () => {
    const s = new MockScanner();
    expect(await s.scan(new TextEncoder().encode("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"))).toBe("infected");
    expect(await s.scan(new TextEncoder().encode("hello"))).toBe("clean");
  });
  it("R-048 templates escape values and report unfilled placeholders", () => {
    const out = fillTemplate("<p>{{name}} — {{amount}} {{missing}}</p>", { name: "<b>x</b>", amount: "350,000" });
    expect(out).toBe("<p>&lt;b&gt;x&lt;/b&gt; — 350,000 {{missing}}</p>");
    expect(missingPlaceholders(out)).toEqual(["missing"]);
  });
  it("R-115 email HTML is RTL", () => {
    expect(rtlHtml("مرحباً")).toContain('dir="rtl"');
  });
  it("local storage refuses a key that escapes its root", async () => {
    const s = new LocalStorage(mkdtempSync(path.join(tmpdir(), "st-")));
    await expect(s.put("../evil", new Uint8Array([1]), "x")).rejects.toThrow(/escapes/);
    await s.put("t1/a.txt", new TextEncoder().encode("hi"), "text/plain");
    expect(new TextDecoder().decode((await s.get("t1/a.txt"))!)).toBe("hi");
  });
});
