import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Database } from "@wbl/kernel";
import { approvalService, cycleService, financeService, orgService, projectService, queries, ai, sweeps } from "../src";
import { as, drain, lookup, makeAdapters, resetDb, system, URL } from "./harness";

/**
 * T-59 core / R-112: one application from the Almulhi demo crosses the WHOLE
 * cycle — submission, automatic assignment, Manih study file, judgement,
 * multi-level approval with a committee minutes, budget reservation,
 * agreement, both signatures, project, disbursement with a return, a
 * deliverable, the final report and closure. Run twice: AI on (mock Manih),
 * then AI disabled, where every step must work on the manual path.
 */
for (const aiOn of [true, false]) {
  describe(`R-112 full cycle — AI ${aiOn ? "on (mock Manih)" : "disabled"}`, () => {
    let db: Database;
    let adapters: ReturnType<typeof makeAdapters>;
    const now = () => new Date();
    let act: ReturnType<typeof as>;
    let sys: ReturnType<typeof system>;
    let tenant: string;
    let albir: string;
    let appId: string;
    let projectId: string;

    beforeAll(async () => {
      resetDb();
      db = new Database(URL);
      adapters = makeAdapters(db);
      act = as(db, adapters, now);
      sys = system(db, adapters, now);
      const p = await lookup(db, "owner@albir.demo");
      tenant = p.tenantId;
      if (!aiOn) {
        // Only an admin may switch AI off; done through the admin's own session.
        await act("admin@almulhi.demo", (ctx) => ctx.tx.query("update platform.donors set ai_enabled = false where id = app.tenant()"));
      }
      albir = await act("owner@albir.demo", async (ctx) => ctx.actor.grants[0]!.orgId!);
    });
    afterAll(async () => { await Database.closeAll(); });

    it("R-019 R-022 a ready association fills and submits; the incomplete form is refused first", async () => {
      appId = await act("owner@albir.demo", (ctx) => cycleService.createDraft(ctx, albir, "family-empowerment-1448"));
      await act("owner@albir.demo", (ctx) => cycleService.saveForm(ctx, appId, { title: "مطبخ إنتاجي لتمكين ٤٠ أسرة", amount: 386000 }));
      await expect(act("owner@albir.demo", (ctx) => cycleService.submit(ctx, appId))).rejects.toThrow(/incomplete/);
      await act("owner@albir.demo", (ctx) => cycleService.saveForm(ctx, appId, {
        title: "مطبخ إنتاجي لتمكين ٤٠ أسرة", need: "مسح ميداني لـ 62 أسرة، جوال المنسق 0551234567.", goals: "تمكين 40 أسرة من دخل شهري.", method: "تدريب ثم تشغيل ثم تسويق.",
        amount: 386000, beneficiaries: 40, budgetLines: "معدات المطبخ: 168000\nالتدريب: 92000\nالمواد الخام: 66000\nالتسويق: 60000", indicators: "80% من الأسر تستمر بعد 6 أشهر",
      }));
      const pv = await act("owner@albir.demo", (ctx) => cycleService.preview(ctx, appId));
      expect(pv.eligibility.pass).toBe(true);
      expect(pv.completeness.done).toBe(pv.completeness.total);
      const r = await act("owner@albir.demo", (ctx) => cycleService.submit(ctx, appId));
      expect(r.ref).toMatch(/^ط-\d{4}-\d{4}$/);
    });

    it("R-024 the submitted application has an assignee and a custody row the moment it arrives", async () => {
      const row = await act("manager@almulhi.demo", (ctx) => ctx.tx.one<{ assignee_membership_id: string; status: string; due_at: string }>("select assignee_membership_id, status, due_at from cycle.applications where id = $1", [appId]));
      expect(row.assignee_membership_id).toBeTruthy();
      expect(row.due_at).toBeTruthy();
      const c = await act("manager@almulhi.demo", (ctx) => ctx.tx.query("select * from cycle.custody where application_id = $1 and to_at is null", [appId]));
      expect(c).toHaveLength(1);
    });

    it(`R-033 ${aiOn ? "Manih's study file arrives through the signed webhook" : "no AI output exists and nothing waits for one"}`, async () => {
      await drain(db, adapters);
      const out = await act("manager@almulhi.demo", (ctx) => ai.latestOutput(ctx, appId, "application.study_file"));
      if (aiOn) {
        expect(out?.status).toBe("ready");
        expect((out?.output as { summary: { text: string } }).summary.text).toContain("ملخص مانح");
        // R-112: the phone number in the form never reached Manih.
        const sent = await sys(tenant, (ctx) => ctx.tx.one<{ inputs: unknown }>("select inputs from cycle.ai_task_payload($1)", [out!.id]));
        expect(JSON.stringify(sent.inputs)).not.toContain("0551234567");
      } else {
        expect(out).toBeNull();
      }
    });

    it("R-094 the official email received the submission notice", () => {
      expect(adapters.email.outbox.some((m) => m.to === "info@albir.example.sa" && m.subject.includes("أُرسل طلبكم"))).toBe(true);
    });

    it("R-077 the assignee's «مهامي» lists it with one line of what to do", async () => {
      const assignee = await act("manager@almulhi.demo", (ctx) => ctx.tx.one<{ email: string }>("select p.email from cycle.applications a join iam.memberships m on m.tenant_id = a.tenant_id and m.id = a.assignee_membership_id join iam.persons p on p.id = m.person_id where a.id = $1", [appId]));
      const tasks = await act(assignee.email, (ctx) => queries.myTasks(ctx));
      const t = tasks.find((x) => x.id === `app:${appId}`)!;
      expect(t.whatToDo.length).toBeGreaterThan(10);
    });

    it("R-034 R-038 the specialist judges every criterion and submits a recommendation into the chain", async () => {
      const assignee = await act("manager@almulhi.demo", (ctx) => ctx.tx.one<{ email: string }>("select p.email from cycle.applications a join iam.memberships m on m.tenant_id = a.tenant_id and m.id = a.assignee_membership_id join iam.persons p on p.id = m.person_id where a.id = $1", [appId]));
      await act(assignee.email, (ctx) => cycleService.startReview(ctx, appId));
      await expect(act(assignee.email, (ctx) => approvalService.submitRecommendation(ctx, appId, { decision: "approve_modified", amountHalalas: 35_000_000, rationale: "x" }))).rejects.toThrow(/scores_required/);
      await act(assignee.email, (ctx) => cycleService.saveJudgement(ctx, appId, { scores: { need: 4, goals: 3, method: 3, budget: 2, indicators: 4, capacity: 5 }, summary: "ملخص الأخصائي" }));
      const r = await act(assignee.email, (ctx) => approvalService.submitRecommendation(ctx, appId, { decision: "approve_modified", amountHalalas: 35_000_000, rationale: "موافقة بعد تخفيض بند المعدات" }));
      // 350,000 > 100,000 → committee; > 300,000 → CEO (R-042: only applicable levels).
      expect(r.next).toEqual(["مدير المنح", "اللجنة", "المدير التنفيذي"]);
    });

    it("R-079 only the awaited role sees it as «بانتظار اعتمادك»", async () => {
      expect((await act("manager@almulhi.demo", (ctx) => approvalService.awaitingMe(ctx))).map((i) => i.subject_id)).toContain(appId);
      expect((await act("ceo@almulhi.demo", (ctx) => approvalService.awaitingMe(ctx))).map((i) => i.subject_id)).not.toContain(appId);
    });

    it("R-043 R-045 the manager approves; the committee decides from one minutes file", async () => {
      const inst = await act("manager@almulhi.demo", (ctx) => approvalService.openInstanceFor(ctx, "application", appId));
      await act("manager@almulhi.demo", (ctx) => approvalService.act(ctx, inst!.id, { kind: "approve" }));
      const ready = await act("secretary@almulhi.demo", (ctx) => approvalService.committeeReady(ctx));
      expect(ready.map((r) => r.subject_id)).toContain(appId);
      const fileId = await act("secretary@almulhi.demo", (ctx) => orgService.storeFile(ctx, { name: "محضر.txt", mime: "text/plain", body: new TextEncoder().encode("البند 1: الموافقة"), ownerOrgId: null, text: "البند 1: الموافقة" }));
      const meeting = await act("secretary@almulhi.demo", (ctx) => approvalService.createMeeting(ctx, { title: "اللجنة 1448-04", heldOn: "2026-10-20", minutesFileId: fileId, applicationIds: [appId] }));
      await drain(db, adapters);
      const done = await act("secretary@almulhi.demo", (ctx) => approvalService.confirmCommitteeDecisions(ctx, meeting.meetingId, [{ applicationId: appId, decision: "approve", amountHalalas: 35_000_000 }]));
      expect(done).toEqual([appId]);
    });

    it("ق٥ R-047 the CEO's final approval reserves the money and records the decision on its framework version", async () => {
      const inst = await act("ceo@almulhi.demo", (ctx) => approvalService.openInstanceFor(ctx, "application", appId));
      await act("ceo@almulhi.demo", (ctx) => approvalService.act(ctx, inst!.id, { kind: "approve" }));
      const a = await act("ceo@almulhi.demo", (ctx) => ctx.tx.one<{ status: string; decision: string; approved_halalas: number; framework_version_id: string }>("select status, decision, approved_halalas, framework_version_id from cycle.applications where id = $1", [appId]));
      expect(a).toMatchObject({ status: "agreement", decision: "approved", approved_halalas: 35_000_000 });
      expect(a.framework_version_id).toBeTruthy();
      const bal = await act("finance@almulhi.demo", (ctx) => ctx.tx.one<{ reserved_halalas: number }>("select reserved_halalas from finance.balances"));
      expect(Number(bal.reserved_halalas)).toBe(35_000_000);
    });

    it("R-089 the rationale page has version, scores, recommendation and every approver", async () => {
      const r = await act("manager@almulhi.demo", (ctx) => queries.rationale(ctx, appId));
      expect(r.version).toBe("2026-01");
      expect(r.approvers.map((x) => x.level)).toEqual(["مدير المنح", "اللجنة", "المدير التنفيذي"]);
      expect(r.meeting?.title).toBe("اللجنة 1448-04");
      expect(r.scores.every((s) => s.human !== null)).toBe(true);
    });

    it("R-048 R-049 R-050 the agreement is generated, signed by the association then the donor, and the project follows", async () => {
      const ag = await act("owner@albir.demo", (ctx) => ctx.tx.one<{ id: string; generated_file_id: string }>("select id, generated_file_id from project.agreements where application_id = $1", [appId]));
      expect(ag.generated_file_id).toBeTruthy();
      await expect(act("ceo@almulhi.demo", (ctx) => projectService.donorSign(ctx, ag.id))).rejects.toThrow(/association_first/);
      const signed = await act("owner@albir.demo", (ctx) => orgService.storeFile(ctx, { name: "signed.pdf", mime: "application/pdf", body: new Uint8Array([37, 80, 68, 70]), ownerOrgId: albir }));
      await act("owner@albir.demo", (ctx) => projectService.associationSign(ctx, ag.id, signed));
      const r = await act("ceo@almulhi.demo", (ctx) => projectService.donorSign(ctx, ag.id));
      projectId = r.projectId!;
      const inst = await act("finance@almulhi.demo", (ctx) => ctx.tx.query<{ amount_halalas: number; condition: string }>("select amount_halalas, condition from finance.installments where project_id = $1 order by seq", [projectId]));
      expect(inst.reduce((s, i) => s + i.amount_halalas, 0)).toBe(35_000_000);
      expect(inst.at(-1)!.condition).toBe("final_report");
    });

    it("R-064 R-065 R-066 the first installment's order passes the finance chain; a return goes back without restarting it; execution notifies", async () => {
      const order = await act("finance@almulhi.demo", (ctx) => ctx.tx.one<{ id: string; status: string }>("select id, status from finance.disbursement_orders where project_id = $1", [projectId]));
      expect(order.status).toBe("in_approval");
      const inst = await act("finance@almulhi.demo", (ctx) => approvalService.openInstanceFor(ctx, "disbursement", order.id));
      await act("finance@almulhi.demo", (ctx) => approvalService.act(ctx, inst!.id, { kind: "approve" }));
      await act("finance@almulhi.demo", (ctx) => financeService.returnOrder(ctx, order.id, "مرجع التحويل غير مطابق"));
      await act("sara@almulhi.demo", (ctx) => financeService.resolveReturn(ctx, order.id, "صُحّح المرجع")).catch(async () =>
        act("manager@almulhi.demo", (ctx) => financeService.resolveReturn(ctx, order.id, "صُحّح المرجع")));
      const st = await act("finance@almulhi.demo", (ctx) => financeService.getOrder(ctx, order.id));
      expect(st.status).toBe("ready");      // straight back to finance, not to the start of the chain
      const proof = await act("finance@almulhi.demo", (ctx) => orgService.storeFile(ctx, { name: "proof.pdf", mime: "application/pdf", body: new Uint8Array([1]), ownerOrgId: null }));
      await act("finance@almulhi.demo", (ctx) => financeService.execute(ctx, order.id, { proofFileId: proof, financeRef: "FIN-0091" }));
      await drain(db, adapters);
      expect(adapters.email.outbox.some((m) => m.to === "info@albir.example.sa" && m.subject.includes("صُرفت دفعة"))).toBe(true);
      const csv = await act("finance@almulhi.demo", (ctx) => financeService.exportOrdersCsv(ctx));
      expect(csv.csv).toContain("FIN-0091");
    });

    it("R-052 R-053 a deliverable is submitted, accepted in the specialist's name, and opens the next order", async () => {
      const d = await act("coord@albir.demo", (ctx) => ctx.tx.query<{ id: string; seq: number; installment_seq: number | null }>("select id, seq, installment_seq from project.deliverables where project_id = $1 order by seq", [projectId]));
      const target = d.find((x) => x.installment_seq) ?? d[0]!;
      const f = await act("coord@albir.demo", (ctx) => orgService.storeFile(ctx, { name: "تقرير.pdf", mime: "application/pdf", body: new Uint8Array([2]), ownerOrgId: albir }));
      await act("coord@albir.demo", (ctx) => projectService.submitDeliverable(ctx, target.id, { fileIds: [f], beneficiaries: 22, spentHalalas: 13_000_000, note: "" }));
      await drain(db, adapters);
      await expect(act("coord@albir.demo", (ctx) => ctx.tx.query("update project.deliverables set status = 'accepted', decided_by = auth.uid(), decided_at = now(), version = version + 1 where id = $1", [target.id]))).rejects.toThrow(/only staff/);
      const r = await act("manager@almulhi.demo", (ctx) => projectService.decideDeliverable(ctx, target.id, "accepted", ""));
      if (target.installment_seq) expect(r.orderId).toBeTruthy();
    });

    it("R-071 R-073 R-074 closure waits for the final report and the last installment, then closes with nothing unresolved", async () => {
      // pay any remaining non-final orders so only the final installment is left
      for (let i = 0; i < 3; i++) {
        const open = await act("finance@almulhi.demo", (ctx) => ctx.tx.query<{ id: string; status: string }>("select id, status from finance.disbursement_orders where project_id = $1 and status in ('in_approval','ready')", [projectId]));
        for (const o of open) {
          if (o.status === "in_approval") { const inst = await act("finance@almulhi.demo", (ctx) => approvalService.openInstanceFor(ctx, "disbursement", o.id)); await act("finance@almulhi.demo", (ctx) => approvalService.act(ctx, inst!.id, { kind: "approve" })); }
          const proof = await act("finance@almulhi.demo", (ctx) => orgService.storeFile(ctx, { name: "p.pdf", mime: "application/pdf", body: new Uint8Array([3]), ownerOrgId: null }));
          await act("finance@almulhi.demo", (ctx) => financeService.execute(ctx, o.id, { proofFileId: proof, financeRef: null }));
        }
      }
      const disbursed = await act("finance@almulhi.demo", (ctx) => ctx.tx.one<{ s: number }>("select coalesce(sum(amount_halalas),0)::bigint as s from finance.disbursement_orders where project_id = $1 and status = 'executed'", [projectId]));
      await act("owner@albir.demo", (ctx) => projectService.submitFinalReport(ctx, projectId, { narrative: "نُفذ المشروع وتجاوز المستهدف.", beneficiaries: 44, femaleBeneficiaries: 30, outputs: { trainees: 44 }, spentHalalas: Number(disbursed.s) - 1_000_000, unspentDisposition: null, fileIds: [] }));
      const r1 = await act("manager@almulhi.demo", (ctx) => projectService.decideFinalReport(ctx, projectId, { accept: true, note: "", rating: "أ" }));
      expect(r1.closed).toBe(false);
      expect(r1.blockers.join()).toMatch(/لم يُحسم مصيره|دفعات/);
      // finance pays the final installment; the unspent amount gets a disposition; then it closes.
      const final = await act("finance@almulhi.demo", (ctx) => ctx.tx.one<{ id: string; status: string }>("select o.id, o.status from finance.disbursement_orders o join finance.installments i on i.tenant_id = o.tenant_id and i.id = o.installment_id where i.project_id = $1 and i.condition = 'final_report'", [projectId]));
      const inst = await act("finance@almulhi.demo", (ctx) => approvalService.openInstanceFor(ctx, "disbursement", final.id));
      if (inst) await act("finance@almulhi.demo", (ctx) => approvalService.act(ctx, inst.id, { kind: "approve" }));
      const proof = await act("finance@almulhi.demo", (ctx) => orgService.storeFile(ctx, { name: "p.pdf", mime: "application/pdf", body: new Uint8Array([4]), ownerOrgId: null }));
      await act("finance@almulhi.demo", (ctx) => financeService.execute(ctx, final.id, { proofFileId: proof, financeRef: null }));
      await act("manager@almulhi.demo", (ctx) => ctx.tx.query("update project.final_reports set unspent_disposition = 'returned', version = version + 1 where project_id = $1", [projectId]));
      const r2 = await act("manager@almulhi.demo", (ctx) => projectService.tryClose(ctx, projectId));
      expect(r2).toEqual({ closed: true, blockers: [] });
    });

    it("R-095 the audit chain is intact after the whole cycle", async () => {
      const broken = await act("admin@almulhi.demo", (ctx) => ctx.tx.one<{ b: number | null }>("select kernel.verify_audit_chain(app.tenant()) as b"));
      expect(broken.b).toBeNull();
    });

    it("R-084 consumption is measured", async () => {
      await drain(db, adapters);
      const u = await act("admin@almulhi.demo", (ctx) => ctx.tx.query<{ kind: string }>("select kind from platform.usage_events"));
      expect(u.map((x) => x.kind)).toEqual(expect.arrayContaining(["application.submitted", "application.completed"]));
    });

    it("sweeps run cleanly on the resulting state", async () => {
      const r = await sys(tenant, (ctx) => sweeps.runAll(ctx));
      expect(r).toBeTruthy();
    });
  });
}
