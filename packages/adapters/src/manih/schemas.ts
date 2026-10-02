import { z } from "zod";

/**
 * Versioned output schemas for every Manih task (docs/02-ai-layer.md §2–§3).
 * A result that does not parse is refused, retried once, then shown as «تعذّر»
 * with the manual fallback. Evidence {file_id, page, span} is mandatory on
 * every score or flag; page/span may be null until Manih returns them
 * (docs/manih-contract.md §4).
 */
export const evidence = z.object({
  file_id: z.string(),
  page: z.number().int().positive().nullable(),
  span: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).nullable(),
  excerpt: z.string().max(2000),
});

export const outputs = {
  "application.study_file": z.object({
    summary: z.object({ text: z.string().min(1), evidence: z.array(evidence) }),
    scores: z.array(z.object({ criterion: z.string(), score: z.number().min(0), rationale: z.string().min(1), evidence: z.array(evidence).min(1) })),
    budget_flags: z.array(z.object({ item: z.string(), amount_halalas: z.number().int().nonnegative(), reason: z.string(), evidence: z.array(evidence) })),
    suggested_track: z.string().nullable(),
    schedule: z.array(z.object({ label: z.string(), percent: z.number().positive().max(100), condition: z.enum(["signature", "deliverable", "final_report"]), deliverable: z.string(), due_offset_days: z.number().int().nonnegative() })),
    recommendation: z.object({ decision: z.enum(["approve", "approve_modified", "reject"]), amount_halalas: z.number().int().nonnegative(), rationale: z.string().min(1) }),
  }),
  "document.extract": z.object({ type: z.string(), number: z.string().nullable(), issue_date: z.string().nullable(), expiry_date: z.string().nullable(), confidence: z.number().min(0).max(1) }),
  "proposal.prefill": z.object({ fields: z.array(z.object({ key: z.string(), value: z.string(), evidence: evidence.nullable() })) }),
  "message.draft": z.object({ text: z.string().min(1).max(5000) }),
  "committee.extract": z.object({ decisions: z.array(z.object({ application_ref: z.string(), decision: z.enum(["approve", "reject", "defer"]), amount_halalas: z.number().int().nonnegative().nullable(), evidence: evidence.nullable() })) }),
  "deliverable.review": z.object({ matches: z.array(z.object({ requirement: z.string(), met: z.boolean(), note: z.string(), evidence: evidence.nullable() })), gaps: z.array(z.string()) }),
  "amendment.diff": z.object({ changes: z.array(z.string()), impact: z.string(), policy_violations: z.array(z.string()) }),
  "final_report.review": z.object({ planned_vs_achieved: z.array(z.object({ item: z.string(), planned: z.string(), achieved: z.string(), met: z.boolean() })), budget_vs_spent: z.object({ budget_halalas: z.number().int(), spent_halalas: z.number().int(), note: z.string() }), notes: z.array(z.string()) }),
  "performance.propose": z.object({ rating: z.enum(["أ", "ب", "ج", "د"]), rationale: z.string().min(1) }),
  "entity.brief": z.object({ now: z.string().max(200), waiting: z.string().max(200), risk: z.string().max(200).nullable() }),
  "query.interpret": z.union([
    z.object({ understood: z.literal(true), metric: z.string(), filters: z.record(z.string(), z.union([z.string(), z.number()])), period: z.string().nullable(), explanation: z.string() }),
    z.object({ understood: z.literal(false) }),
  ]),
  "policy.draft": z.object({ clauses: z.array(z.object({ text: z.string().min(1), source: z.string().nullable() })) }),
  "policy.derive_config": z.object({ config: z.record(z.string(), z.unknown()) }),
  "invitation.fit": z.object({ fits: z.array(z.object({ association_id: z.string(), fit: z.enum(["high", "medium", "low"]), reason: z.string() })) }),
} as const;

export type TaskType = keyof typeof outputs;
export type TaskOutput<T extends TaskType> = z.infer<(typeof outputs)[T]>;
export const SCHEMA_VERSION = "1";

/** Synchronous tasks, called with a 10s timeout and failing quietly (§3). */
export const SYNC_TASKS: TaskType[] = ["entity.brief", "query.interpret"];

/**
 * Sealed fields of a study file: hidden from the specialist in independent mode
 * until they record an assessment (R-039). Stored in cycle.ai_sealed.
 */
export function splitStudyFile(out: TaskOutput<"application.study_file">) {
  const { scores, recommendation, ...open } = out;
  return { open, sealed: { scores, recommendation } };
}

export function parseOutput<T extends TaskType>(task: T, raw: unknown): { ok: true; value: TaskOutput<T> } | { ok: false; error: string } {
  const r = outputs[task].safeParse(raw);
  return r.success ? { ok: true, value: r.data as TaskOutput<T> } : { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}
