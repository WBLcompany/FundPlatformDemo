import { randomUUID } from "node:crypto";
import { approval as approvalDomain, DomainError, finance, project, type Halalas } from "@wbl/domain";
import { AGREEMENT_TEMPLATE, fillTemplate } from "@wbl/adapters";
import { authorize, programOf, riyadhToday, versionConfig, type Ctx } from "./context";
import { getApplication, getStudyFile, transition } from "./cycle";
import { latestOutput, requestTask } from "./ai";
import { openInstance } from "./approval";
import { createOrderForInstallment } from "./finance";

export type ScheduleItem = { label: string; percent: number; condition: "signature" | "deliverable" | "final_report"; deliverable: string; due_offset_days: number };

const fmtMoney = (h: Halalas) => new Intl.NumberFormat("en-US").format(h / 100);
const hijri = (d: Date) => new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric" }).format(d);
const greg = (d: Date) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric" }).format(d);

/** The approved schedule: the specialist's (R-036) if set, else Manih's suggestion, else the documented default. */
export async function approvedSchedule(ctx: Ctx, applicationId: string, finalRule: { enabled: boolean; minPercent: number }): Promise<ScheduleItem[]> {
  const sf = await getStudyFile(ctx, applicationId);
  if (sf?.schedule?.length) return sf.schedule as unknown as ScheduleItem[];
  const ai = await latestOutput(ctx, applicationId, "application.study_file");
  const s = (ai?.output as { schedule?: ScheduleItem[] } | null)?.schedule;
  if (s?.length) return s;
  return finalRule.enabled
    ? [{ label: "الدفعة الأولى", percent: 100 - Math.max(10, finalRule.minPercent), condition: "signature", deliverable: "خطة التنفيذ", due_offset_days: 14 },
       { label: "الدفعة الختامية", percent: Math.max(10, finalRule.minPercent), condition: "final_report", deliverable: "التقرير الختامي", due_offset_days: 330 }]
    : [{ label: "دفعة واحدة", percent: 100, condition: "signature", deliverable: "خطة التنفيذ", due_offset_days: 14 }];
}

/** R-048: the agreement is generated from the template, filled with the approved data — no manual editing. */
export async function issueAgreement(ctx: Ctx, applicationId: string) {
  const app = await getApplication(ctx, applicationId);
  if (app.status !== "approved") throw new DomainError("not_approved");
  const ver = await versionConfig(ctx.tx, app.framework_version_id);
  const assoc = await ctx.tx.one<{ name: string; license_no: string }>("select name, license_no from org.associations where id = $1", [app.association_id]);
  const donor = await ctx.tx.one<{ name: string }>("select name from platform.donors where id = app.tenant()");
  const schedule = await approvedSchedule(ctx, applicationId, ver.config.settings.finalInstallment);
  const amount = app.approved_halalas ?? 0;
  const parts = finance.buildInstallments(amount, schedule.map((s) => ({ label: s.label, percent: s.percent, condition: s.condition })), ver.config.settings.finalInstallment);
  const ref = (await ctx.tx.one<{ next_ref: string }>("select cycle.next_ref('agreement', 'ات')")).next_ref;
  const table = `<table><tr><th>الدفعة</th><th>النسبة</th><th>المبلغ (ريال)</th><th>التسليم المرتبط</th><th>الموعد</th></tr>${schedule.map((s, i) => `<tr><td>${s.label}</td><td class="mono">${s.percent}%</td><td class="mono">${fmtMoney(parts[i]!.amountHalalas)}</td><td>${s.deliverable}</td><td>بعد ${s.due_offset_days} يوماً من التوقيع</td></tr>`).join("")}</table>`;
  const html = fillTemplate(AGREEMENT_TEMPLATE, {
    agreementRef: ref, issuedHijri: hijri(ctx.now), issuedGregorian: greg(ctx.now), donorName: donor.name, associationName: assoc.name, licenseNo: assoc.license_no,
    amount: fmtMoney(amount), projectTitle: app.title, applicationRef: app.ref ?? "", frameworkVersion: ver.number, scheduleTable: "__TABLE__",
  }).replace("__TABLE__", table);
  const doc = await ctx.adapters.docgen.render(html);
  const fileId = randomUUID();
  const key = `${ctx.actor.tenantId}/agreements/${fileId}.${doc.ext}`;
  await ctx.adapters.storage.put(key, doc.body, doc.mime);
  await ctx.tx.query("select kernel.system_file($1, $2, $3, $4, $5, $6, $7)", [fileId, key, `اتفاقية ${ref}.${doc.ext}`, doc.mime, doc.body.length, app.association_id, html.replace(/<[^>]+>/g, " ").slice(0, 20000)]);
  const agreementId = randomUUID();
  await ctx.tx.query(
    "insert into project.agreements (tenant_id, id, ref, application_id, version_no, terms, generated_file_id, status) values (app.tenant(), $1, $2, $3, 1, $4, $5, 'issued')",
    [agreementId, ref, applicationId, JSON.stringify({ amountHalalas: amount, schedule, frameworkVersion: ver.number }), fileId]);
  await transition(ctx, app, "agreement", {}, { type: "agreement.issued", entityKind: "application", entityId: applicationId, payload: { ref, agreement_id: agreementId, org_id: app.association_id } });
  return { agreementId, ref };
}

