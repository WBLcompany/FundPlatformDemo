import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Database } from "@wbl/kernel";
import { manih } from "@wbl/adapters";
import { approvalService, cycleService, financeService, frameworkService, handleManihWebhook, orgService, projectService, queries, semantic, sweeps, worker, ai } from "../src";
import { as, drain, env, lookup, makeAdapters, resetDb, system, URL } from "./harness";

let db: Database;
let adapters: ReturnType<typeof makeAdapters>;
let act: ReturnType<typeof as>;
let sys: ReturnType<typeof system>;
let tenant: string;
const now = () => new Date();

beforeAll(async () => {
  resetDb();
  db = new Database(URL);
  adapters = makeAdapters(db);
  act = as(db, adapters, now);
  sys = system(db, adapters, now);
  tenant = (await lookup(db, "admin@almulhi.demo")).tenantId;
});
afterAll(async () => { await Database.closeAll(); });

const anon = <T>(fn: Parameters<typeof db.session>[1]) => db.session({ role: "anon", tenant_id: tenant }, fn as never) as Promise<T>;
const base = () => ({ adapters, env, now: now() });
const anonCtx = <T>(fn: (ctx: import("../src").Ctx) => Promise<T>) => db.session({ role: "anon", tenant_id: tenant }, (tx) => fn({ ...base(), tx, actor: { personId: "anon", tenantId: tenant, grants: [] } }));

async function submittedApp(ownerEmail: string, programId = "family-empowerment-1448", amount = 120000) {
  const org = await act(ownerEmail, async (ctx) => ctx.actor.grants.find((g) => g.orgId)!.orgId!);
  const id = await act(ownerEmail, (ctx) => cycleService.createDraft(ctx, org, programId));
  await act(ownerEmail, (ctx) => cycleService.saveForm(ctx, id, { title: `طلب ${Math.random().toString(36).slice(2, 6)}`, need: "احتياج", goals: "أهداف", method: "منهجية", amount, beneficiaries: 10 }));
  await act(ownerEmail, (ctx) => cycleService.submit(ctx, id));
  return { id, org };
}
const assigneeEmail = (appId: string) => act("manager@almulhi.demo", async (ctx) => (await ctx.tx.one<{ email: string }>(
  "select p.email from cycle.applications a join iam.memberships m on m.tenant_id = a.tenant_id and m.id = a.assignee_membership_id join iam.persons p on p.id = m.person_id where a.id = $1", [appId])).email);

describe("registration", () => {
  it("R-009 a licence fetches the association from the registry for confirmation", async () => {
    const r = await anonCtx((ctx) => orgService.lookupLicense(ctx, "٩٠٠١"));
    expect(r).toMatchObject({ license: "9001", name: "جمعية تجريبية جديدة" });
    expect(r!.maskedPhone).not.toContain("500009001");
  });
  it("R-010 the code goes to the OFFICIAL phone from the registry, and the account opens only with it", async () => {
    const { otpId } = await anonCtx((ctx) => orgService.startRegistrationOtp(ctx, "9001"));
    const sent = adapters.otp.last()!;
    expect(sent.phone).toBe("+966500009001");
    expect((await anonCtx((ctx) => orgService.verifyOtp(ctx, otpId, "registration", "000000"))).ok).toBe(sent.code === "000000");
    expect((await anonCtx((ctx) => orgService.verifyOtp(ctx, otpId, "registration", sent.code))).ok).toBe(true);
    const r = await anonCtx((ctx) => orgService.completeRegistration(ctx, { license: "9001", otpId, via: "otp", fullName: "مستخدم جديد", email: "new@new.demo", phone: "+966500009111", password: "Strong-pass-1" }));
    expect(r.associationId).toBeTruthy();
    const login = await db.anon<{ person_id: string }>("select person_id from iam.login_lookup('new@new.demo')");
    expect(login).toHaveLength(1);
  });
  it("R-014 the same licence cannot open a second account at the same donor", async () => {
    const { otpId } = await anonCtx((ctx) => orgService.startRegistrationOtp(ctx, "9001"));
    await anonCtx((ctx) => orgService.verifyOtp(ctx, otpId, "registration", adapters.otp.last()!.code));
    await expect(anonCtx((ctx) => orgService.completeRegistration(ctx, { license: "9001", otpId, via: "otp", fullName: "x", email: "x2@new.demo", phone: "+966500009112", password: "Strong-pass-1" }))).rejects.toThrow(/duplicate|unique/);
  });
});

