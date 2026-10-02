import { createHash, randomUUID } from "node:crypto";
import { manih } from "@wbl/adapters";
import { framework } from "@wbl/domain";
import type { Ctx } from "./context";
import { donor } from "./context";

/**
 * Requesting and settling Manih tasks (docs/02-ai-layer.md, docs/manih-contract.md).
 * The AI never changes an entity's state (invariant 8): everything here writes
 * cycle.ai_outputs / cycle.ai_sealed and emits events; a person acts next.
 */
export type AiRequest = {
  task: manih.TaskType;
  subjectKind: string;
  subjectId: string;
  inputs: Record<string, unknown>;
  names?: string[];                 // personal names to mask (R-112)
  frameworkVersionId?: string | null;
};
export type AiStatus = { id: string; status: "pending" | "ready" | "failed" | "disabled" };

const hash = (v: unknown) => createHash("sha256").update(framework.canonical(v)).digest("hex");

export async function aiEnabled(ctx: Ctx): Promise<boolean> {
  return (await donor(ctx.tx)).ai_enabled;
}

/** Async task: stored pending, submitted to Manih by the worker (consumer `manih_submit`). Idempotent per input. */
export async function requestTask(ctx: Ctx, req: AiRequest): Promise<AiStatus> {
  if (!(await aiEnabled(ctx))) return { id: "", status: "disabled" };
  const { value, map } = manih.redactDeep(req.inputs, req.names ?? []);
  const inputHash = hash({ task: req.task, subject: req.subjectId, value });
  const key = `${ctx.actor.tenantId}:${req.task}:${req.subjectId}:${inputHash.slice(0, 24)}`;
  const existing = await ctx.tx.maybe<{ id: string; status: AiStatus["status"] }>("select id, status from cycle.ai_outputs where idempotency_key = $1", [key]);
  if (existing) return existing;
  // The id is generated here, not RETURNed: the requester may not be allowed to read the row back (RLS).
  const row = { id: randomUUID() };
  await ctx.tx.query(
    `insert into cycle.ai_outputs (tenant_id, id, task, schema_version, subject_kind, subject_id, status, idempotency_key, framework_version_id, input_hash, inputs_redacted, redaction_map, requested_by)
     values (app.tenant(), $11, $1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10)`,
    [req.task, manih.SCHEMA_VERSION, req.subjectKind, req.subjectId, key, req.frameworkVersionId ?? null, inputHash, JSON.stringify(value), JSON.stringify(map), ctx.system ? null : ctx.actor.personId, row.id],
  );
  await ctx.tx.emit({ type: "ai.task_requested", entityKind: req.subjectKind, entityId: req.subjectId, payload: { ai_output_id: row.id, task: req.task } });
  return { id: row.id, status: "pending" };
}

/** Sync task (10s, fails quietly, §3): document.extract, entity.brief, query.interpret. Settled in the same call. */
export async function runSyncTask<T extends manih.TaskType>(ctx: Ctx, req: AiRequest & { task: T }): Promise<{ id: string; status: "ready" | "failed" | "disabled"; output: manih.TaskOutput<T> | null }> {
  if (!(await aiEnabled(ctx))) return { id: "", status: "disabled", output: null };
  const { value, map } = manih.redactDeep(req.inputs, req.names ?? []);
  const inputHash = hash({ task: req.task, subject: req.subjectId, value });
  const key = `${ctx.actor.tenantId}:${req.task}:${req.subjectId}:${inputHash.slice(0, 24)}:${ctx.now.getTime()}`;
  const started = Date.now();
  const out = await ctx.adapters.manih.runSync(req.task, ctx.actor.tenantId, value);
  const restored = out ? manih.restore(out, map) : null;
  const row = await ctx.tx.one<{ id: string }>(
    `insert into cycle.ai_outputs (tenant_id, task, schema_version, subject_kind, subject_id, status, idempotency_key, framework_version_id, input_hash, requested_by, output, error, latency_ms, model, settled_at)
     values (app.tenant(), $1, $2, $3, $4, 'pending', $5, $6, $7, $8, null, null, null, null, null) returning id`,
    [req.task, manih.SCHEMA_VERSION, req.subjectKind, req.subjectId, key, req.frameworkVersionId ?? null, inputHash, ctx.system ? null : ctx.actor.personId],
  );
  await ctx.tx.query(
    "update cycle.ai_outputs set status = $2, output = $3, error = $4, latency_ms = $5, model = $6, settled_at = now() where id = $1",
    [row.id, restored ? "ready" : "failed", restored ? JSON.stringify(restored) : null, restored ? null : "لم يصل رد مانح خلال المهلة", Date.now() - started, ctx.adapters.manih.name],
  );
  return { id: row.id, status: restored ? "ready" : "failed", output: restored };
}