export async function getAgreement(ctx: Ctx, agreementId: string) {
  return ctx.tx.one<{ id: string; ref: string; application_id: string; version_no: number; terms: { amountHalalas: number; schedule: ScheduleItem[]; frameworkVersion: string }; generated_file_id: string | null; signed_file_id: string | null; association_signed_at: string | null; donor_signed_at: string | null; status: string; created_at: string }>(
    "select id, ref, application_id, version_no, terms, generated_file_id, signed_file_id, association_signed_at, donor_signed_at, status, created_at from project.agreements where id = $1", [agreementId]);
}

/** R-049: the signatory uploads the signed copy first; then the donor signs. */
export async function associationSign(ctx: Ctx, agreementId: string, signedFileId: string) {
  const ag = await getAgreement(ctx, agreementId);
  const app = await getApplication(ctx, ag.application_id);
  authorize(ctx, "agreement.sign_association", { orgId: app.association_id });
  if (ag.status !== "issued") throw new DomainError("bad_state", "الاتفاقية ليست بانتظار توقيع الجمعية");
  await ctx.tx.query("update project.agreements set signed_file_id = $2, association_signed_by = auth.uid(), association_signed_at = now(), status = 'association_signed' where id = $1", [agreementId, signedFileId]);
  await ctx.tx.emit({ type: "agreement.association_signed", entityKind: "application", entityId: app.id, payload: { ref: ag.ref, org_id: app.association_id } });
}