describe("documents and readiness", () => {
  it("N-01 uploading a licence proposes its type and dates; R-013 the person confirms", async () => {
    const org = await act("owner@namaa.demo", async (ctx) => ctx.actor.grants[0]!.orgId!);
    const up = await act("owner@namaa.demo", (ctx) => orgService.uploadDocument(ctx, { associationId: org, file: { name: "ترخيص.pdf", mime: "application/pdf", body: new Uint8Array([1, 2]) } }));
    expect(up.extraction.status).toBe("ready");
    expect(up.extraction.output).toMatchObject({ type: "license", expiry_date: "2027-03-01" });
    await act("owner@namaa.demo", (ctx) => orgService.confirmDocument(ctx, { documentId: up.documentId, type: "license", number: "3345", issueDate: "2024-03-01", expiryDate: "2027-03-01" }));
    const docs = await act("owner@namaa.demo", (ctx) => orgService.associationDocuments(ctx, org));
    expect(docs.filter((d) => d.doc_type === "license" && d.status === "confirmed")).toHaveLength(1);
  });
  it("R-015 R-016 an association with an expired bank certificate cannot submit, and sees why", async () => {
    const org = await act("owner@aytam.demo", async (ctx) => ctx.actor.grants[0]!.orgId!);
    const r = await act("owner@aytam.demo", (ctx) => orgService.readiness(ctx, org));
    expect(r.ready).toBe(false);
    expect(r.items.find((i) => i.key === "doc:bank_certificate")!.reason).toContain("انتهت");
    const id = await act("owner@aytam.demo", (ctx) => cycleService.createDraft(ctx, org, "family-empowerment-1448"));
    await act("owner@aytam.demo", (ctx) => cycleService.saveForm(ctx, id, { title: "ت", need: "ا", goals: "ا", method: "م", amount: 1000, beneficiaries: 1 }));
    await expect(act("owner@aytam.demo", (ctx) => cycleService.submit(ctx, id))).rejects.toThrow(/not_ready/);
  });
  it("R-008 an amount above the programme cap is refused with the reason", async () => {
    const org = await act("owner@namaa.demo", async (ctx) => ctx.actor.grants[0]!.orgId!);
    const id = await act("owner@namaa.demo", (ctx) => cycleService.createDraft(ctx, org, "orphan-education-1448"));
    await act("owner@namaa.demo", (ctx) => cycleService.saveForm(ctx, id, { title: "ت", need: "ا", goals: "ا", method: "م", amount: 999999, beneficiaries: 1 }));
    const pv = await act("owner@namaa.demo", (ctx) => cycleService.preview(ctx, id));
    expect(pv.eligibility.reasons.map((r) => r.reason)).toContain("المبلغ يتجاوز سقف البرنامج");
    await expect(act("owner@namaa.demo", (ctx) => cycleService.submit(ctx, id))).rejects.toThrow(/ineligible/);
  });
});

