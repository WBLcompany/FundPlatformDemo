import { cycle, DomainError, framework, iam } from "@wbl/domain";
import { authorize, currentVersion, riyadhToday, type Ctx } from "./context";
import { requestTask } from "./ai";

/** G1–G4, R-001–R-006, R-087: the editable draft, its validation, and freezing it into a version. */
/** The draft is read by whoever edits it and by whoever approves it (R-087: the approver sees what they approve). */
export async function getDraft(ctx: Ctx) {
  if (!iam.can(ctx.actor, "framework.approve", { tenantId: ctx.actor.tenantId })) authorize(ctx, "framework.edit", {});
  const d = await ctx.tx.maybe<{ id: string; config: framework.FrameworkConfig; revision: number; base_version_id: string | null; updated_at: string }>(
    "select id, config, revision, base_version_id, updated_at from framework.drafts");
  if (d) return d;
  const cur = await ctx.tx.maybe<{ id: string; snapshot: framework.FrameworkConfig }>("select id, snapshot from framework.current_version");
  const config = cur?.snapshot ?? framework.defaultConfig((await ctx.tx.one<{ name: string }>("select name from platform.donors where id = app.tenant()")).name);
  return ctx.tx.one<{ id: string; config: framework.FrameworkConfig; revision: number; base_version_id: string | null; updated_at: string }>(
    "insert into framework.drafts (tenant_id, config, base_version_id, updated_by) values (app.tenant(), $1, $2, auth.uid()) returning id, config, revision, base_version_id, updated_at",
    [JSON.stringify(config), cur?.id ?? null]);
}

export async function saveDraft(ctx: Ctx, config: unknown, expectedRevision: number) {
  authorize(ctx, "framework.edit", {});
  const v = framework.validateConfig(config);
  // A draft may be saved while invalid — it is a draft — but the errors travel with it.
  const r = await ctx.tx.query<{ revision: number }>(
    "update framework.drafts set config = $1, revision = revision + 1, updated_by = auth.uid(), updated_at = now() where revision = $2 returning revision",
    [JSON.stringify(config), expectedRevision]);
  if (!r.length) throw new DomainError("stale_version", "عدّل شخص آخر المسودة. أعد تحميلها.");
  return { revision: r[0]!.revision, errors: v.ok ? [] : v.errors };
}

/** R-005 + R-087: a person approves; the draft is frozen into an immutable snapshot with a readable number. */
export async function approveDraft(ctx: Ctx, reason: string) {
  authorize(ctx, "framework.approve", {});
  if (!reason.trim()) throw new DomainError("reason_required", "سبب الاعتماد مطلوب");
  const d = await ctx.tx.one<{ config: framework.FrameworkConfig }>("select config from framework.drafts for update");
  const v = framework.validateConfig(d.config);
  if (!v.ok) throw new DomainError("invalid_config", "الإعدادات غير مكتملة", v.errors);
  const prev = await ctx.tx.maybe<{ snapshot: framework.FrameworkConfig }>("select snapshot from framework.current_version");
  const numbers = (await ctx.tx.query<{ number: string }>("select number from framework.versions")).map((x) => x.number);
  const year = Number(riyadhToday(ctx.now).slice(0, 4));
  const number = framework.nextVersionNumber(numbers, year);
  const changes = framework.diffConfigs(prev?.snapshot ?? null, v.config);
  if (prev && changes.length === 0) throw new DomainError("no_changes", "لا تغييرات عن النسخة السارية");
  const row = await ctx.tx.one<{ id: string }>(
    "insert into framework.versions (tenant_id, number, snapshot, snapshot_hash, reason, changes, approved_by) values (app.tenant(), $1, $2, $3, $4, $5, auth.uid()) returning id",
    [number, JSON.stringify(v.config), framework.snapshotHash(v.config), reason, JSON.stringify(changes)]);
  await ctx.tx.query("update framework.drafts set base_version_id = $1", [row.id]);
  await ctx.tx.emit({ type: "framework.version_approved", entityKind: "framework_version", entityId: row.id, payload: { number, changes } });
  return { id: row.id, number, changes };
}

export async function listVersions(ctx: Ctx) {
  return ctx.tx.query<{ id: string; number: string; reason: string; changes: string[]; approved_at: string; approved_by_name: string }>(
    `select v.id, v.number, v.reason, v.changes, v.approved_at, p.full_name as approved_by_name
       from framework.versions v left join iam.persons p on p.id = v.approved_by order by v.approved_at desc`);
}