/** R-049 / R-050: the donor's signature completes it; the project, installments and deliverables follow automatically. */
export async function donorSign(ctx: Ctx, agreementId: string) {
  authorize(ctx, "agreement.sign_donor", {});
  const ag = await getAgreement(ctx, agreementId);
  if (ag.status !== "association_signed") throw new DomainError("association_first", "لا يوقّع المانح قبل توقيع الجمعية");
  await ctx.tx.query("update project.agreements set donor_signed_by = auth.uid(), donor_signed_at = now(), status = 'fully_signed' where id = $1", [agreementId]);
  if (ag.version_no > 1) return { projectId: null };     // an annex: the project already exists
  const app = await getApplication(ctx, ag.application_id);
  const ver = await versionConfig(ctx.tx, app.framework_version_id);
  const p = programOf(ver.config, app.program_id);
  const ref = (await ctx.tx.one<{ next_ref: string }>("select cycle.next_ref('project', 'م')")).next_ref;
  const projectId = randomUUID();
  await ctx.tx.query(
    `insert into project.projects (tenant_id, id, ref, application_id, association_id, current_agreement_id, program_id, framework_version_id, approved_halalas, waqf_category, specialist_membership_id)
     values (app.tenant(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [projectId, ref, app.id, app.association_id, agreementId, app.program_id, app.framework_version_id, ag.terms.amountHalalas, p.waqfCategory ?? null, app.assignee_membership_id]);
  const parts = finance.buildInstallments(ag.terms.amountHalalas, ag.terms.schedule.map((s) => ({ label: s.label, percent: s.percent, condition: s.condition })), ver.config.settings.finalInstallment);
  for (let i = 0; i < ag.terms.schedule.length; i++) {
    const s = ag.terms.schedule[i]!;
    await ctx.tx.query("insert into finance.installments (tenant_id, project_id, seq, label, amount_halalas, condition, deliverable_seq) values (app.tenant(), $1, $2, $3, $4, $5, $6)",
      [projectId, i + 1, s.label, parts[i]!.amountHalalas, s.condition, s.condition === "deliverable" ? i + 1 : null]);
    if (s.condition !== "final_report") {
      const due = new Date(ctx.now.getTime() + s.due_offset_days * 86400_000).toISOString().slice(0, 10);
      await ctx.tx.query("insert into project.deliverables (tenant_id, project_id, seq, label, due_date, installment_seq) values (app.tenant(), $1, $2, $3, $4, $5)",
        [projectId, i + 1, s.deliverable, due, s.condition === "deliverable" ? i + 1 : null]);
    }
  }
  await transition(ctx, app, "project", {}, { type: "agreement.fully_signed", entityKind: "application", entityId: app.id, payload: { ref: ag.ref, project: ref, project_id: projectId, org_id: app.association_id } });
  await ctx.tx.emit({ type: "project.created", entityKind: "project", entityId: projectId, payload: { ref, org_id: app.association_id } });
  // Installments due on signature open their order now (R-053 by analogy: the condition is met).
  const sig = await ctx.tx.query<{ id: string }>("select id from finance.installments where project_id = $1 and condition = 'signature' order by seq", [projectId]);
  for (const s of sig) await createOrderForInstallment(ctx, s.id);
  return { projectId, ref };
}

/* ── Deliverables (R-051–R-054) ── */

type DeliverableRow = { id: string; project_id: string; seq: number; label: string; due_date: string; installment_seq: number | null; status: project.DeliverableStatus; version: number; association_id: string; specialist_membership_id: string | null };
export async function getDeliverable(ctx: Ctx, id: string): Promise<DeliverableRow> {
  return ctx.tx.one<DeliverableRow>(
    `select d.id, d.project_id, d.seq, d.label, to_char(d.due_date, 'YYYY-MM-DD') as due_date, d.installment_seq, d.status, d.version, p.association_id, p.specialist_membership_id
       from project.deliverables d join project.projects p on p.tenant_id = d.tenant_id and p.id = d.project_id where d.id = $1`, [id]);
}

export async function submitDeliverable(ctx: Ctx, id: string, input: { fileIds: string[]; beneficiaries: number; spentHalalas: number; note: string }) {
  const d = await getDeliverable(ctx, id);
  authorize(ctx, "deliverable.submit", { orgId: d.association_id });
  project.assertDeliverableTransition(d.status, "submitted");
  if (!input.fileIds.length) throw new DomainError("files_required", "أرفق ملفات التسليم");
  const r = await ctx.tx.query("update project.deliverables set status = 'submitted', submission = $3, file_ids = $4, version = version + 1 where id = $1 and version = $2 returning id",
    [id, d.version, JSON.stringify({ beneficiaries: input.beneficiaries, spent_halalas: input.spentHalalas, note: input.note, at: ctx.now.toISOString() }), input.fileIds]);
  if (!r.length) throw new DomainError("stale_version");
  await ctx.tx.emit({ type: "deliverable.submitted", entityKind: "project", entityId: d.project_id, payload: { deliverable_id: id, label: d.label, org_id: d.association_id } });
  const files = await ctx.tx.query<{ id: string; name: string; text_content: string | null }>("select id, name, text_content from kernel.files where id = any($1)", [input.fileIds]);
  const ai = await requestTask(ctx, { task: "deliverable.review", subjectKind: "deliverable", subjectId: id, inputs: { requirement: d.label, submission: { beneficiaries: input.beneficiaries, spent_halalas: input.spentHalalas, note: input.note }, attachments: files.map((f) => ({ id: f.id, name: f.name, text: f.text_content })) } });
  if (ai.id) await ctx.tx.query("update project.deliverables set review_output_id = $2, version = version + 1 where id = $1", [id, ai.id]);
}

/** R-052 / R-053: a decision in the specialist's name; acceptance opens the linked installment's order. */
export async function decideDeliverable(ctx: Ctx, id: string, decision: "accepted" | "returned" | "rejected", note: string) {
  const d = await getDeliverable(ctx, id);
  authorize(ctx, "deliverable.decide", { assigneeMembershipId: d.specialist_membership_id });
  project.assertDeliverableTransition(d.status, decision);
  if (decision !== "accepted" && !note.trim()) throw new DomainError("note_required", "اكتب الملاحظات");
  const r = await ctx.tx.query("update project.deliverables set status = $3, decided_by = auth.uid(), decided_at = now(), decision_note = $4, version = version + 1 where id = $1 and version = $2 returning id",
    [id, d.version, decision, note || null]);
  if (!r.length) throw new DomainError("stale_version");
  await ctx.tx.emit({ type: `deliverable.${decision}` as "deliverable.accepted", entityKind: "project", entityId: d.project_id, payload: { deliverable_id: id, label: d.label, note, org_id: d.association_id } });
  if (decision === "accepted" && d.installment_seq) {
    const inst = await ctx.tx.maybe<{ id: string }>("select id from finance.installments where project_id = $1 and seq = $2 and status = 'scheduled'", [d.project_id, d.installment_seq]);
    if (inst) return { orderId: await createOrderForInstallment(ctx, inst.id) };
  }
  return { orderId: null };
}

/* ── Amendments (R-055–R-059) ── */

export async function requestAmendment(ctx: Ctx, projectId: string, input: { justification: string; amountHalalas?: number; deliverables?: Array<{ label: string; dueDate: string }> }) {
  const pr = await ctx.tx.one<{ association_id: string; specialist_membership_id: string | null; approved_halalas: number; framework_version_id: string; program_id: string; current_agreement_id: string }>(
    "select association_id, specialist_membership_id, approved_halalas, framework_version_id, program_id, current_agreement_id from project.projects where id = $1", [projectId]);
  authorize(ctx, "amendment.request", { orgId: pr.association_id, assigneeMembershipId: pr.specialist_membership_id });
  if (!input.justification.trim()) throw new DomainError("justification_required", "المبرر إلزامي");
  const side = ctx.actor.grants.some((g) => g.orgId === pr.association_id) ? "association" : "donor";
  const id = randomUUID();
  const changes = { amountHalalas: input.amountHalalas, deliverables: input.deliverables };
  await ctx.tx.query("insert into project.amendments (tenant_id, id, project_id, requested_by, requested_side, justification, changes) values (app.tenant(), $1, $2, auth.uid(), $3, $4, $5)",
    [id, projectId, side, input.justification, JSON.stringify(changes)]);
  const current = await ctx.tx.query<{ label: string; due_date: string }>("select label, to_char(due_date,'YYYY-MM-DD') as due_date from project.deliverables where project_id = $1 order by seq", [projectId]);
  const literal = project.literalDiff({ amountHalalas: pr.approved_halalas, schedule: [], deliverables: current.map((c) => ({ label: c.label, dueDate: c.due_date })) }, changes);
  const ai = await requestTask(ctx, { task: "amendment.diff", subjectKind: "amendment", subjectId: id, frameworkVersionId: pr.framework_version_id, inputs: { literal, justification: input.justification, approved_halalas: pr.approved_halalas, changes } });
  if (ai.id) await ctx.tx.query("update project.amendments set diff_output_id = $2, version = version + 1 where id = $1", [id, ai.id]);
  // R-057: the original chain; a higher amount tier adds its levels. A donor-side request enters it now;
  // an association's request waits for the specialist to forward it with the diff in hand.
  let levels: string[] = [];
  if (side === "donor") levels = await forwardAmendment(ctx, id);
  await ctx.tx.emit({ type: "amendment.requested", entityKind: "project", entityId: projectId, payload: { amendment_id: id, org_id: pr.association_id, literal } });
  return { amendmentId: id, literal, levels };
}

export async function forwardAmendment(ctx: Ctx, amendmentId: string): Promise<string[]> {
  const am = await ctx.tx.one<{ project_id: string; status: string; changes: { amountHalalas?: number } }>("select project_id, status, changes from project.amendments where id = $1", [amendmentId]);
  const pr = await ctx.tx.one<{ specialist_membership_id: string | null; approved_halalas: number; framework_version_id: string; program_id: string }>(
    "select specialist_membership_id, approved_halalas, framework_version_id, program_id from project.projects where id = $1", [am.project_id]);
  authorize(ctx, "deliverable.decide", { assigneeMembershipId: pr.specialist_membership_id });
  if (am.status !== "submitted") throw new DomainError("bad_state");
  const ver = await versionConfig(ctx.tx, pr.framework_version_id);
  const chain = ver.config.approvalChains.find((c) => c.id === programOf(ver.config, pr.program_id).approvalChainId)!;
  const amount = am.changes.amountHalalas ?? pr.approved_halalas;
  await openInstance(ctx, "amendment", amendmentId, chain, { amountHalalas: amount }, pr.framework_version_id);
  await ctx.tx.query("update project.amendments set status = 'in_approval', version = version + 1 where id = $1", [amendmentId]);
  return approvalDomain.applicableLevels(chain, { amountHalalas: amount }).map((l) => l.label);
}

export async function onAmendmentApproval(ctx: Ctx, amendmentId: string, outcome: "approved" | "rejected" | "returned") {
  const am = await ctx.tx.one<{ id: string; project_id: string; requested_side: "association" | "donor"; version: number; status: project.AmendmentStatus }>(
    "select id, project_id, requested_side, version, status from project.amendments where id = $1", [amendmentId]);
  if (outcome !== "approved") {
    await ctx.tx.query("update project.amendments set status = 'rejected', decided_at = now(), version = version + 1 where id = $1", [amendmentId]);
    await ctx.tx.emit({ type: "amendment.decided", entityKind: "project", entityId: am.project_id, payload: { amendment_id: amendmentId, decision: "لم يُعتمد" } });
    return;
  }
  const next = project.afterApproval(am.requested_side);
  if (next === "awaiting_signatory") {
    const pr = await ctx.tx.one<{ framework_version_id: string }>("select framework_version_id from project.projects where id = $1", [am.project_id]);
    const days = (await versionConfig(ctx.tx, pr.framework_version_id)).config.settings.sla.signatoryResponseDays;
    await ctx.tx.query("update project.amendments set status = 'awaiting_signatory', signatory_due_at = now() + make_interval(days => $2), version = version + 1 where id = $1", [amendmentId, days]);
    return;
  }
  await applyAmendment(ctx, amendmentId);
}

/** R-058: the association signatory accepts or declines a donor-initiated amendment. */
export async function signatoryRespond(ctx: Ctx, amendmentId: string, accept: boolean) {
  const am = await ctx.tx.one<{ project_id: string; status: string; association_id: string }>(
    "select a.project_id, a.status, p.association_id from project.amendments a join project.projects p on p.tenant_id = a.tenant_id and p.id = a.project_id where a.id = $1", [amendmentId]);
  authorize(ctx, "agreement.sign_association", { orgId: am.association_id });
  if (am.status !== "awaiting_signatory") throw new DomainError("bad_state");
  if (!accept) {
    await ctx.tx.query("update project.amendments set status = 'rejected', signatory_response = 'declined', decided_at = now(), version = version + 1 where id = $1", [amendmentId]);
    await ctx.tx.emit({ type: "amendment.decided", entityKind: "project", entityId: am.project_id, payload: { amendment_id: amendmentId, decision: "رفضه صاحب الصلاحية" } });
    return;
  }
  await ctx.tx.query("update project.amendments set signatory_response = 'accepted' where id = $1", [amendmentId]);
  await applyAmendment(ctx, amendmentId);
}

/** R-059: an approved amendment becomes an annex (a new agreement version); the project moves to it. */
async function applyAmendment(ctx: Ctx, amendmentId: string) {
  const am = await ctx.tx.one<{ project_id: string; changes: { amountHalalas?: number; deliverables?: Array<{ label: string; dueDate: string }> } }>("select project_id, changes from project.amendments where id = $1", [amendmentId]);
  const pr = await ctx.tx.one<{ application_id: string; current_agreement_id: string; approved_halalas: number; version: number }>("select application_id, current_agreement_id, approved_halalas, version from project.projects where id = $1", [am.project_id]);
  const cur = await getAgreement(ctx, pr.current_agreement_id);
  const nextNo = cur.version_no + 1;
  const newId = randomUUID();
  const terms = { ...cur.terms, amountHalalas: am.changes.amountHalalas ?? cur.terms.amountHalalas, amendmentId };
  await ctx.tx.query(
    "insert into project.agreements (tenant_id, id, ref, application_id, version_no, amendment_id, terms, status, association_signed_at, donor_signed_at) values (app.tenant(), $1, $2, $3, $4, $5, $6, 'fully_signed', now(), now())",
    [newId, `${cur.ref}-${nextNo}`, pr.application_id, nextNo, amendmentId, JSON.stringify(terms)]);
  await ctx.tx.query("update project.agreements set status = 'superseded' where id = $1", [cur.id]);
  await ctx.tx.query("update project.projects set current_agreement_id = $2, approved_halalas = $3, version = version + 1 where id = $1", [am.project_id, newId, terms.amountHalalas]);
  for (const d of am.changes.deliverables ?? []) {
    await ctx.tx.query("update project.deliverables set due_date = $3, version = version + 1 where project_id = $1 and label = $2 and status in ('pending','returned')", [am.project_id, d.label, d.dueDate]);
  }
  await ctx.tx.query("update project.amendments set status = 'approved', decided_at = now(), version = version + 1 where id = $1", [amendmentId]);
  await ctx.tx.emit({ type: "amendment.decided", entityKind: "project", entityId: am.project_id, payload: { amendment_id: amendmentId, decision: "اعتُمد وصدر ملحق الاتفاقية" } });
}

/* ── Closure (R-071–R-075) ── */

export async function submitFinalReport(ctx: Ctx, projectId: string, input: { narrative: string; beneficiaries: number; femaleBeneficiaries?: number | null; outputs: Record<string, number>; spentHalalas: number; unspentDisposition?: "returned" | "reallocated" | "waived" | null; fileIds: string[] }) {
  const pr = await ctx.tx.one<{ association_id: string; approved_halalas: number; status: project.ProjectStatus; version: number; framework_version_id: string }>(
    "select association_id, approved_halalas, status, version, framework_version_id from project.projects where id = $1", [projectId]);
  authorize(ctx, "final_report.submit", { orgId: pr.association_id });
  if (!input.narrative.trim()) throw new DomainError("narrative_required", "اكتب التقرير السردي");
  const disbursed = (await ctx.tx.one<{ s: number }>("select coalesce(sum(amount_halalas),0)::bigint as s from finance.disbursement_orders where project_id = $1 and status = 'executed'", [projectId])).s;
  const unspent = Math.max(0, disbursed - input.spentHalalas);
  await ctx.tx.query(
    `insert into project.final_reports (tenant_id, project_id, narrative, beneficiaries, female_beneficiaries, outputs, spent_halalas, unspent_disposition, unspent_halalas, status)
     values (app.tenant(), $1, $2, $3, $4, $5, $6, $7, $8, 'submitted')
     on conflict (tenant_id, project_id) do update set narrative = excluded.narrative, beneficiaries = excluded.beneficiaries, female_beneficiaries = excluded.female_beneficiaries,
       outputs = excluded.outputs, spent_halalas = excluded.spent_halalas, unspent_disposition = excluded.unspent_disposition, unspent_halalas = excluded.unspent_halalas, status = 'submitted', version = project.final_reports.version + 1`,
    [projectId, input.narrative, input.beneficiaries, input.femaleBeneficiaries ?? null, JSON.stringify(input.outputs), input.spentHalalas, input.unspentDisposition ?? null, unspent]);
  await ctx.tx.emit({ type: "final_report.submitted", entityKind: "project", entityId: projectId, payload: { org_id: pr.association_id } });
  const ai = await requestTask(ctx, { task: "final_report.review", subjectKind: "final_report", subjectId: projectId, inputs: { narrative: input.narrative, beneficiaries: input.beneficiaries, spent_halalas: input.spentHalalas, budget_halalas: pr.approved_halalas } });
  return { ai, unspent };
}

/** R-072–R-075: accept the final report; the final installment opens (R-074); the project closes only with nothing unresolved (R-073). */
export async function decideFinalReport(ctx: Ctx, projectId: string, input: { accept: boolean; note: string; rating?: string | null; ratingNote?: string | null }) {
  const pr = await ctx.tx.one<{ association_id: string; approved_halalas: number; status: project.ProjectStatus; version: number; specialist_membership_id: string | null }>(
    "select association_id, approved_halalas, status, version, specialist_membership_id from project.projects where id = $1", [projectId]);
  authorize(ctx, "final_report.decide", { assigneeMembershipId: pr.specialist_membership_id });
  if (!input.accept) {
    if (!input.note.trim()) throw new DomainError("note_required");
    await ctx.tx.query("update project.final_reports set status = 'returned', decided_by = auth.uid(), decided_at = now(), version = version + 1 where project_id = $1", [projectId]);
    await ctx.tx.emit({ type: "final_report.decided", entityKind: "project", entityId: projectId, payload: { accepted: false, note: input.note, org_id: pr.association_id } });
    return { closed: false, blockers: [] as string[] };
  }
  await ctx.tx.query("update project.final_reports set status = 'accepted', decided_by = auth.uid(), decided_at = now(), performance_rating = $2, performance_note = $3, version = version + 1 where project_id = $1",
    [projectId, input.rating ?? null, input.ratingNote ?? null]);
  await ctx.tx.emit({ type: "final_report.decided", entityKind: "project", entityId: projectId, payload: { accepted: true, org_id: pr.association_id } });
  // Accepting the final report starts closing (staff write; the association cannot move a project).
  if (pr.status === "active") await ctx.tx.query("update project.projects set status = 'closing', version = version + 1 where id = $1 and version = $2", [projectId, pr.version]);
  const finalInst = await ctx.tx.maybe<{ id: string }>("select id from finance.installments where project_id = $1 and condition = 'final_report' and status = 'scheduled'", [projectId]);
  if (finalInst) await createOrderForInstallment(ctx, finalInst.id);
  return tryClose(ctx, projectId);
}

/** R-073: what still stands between a project and closure (read-only; the project page shows it). */
export async function closureBlockers(ctx: Ctx, projectId: string) {
  const pr = await ctx.tx.one<{ approved_halalas: number; status: project.ProjectStatus; version: number; association_id: string }>("select approved_halalas, status, version, association_id from project.projects where id = $1", [projectId]);
  const fr = await ctx.tx.maybe<{ spent_halalas: number; unspent_disposition: string | null; status: string }>("select spent_halalas, unspent_disposition, status from project.final_reports where project_id = $1", [projectId]);
  const disbursed = (await ctx.tx.one<{ s: number }>("select coalesce(sum(amount_halalas),0)::bigint as s from finance.disbursement_orders where project_id = $1 and status = 'executed'", [projectId])).s;
  const openInst = (await ctx.tx.one<{ n: number }>("select count(*)::int as n from finance.installments where project_id = $1 and status not in ('paid','cancelled')", [projectId])).n;
  const blockers = fr?.status !== "accepted" ? ["التقرير الختامي لم يُقبل"] : finance.closureCheck(pr.approved_halalas, disbursed, fr.spent_halalas, fr.unspent_disposition);
  if (openInst > 0) blockers.push(`${openInst} دفعات لم تُحسم`);
  return { pr, blockers };
}

/** R-073: closes when every installment is paid or cancelled and any unspent amount has a disposition. */
export async function tryClose(ctx: Ctx, projectId: string) {
  const { pr, blockers } = await closureBlockers(ctx, projectId);
  if (blockers.length || pr.status !== "closing") return { closed: false, blockers };
  await ctx.tx.query("update project.projects set status = 'closed', closed_at = now(), version = version + 1 where id = $1 and version = $2", [projectId, pr.version]);
  await ctx.tx.emit({ type: "project.closed", entityKind: "project", entityId: projectId, payload: { org_id: pr.association_id } });
  return { closed: true, blockers: [] };
}

export async function proposePerformance(ctx: Ctx, projectId: string) {
  const facts = await ctx.tx.one("select (select count(*) from project.deliverables where project_id = $1 and status = 'accepted') as accepted, (select count(*) from project.deliverables where project_id = $1 and escalated_at is not null) as late", [projectId]);
  return requestTask(ctx, { task: "performance.propose", subjectKind: "project", subjectId: projectId, inputs: { facts, today: riyadhToday(ctx.now) } });
}