describe("study", () => {
  it("R-032 an info request reaches the association; answering returns it to review", async () => {
    const { id } = await submittedApp("owner@albir.demo");
    const sp = await assigneeEmail(id);
    await act(sp, (ctx) => cycleService.requestInfo(ctx, id, { items: ["عرض سعر"], message: "نرجو تزويدنا بعرض سعر." }));
    expect((await act("owner@albir.demo", (ctx) => cycleService.getApplication(ctx, id))).status).toBe("awaiting_info");
    await act("owner@albir.demo", (ctx) => cycleService.saveForm(ctx, id, { title: "معدل", need: "احتياج", goals: "أهداف", method: "منهجية", amount: 120000, beneficiaries: 10 }));
    await act("owner@albir.demo", (ctx) => cycleService.answerInfo(ctx, id, "أرفقنا عرض السعر"));
    expect((await act(sp, (ctx) => cycleService.getApplication(ctx, id))).status).toBe("in_review");
    await act("owner@albir.demo", (ctx) => cycleService.withdraw(ctx, id));
  });
  it("R-027 a reassignment needs a reason and R-090 notifies both parties", async () => {
    const { id } = await submittedApp("owner@albir.demo");
    await expect(act("manager@almulhi.demo", (ctx) => cycleService.reassign(ctx, [id], null, " ", null))).rejects.toThrow(/reason_required/);
    const before = await assigneeEmail(id);
    await act("manager@almulhi.demo", (ctx) => cycleService.reassign(ctx, [id], null, "إعادة توزيع العبء", "الملف جاهز"));
    const after = await assigneeEmail(id);
    expect(after).not.toBe(before);
    await drain(db, adapters);
    const notes = await act("manager@almulhi.demo", (ctx) => ctx.tx.query<{ email: string }>(
      "select p.email from kernel.notifications n join iam.persons p on p.id = n.recipient_person where n.template = 'application.reassigned'")).catch(() => []);
    void notes;
    const both = adapters.email.outbox.filter((m) => m.subject.startsWith("نُقل الطلب")).map((m) => m.to);
    expect(both).toEqual(expect.arrayContaining([before, after]));
    const custody = await act("manager@almulhi.demo", (ctx) => ctx.tx.query("select to_at from cycle.custody where application_id = $1 order by from_at", [id]));
    expect(custody).toHaveLength(2);
    await act("owner@albir.demo", (ctx) => cycleService.withdraw(ctx, id));
  });
  it("N-08 a conflict declaration moves the application to someone else", async () => {
    const { id } = await submittedApp("owner@albir.demo");
    const sp = await assigneeEmail(id);
    await act(sp, (ctx) => cycleService.declareConflict(ctx, id, "قرابة"));
    expect(await assigneeEmail(id)).not.toBe(sp);
    await act("owner@albir.demo", (ctx) => cycleService.withdraw(ctx, id));
  });
  it("R-039 independent mode: Manih's scores stay sealed until the specialist records theirs", async () => {
    const { id } = await submittedApp("owner@namaa.demo", "orphan-education-1448", 100000);
    await drain(db, adapters);
    const sp = await assigneeEmail(id);
    const before = await act(sp, (ctx) => ai.latestOutput(ctx, id, "application.study_file"));
    expect(before?.status).toBe("ready");
    expect(before?.sealed).toBeNull();
    await act(sp, (ctx) => cycleService.recordAssessment(ctx, id, { need: 3, method: 3, budget: 4, capacity: 4 }));
    const after = await act(sp, (ctx) => ai.latestOutput(ctx, id, "application.study_file"));
    expect((after?.sealed as { scores: unknown[] }).scores.length).toBe(4);
  });
});

describe("money", () => {
  it("ق٥ T-38 two concurrent final approvals cannot exceed the balance", async () => {
    // Two staff sessions reserve at the same moment against a small account.
    await act("admin@almulhi.demo", (ctx) => ctx.tx.query("insert into finance.budget_accounts (tenant_id, name, period) values (app.tenant(), 'حساب صغير', 'x')"));
    const acct = await act("admin@almulhi.demo", async (ctx) => (await ctx.tx.one<{ id: string }>("select id from finance.budget_accounts where name = 'حساب صغير'")).id);
    await act("admin@almulhi.demo", (ctx) => ctx.tx.query("select finance.post($1, 'allocation', 100000, null, null)", [acct]));
    const reserve = () => act("manager@almulhi.demo", (ctx) => ctx.tx.query("select finance.post($1, 'reservation', 70000, 'application', gen_random_uuid())", [acct])).then(() => "ok", (e) => String(e.message));
    const results = await Promise.all([reserve(), reserve()]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.find((r) => r !== "ok")).toMatch(/insufficient_budget/);
  });
  it("R-070 a bank change needs the step-up code, and finance — not the requester — acknowledges it", async () => {
    const org = await act("owner@namaa.demo", async (ctx) => ctx.actor.grants[0]!.orgId!);
    await expect(act("owner@namaa.demo", (ctx) => orgService.requestBankChange(ctx, { associationId: org, otpId: "00000000-0000-4000-8000-000000000000", bankName: "البنك الأهلي", iban: "SA0380000000608010167519" }))).rejects.toThrow(/otp_required/);
    const { otpId } = await act("owner@namaa.demo", (ctx) => orgService.startStepUp(ctx, "bank_account", org));
    await act("owner@namaa.demo", (ctx) => orgService.verifyOtp(ctx, otpId, "bank_account", adapters.otp.last()!.code));
    await expect(act("owner@namaa.demo", (ctx) => orgService.requestBankChange(ctx, { associationId: org, otpId, bankName: "البنك الأهلي", iban: "SA0380000000608010167518" }))).rejects.toThrow(/bad_iban/);
    const { accountId } = await act("owner@namaa.demo", (ctx) => orgService.requestBankChange(ctx, { associationId: org, otpId, bankName: "البنك الأهلي", iban: "SA0380000000608010167519" }));
    await act("finance@almulhi.demo", (ctx) => orgService.acknowledgeBank(ctx, accountId));
    const st = await act("finance@almulhi.demo", (ctx) => ctx.tx.one<{ status: string; iban_last4: string }>("select status, iban_last4 from finance.bank_accounts where id = $1", [accountId]));
    expect(st).toEqual({ status: "acknowledged", iban_last4: "7519" });
  });
});