/** R-006 / N-14: onboarding checklist. Opening applications is blocked while a required step is missing. */
export async function setupChecklist(ctx: Ctx) {
  const cur = await ctx.tx.maybe<{ snapshot: framework.FrameworkConfig }>("select snapshot from framework.current_version");
  const policy = await ctx.tx.maybe<{ status: string }>("select status from framework.policies order by created_at desc limit 1");
  const staff = await ctx.tx.query<{ role: string }>("select distinct role from iam.memberships where org_id is null and active");
  const roles = new Set(staff.map((s) => s.role));
  const draft = await ctx.tx.maybe<{ config: unknown }>("select config from framework.drafts");
  const draftValid = draft ? framework.validateConfig(draft.config) : null;
  return [
    { key: "identity", label: "هوية المانح", done: !!cur?.snapshot.identity.displayName, required: true, href: "/staff/settings/framework" },
    { key: "policy", label: "سياسة المنح المعتمدة", done: policy?.status === "approved", required: false, href: "/staff/settings/policy" },
    { key: "framework", label: "نسخة إطار معتمدة (البرامج والمعايير والأهلية والسلاسل)", done: !!cur, required: true, href: "/staff/settings/framework" },
    { key: "draft", label: "المسودة الحالية صالحة للاعتماد", done: !!draftValid?.ok, required: false, href: "/staff/settings/framework" },
    { key: "specialists", label: "أخصائي منح واحد على الأقل", done: roles.has("grants_specialist"), required: true, href: "/staff/settings/users" },
    { key: "finance", label: "مستخدم مالية", done: roles.has("finance"), required: true, href: "/staff/settings/users" },
    { key: "chain", label: "كل مستوى في السلاسل له من يشغله", done: !!cur && cur.snapshot.approvalChains.every((c) => c.levels.every((l) => roles.has(l.role))), required: true, href: "/staff/settings/users" },
  ];
}
export async function applicationsOpenAllowed(ctx: Ctx) {
  return (await setupChecklist(ctx)).every((s) => !s.required || s.done);
}

/** R-003: policy draft from the donor's files (Manih). The manual path is uploading a policy text. */
export async function requestPolicyDraft(ctx: Ctx, fileIds: string[], answers: Record<string, string>) {
  authorize(ctx, "framework.edit", {});
  const files = await ctx.tx.query<{ id: string; name: string; text_content: string | null }>("select id, name, text_content from kernel.files where id = any($1)", [fileIds]);
  const policy = await ctx.tx.one<{ id: string }>("insert into framework.policies (tenant_id, source_file_ids) values (app.tenant(), $1) returning id", [fileIds]);
  const ai = await requestTask(ctx, { task: "policy.draft", subjectKind: "policy", subjectId: policy.id, inputs: { attachments: files.map((f) => ({ id: f.id, name: f.name, text: f.text_content })), answers } });
  if (ai.id) await ctx.tx.query("update framework.policies set ai_output_id = $2 where id = $1", [policy.id, ai.id]);
  return { policyId: policy.id, ai };
}

export async function savePolicyClauses(ctx: Ctx, policyId: string, clauses: Array<{ text: string; source: string | null }>) {
  authorize(ctx, "framework.edit", {});
  await ctx.tx.query("update framework.policies set clauses = $2 where id = $1 and status = 'draft'", [policyId, JSON.stringify(clauses)]);
}

export async function approvePolicy(ctx: Ctx, policyId: string) {
  authorize(ctx, "framework.approve", {});
  const p = await ctx.tx.one<{ clauses: unknown[] }>("select clauses from framework.policies where id = $1", [policyId]);
  if (!p.clauses.length) throw new DomainError("empty_policy", "السياسة بلا بنود");
  await ctx.tx.query("update framework.policies set status = 'superseded' where status = 'approved'");
  await ctx.tx.query("update framework.policies set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = $1", [policyId]);
  await ctx.tx.emit({ type: "policy.approved", entityKind: "policy", entityId: policyId });
}

/** R-004: derive draft settings from the approved policy (Manih), merged into the draft — still needs approval (R-005). */
export async function requestDerivedConfig(ctx: Ctx) {
  authorize(ctx, "framework.edit", {});
  const p = await ctx.tx.maybe<{ id: string; clauses: unknown }>("select id, clauses from framework.policies where status = 'approved' order by approved_at desc limit 1");
  if (!p) throw new DomainError("no_policy", "اعتمد السياسة أولاً");
  const draft = await getDraft(ctx);
  return requestTask(ctx, { task: "policy.derive_config", subjectKind: "policy", subjectId: p.id, inputs: { clauses: p.clauses, current: draft.config } });
}

/** R-004: the derived eligibility table is simulated against past decisions before approval. */
export async function simulateDraft(ctx: Ctx) {
  const draft = await getDraft(ctx);
  const v = framework.validateConfig(draft.config);
  if (!v.ok) return { evaluated: 0, refused: 0, matchedDecision: 0, errors: v.errors };
  const apps = await ctx.tx.query<{ program_id: string; requested_halalas: number; decision: string | null }>(
    "select program_id, requested_halalas, decision from cycle.applications where status <> 'draft' and requested_halalas is not null limit 500");
  let refused = 0, matched = 0;
  for (const a of apps) {
    const p = v.config.programs.find((x) => x.id === a.program_id);
    if (!p) continue;
    const verdict = cycle.checkEligibility(p, {
      association: { ready: true, openApplicationsInProgram: 0, licenseValid: true, overdueObligations: 0 },
      application: { requestedHalalas: a.requested_halalas }, program: { capHalalas: p.capHalalas, isOpen: true, id: p.id } });
    if (!verdict.pass) refused++;
    if (!verdict.pass === (a.decision === "rejected")) matched++;
  }
  return { evaluated: apps.length, refused, matchedDecision: matched, errors: [] };
}

export { currentVersion };