/** Worker: submits a pending async task to Manih. */
export async function submitPending(ctx: Ctx, aiOutputId: string): Promise<void> {
  const o = await ctx.tx.maybe<{ id: string; task: manih.TaskType; status: string; idempotency_key: string; framework_version_id: string | null; attempts: number }>(
    "select id, task, status, idempotency_key, framework_version_id, attempts from cycle.ai_outputs where id = $1", [aiOutputId]);
  if (!o || o.status !== "pending") return;
  const payload = await ctx.tx.one<{ inputs: Record<string, unknown> }>("select inputs from cycle.ai_task_payload($1)", [aiOutputId]);
  const { task_id } = await ctx.adapters.manih.submit({
    task_type: o.task, schema_version: manih.SCHEMA_VERSION, tenant_ref: ctx.actor.tenantId, framework_version_ref: o.framework_version_id,
    inputs: payload.inputs, idempotency_key: o.idempotency_key, callback_url: `${ctx.env.appUrl}/api/hooks/manih`,
  });
  // The mock may already have delivered (and settled) synchronously; only record the task id while still pending.
  await ctx.tx.query("update cycle.ai_outputs set manih_task_id = coalesce(manih_task_id, $2), attempts = attempts + 1 where id = $1 and status = 'pending'", [aiOutputId, task_id]);
}

/**
 * Webhook (or polling fallback): settles one result. Replays are harmless —
 * only a pending row can be settled (cycle.ai_output_immutable). An output
 * that does not match its schema is retried once, then marked «تعذّر».
 */
export async function settleResult(ctx: Ctx, result: manih.TaskResult): Promise<"settled" | "retry" | "ignored"> {
  const o = await ctx.tx.maybe<{ id: string; task: manih.TaskType; status: string; subject_kind: string; subject_id: string; attempts: number }>(
    "select id, task, status, subject_kind, subject_id, attempts from cycle.ai_outputs where idempotency_key = $1 for update", [result.idempotency_key]);
  if (!o || o.status !== "pending" || o.task !== result.task_type) return "ignored";
  const { redaction_map } = await ctx.tx.one<{ redaction_map: Record<string, string> | null }>("select redaction_map from cycle.ai_task_payload($1)", [o.id]);
  const map = redaction_map ?? {};
  if (result.status === "failed") {
    await finish(ctx, o.id, "failed", null, result.error ?? "تعذّر على مانح إكمال المهمة", result);
    return "settled";
  }
  const parsed = manih.parseOutput(o.task, result.output);
  if (!parsed.ok) {
    if (o.attempts < 2) {
      // Retry once with a fresh key so Manih does not dedupe it back to the bad result.
      await ctx.tx.query("update cycle.ai_outputs set idempotency_key = idempotency_key || ':r', manih_task_id = null where id = $1", [o.id]);
      await ctx.tx.emit({ type: "ai.task_requested", entityKind: o.subject_kind, entityId: o.subject_id, payload: { ai_output_id: o.id, task: o.task, retry: true } });
      return "retry";
    }
    await finish(ctx, o.id, "failed", null, `نتيجة غير مطابقة للمخطط: ${parsed.error}`, result);
    return "settled";
  }
  const value = manih.restore(parsed.value, map) as manih.TaskOutput<typeof o.task>;
  if (o.task === "application.study_file") {
    const { open, sealed } = manih.splitStudyFile(value as manih.TaskOutput<"application.study_file">);
    await finish(ctx, o.id, "ready", open, null, result);
    await ctx.tx.query("insert into cycle.ai_sealed (tenant_id, ai_output_id, application_id, payload) values (app.tenant(), $1, $2, $3)", [o.id, o.subject_id, JSON.stringify(sealed)]);
    await ctx.tx.emit({ type: "study_file.ready", entityKind: "application", entityId: o.subject_id, payload: { ai_output_id: o.id } });
  } else {
    await finish(ctx, o.id, "ready", value, null, result);
  }
  return "settled";
}

async function finish(ctx: Ctx, id: string, status: "ready" | "failed", output: unknown, error: string | null, r: manih.TaskResult) {
  await ctx.tx.query(
    `update cycle.ai_outputs set status = $2, output = $3, error = $4, model = $5, package_version = $6, cost_usd = $7, latency_ms = $8, manih_task_id = coalesce(manih_task_id, $9), settled_at = now() where id = $1`,
    [id, status, output === null ? null : JSON.stringify(output), error, r.model ?? null, r.package_version ?? null, r.cost_usd ?? null, r.latency_ms ?? null, r.task_id],
  );
  await ctx.tx.emit({ type: "ai.task_settled", entityKind: "ai_output", entityId: id, payload: { status, task: r.task_type } });
  await ctx.tx.query("insert into platform.usage_events (tenant_id, kind, ref_id) values (app.tenant(), 'ai.task', $1) on conflict do nothing", [id]);
}

/** The latest output of a task for a subject, with the sealed part when RLS allows it. */
export async function latestOutput(ctx: Ctx, subjectId: string, task: manih.TaskType) {
  return ctx.tx.maybe<{ id: string; status: string; output: Record<string, unknown> | null; error: string | null; created_at: string; sealed: Record<string, unknown> | null }>(
    `select o.id, o.status, o.output, o.error, o.created_at, s.payload as sealed
       from cycle.ai_outputs o left join cycle.ai_sealed s on s.tenant_id = o.tenant_id and s.ai_output_id = o.id
      where o.subject_id = $1 and o.task = $2 order by o.created_at desc limit 1`,
    [subjectId, task],
  );
}

export async function recordFeedback(ctx: Ctx, aiOutputId: string, helpful: boolean, reason?: string) {
  await ctx.tx.query(
    `insert into cycle.ai_feedback (tenant_id, ai_output_id, person_id, helpful, reason) values (app.tenant(), $1, auth.uid(), $2, $3)
     on conflict (tenant_id, ai_output_id, person_id) do update set helpful = excluded.helpful, reason = excluded.reason`,
    [aiOutputId, helpful, reason ?? null],
  );
}