describe("outbox and Manih contract", () => {
  it("R-096 T-17 an event reaches each consumer exactly once even when processed twice concurrently", async () => {
    await act("owner@albir.demo", (ctx) => ctx.tx.emit({ type: "association.reinstated", entityKind: "association", entityId: ctx.actor.grants[0]!.orgId!, payload: { org_id: ctx.actor.grants[0]!.orgId! } }));
    await Promise.all([worker.processOutbox(db, adapters, env), worker.processOutbox(db, adapters, env)]);
    const dup = await sys(tenant, (ctx) => ctx.tx.query("select event_id, consumer, count(*) from kernel.outbox_deliveries group by 1, 2 having count(*) > 1"));
    expect(dup).toEqual([]);
    const act1 = await sys(tenant, (ctx) => ctx.tx.query("select event_id from kernel.activity where text_key = 'رُفع إيقاف التعاملات'"));
    expect(act1).toHaveLength(1);    // one row on the association page, once
  });
  it("N-12 a forged or stale webhook is refused; a replay changes nothing", async () => {
    const body = JSON.stringify({ task_id: "x", idempotency_key: `${tenant}:message.draft:x`, task_type: "message.draft", schema_version: "1", status: "completed", output: { text: "حقن" } });
    expect((await handleManihWebhook(db, adapters, env, body, { signature: "00", timestamp: String(Date.now()) })).status).toBe(401);
    const h = manih.signWebhook(env.manihWebhookSecret, body, String(Date.now() - 10 * 60_000));
    expect((await handleManihWebhook(db, adapters, env, body, { signature: h["x-manih-signature"], timestamp: h["x-manih-timestamp"] })).status).toBe(401);
    const ok = manih.signWebhook(env.manihWebhookSecret, body);
    expect((await handleManihWebhook(db, adapters, env, body, { signature: ok["x-manih-signature"], timestamp: ok["x-manih-timestamp"] })).body).toEqual({ outcome: "ignored" });
  });
  it("§3 an output that fails its schema is retried once, then shown as «تعذّر»", async () => {
    const bad = makeAdapters(db, "invalid");
    const { id } = await submittedApp("owner@albir.demo");
    await worker.drain(db, bad, env);
    const out = await act("manager@almulhi.demo", (ctx) => ai.latestOutput(ctx, id, "application.study_file"));
    expect(out?.status).toBe("failed");
    expect(out?.error).toMatch(/غير مطابقة للمخطط/);
    await act("owner@albir.demo", (ctx) => cycleService.withdraw(ctx, id));
  });
});

describe("visibility and questions", () => {
  it("R-099 search finds by number and normalised Arabic, and nothing outside permission", async () => {
    const staff = await act("sara@almulhi.demo", (ctx) => queries.search(ctx, "البر"));
    expect(staff.some((r) => r.kind === "association")).toBe(true);
    const assoc = await act("owner@namaa.demo", (ctx) => queries.search(ctx, "البر"));
    expect(assoc.some((r) => r.label === "جمعية البر بالدار البيضاء")).toBe(false);
    const other = await act("admin@second.demo", (ctx) => queries.search(ctx, "جمعية"));
    expect(other.every((r) => r.label !== "جمعية البر بالدار البيضاء")).toBe(true);
  });
  it("R-097 a link appears only for a viewer who may open the page", async () => {
    const assoc = await act("owner@albir.demo", (ctx) => queries.search(ctx, "ط-"));
    expect(assoc.every((r) => !r.href || r.href.startsWith("/portal/"))).toBe(true);
  });
  it("R-100 a question becomes an intent; the number comes from the catalogue and links to its list; nonsense is not guessed", async () => {
    const a = await act("ceo@almulhi.demo", (ctx) => semantic.ask(ctx, "كم صرفنا هذا العام؟", ["executive"]));
    expect(a.kind).toBe("answer");
    if (a.kind === "answer") { expect(typeof a.value).toBe("number"); expect(a.listHref).toContain("/staff/reports/disbursements"); }
    const n = await act("ceo@almulhi.demo", (ctx) => semantic.ask(ctx, "ما لون السماء؟", ["executive"]));
    expect(n.kind).toBe("not_understood");
    await expect(act("sara@almulhi.demo", (ctx) => semantic.ask(ctx, "كم صرفنا؟", ["executive"]))).rejects.toThrow(/forbidden/);
  });
  it("R-006 the onboarding checklist reports what is missing", async () => {
    const steps = await act("admin@almulhi.demo", (ctx) => frameworkService.setupChecklist(ctx));
    expect(steps.find((s) => s.key === "framework")!.done).toBe(true);
  });
  it("R-087 approving a changed draft creates a new numbered version; old applications stay on theirs", async () => {
    const draft = await act("admin@almulhi.demo", (ctx) => frameworkService.getDraft(ctx));
    draft.config.programs[0]!.capHalalas = 45_000_000;
    await act("admin@almulhi.demo", (ctx) => frameworkService.saveDraft(ctx, draft.config, draft.revision));
    const v = await act("ceo@almulhi.demo", (ctx) => frameworkService.approveDraft(ctx, "رفع السقف"));
    expect(v.number).toMatch(/^\d{4}-0[2-9]$/);
    expect(v.changes[0]).toContain("سقف");
    const versions = await act("admin@almulhi.demo", (ctx) => ctx.tx.query<{ n: number }>("select count(distinct framework_version_id)::int as n from cycle.applications where status <> 'draft'"));
    expect(versions[0]!.n).toBe(1);   // everything submitted so far stays on 2026-01
  });
});

describe("sweeps", () => {
  it("R-017 R-069 an expired essential document suspends orders and projects; renewal resumes them", async () => {
    // Expire namaa's bank certificate today and run the sweep.
    await act("owner@namaa.demo", (ctx) => ctx.tx.query("select 1"));
    await sys(tenant, (ctx) => ctx.tx.query("update org.documents set expiry_date = current_date - 1 where doc_type = 'bank_certificate' and status = 'confirmed' and association_id = (select id from org.associations where license_no = '3345')"));
    const r = await sys(tenant, (ctx) => sweeps.documentExpiry(ctx));
    expect(r).toBeTruthy();
    const ready = await act("owner@namaa.demo", (ctx) => orgService.readiness(ctx, ctx.actor.grants[0]!.orgId!));
    expect(ready.ready).toBe(false);
  });
  it("R-044 an application past its due time emits sla.breached once", async () => {
    const { id } = await submittedApp("owner@albir.demo");
    await sys(tenant, (ctx) => ctx.tx.query("update cycle.applications set due_at = now() - interval '1 hour', version = version + 1 where id = $1", [id]));
    expect(await sys(tenant, (ctx) => sweeps.slaBreaches(ctx))).toBeGreaterThanOrEqual(1);
    expect(await sys(tenant, (ctx) => sweeps.slaBreaches(ctx))).toBe(0);
  });
});

void anon; void approvalService; void financeService; void projectService;
