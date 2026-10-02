/*
 * T-33 · Manih evaluation run. `pnpm evals` against the deterministic mock (CI); with MANIH_URL
 * and MANIH_API_KEY set it goes through the real contract (async submit + poll), after PII
 * redaction, exactly as the platform does. Exits 1 on any enforced threshold breach.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HttpManihClient, mockOutput, parseOutput, redactDeep, restore, SCHEMA_VERSION, type TaskOutput, type TaskType } from "@wbl/adapters/manih";
import { documents, injections, queries, study, type StudyCase } from "../cases/golden";
import { add, breaches, evidenceGrounded, flagPrecision, injectionSucceeded, parseThresholds, ratio, scoreAgreement, type Ratio } from "./metrics";

const root = path.resolve(import.meta.dirname, "..");
const real = !!process.env.MANIH_URL;
const client = real ? new HttpManihClient(process.env.MANIH_URL!, process.env.MANIH_API_KEY ?? "") : null;

async function run<T extends TaskType>(task: T, inputs: Record<string, unknown>): Promise<{ ok: true; value: TaskOutput<T> } | { ok: false; error: string }> {
  if (!client) return parseOutput(task, mockOutput(task, inputs));
  const { value: redacted, map } = redactDeep(inputs);
  const { task_id } = await client.submit({ task_type: task, schema_version: SCHEMA_VERSION, tenant_ref: "evals", framework_version_ref: null, inputs: redacted, idempotency_key: `evals-${task}-${Date.now()}-${Math.random()}`, callback_url: "https://invalid.example/evals" });
  for (let i = 0; i < 120; i++) {
    const r = await client.get(task_id);
    if (r.status === "completed") return parseOutput(task, restore(r.output, map));
    if (r.status === "failed") return { ok: false, error: r.error ?? "failed" };
    await new Promise((res) => setTimeout(res, 2000));
  }
  return { ok: false, error: "timeout" };
}

const studyInputs = (c: StudyCase) => ({ title: c.title, requested_halalas: c.requestedHalalas, criteria: c.criteria, budget: c.budget, attachments: c.attachments, form: {} });

let schema: Ratio = { hit: 0, total: 0 }, agreement: Ratio = { hit: 0, total: 0 }, grounded: Ratio = { hit: 0, total: 0 }, flags: Ratio = { hit: 0, total: 0 }, expiry: Ratio = { hit: 0, total: 0 }, intent: Ratio = { hit: 0, total: 0 };
let injected = 0;
const failures: string[] = [];

for (const c of study) {
  const r = await run("application.study_file", studyInputs(c));
  schema = add(schema, { hit: r.ok ? 1 : 0, total: 1 });
  if (!r.ok) { failures.push(`${c.id}: ${r.error}`); continue; }
  agreement = add(agreement, scoreAgreement(r.value.scores, c.human.scores));
  const ev = [...r.value.summary.evidence, ...r.value.scores.flatMap((s) => s.evidence), ...r.value.budget_flags.flatMap((b) => b.evidence)];
  grounded = add(grounded, evidenceGrounded(ev, c.attachments));
  flags = add(flags, flagPrecision(r.value.budget_flags.map((b) => b.item), c.human.flaggedItems));
}
for (const c of documents) {
  const r = await run("document.extract", { file_name: c.fileName, attachments: [{ id: c.id, name: c.fileName, text: c.text }] });
  schema = add(schema, { hit: r.ok ? 1 : 0, total: 1 });
  expiry = add(expiry, { hit: r.ok && r.value.expiry_date === c.expected.expiry_date ? 1 : 0, total: 1 });
  if (!r.ok) failures.push(`${c.id}: ${r.error}`);
}
for (const c of queries) {
  const r = await run("query.interpret", { question: c.question });
  schema = add(schema, { hit: r.ok ? 1 : 0, total: 1 });
  const ok = r.ok && (c.expected.understood ? r.value.understood && r.value.metric === c.expected.metric : !r.value.understood);
  intent = add(intent, { hit: ok ? 1 : 0, total: 1 });
}
for (const c of injections) {
  const r = await run("application.study_file", studyInputs(c.study));
  schema = add(schema, { hit: r.ok ? 1 : 0, total: 1 });
  if (r.ok && injectionSucceeded(c.forbidden, r.value, { maxScore: Math.max(...c.study.criteria.map((x) => x.max)), requestedHalalas: c.study.requestedHalalas })) { injected++; failures.push(`${c.id}: injection succeeded (${c.forbidden})`); }
}

const values = { schema_valid: ratio(schema), score_agreement: ratio(agreement), evidence_grounded: ratio(grounded), budget_flag_precision: ratio(flags), expiry_accuracy: ratio(expiry), query_intent_accuracy: ratio(intent), injection_success: injected };
const thresholds = parseThresholds(readFileSync(path.join(root, "thresholds.yaml"), "utf8"));
const enforced = thresholds[real ? "real" : "mock"] ?? {};
const broken = breaches(values, enforced);
const sources = [...new Set([...study, ...documents, ...queries, ...injections].map((c) => c.source))];

console.log(`Manih evals — target: ${real ? process.env.MANIH_URL : "mock"} · golden set: ${sources.join(", ")}`);
for (const [k, v] of Object.entries(values)) console.log(`  ${k.padEnd(24)} ${typeof v === "number" && k !== "injection_success" ? v.toFixed(3) : v}${k in enforced || `${k}_max` in enforced ? "" : "   (reported only)"}`);
if (sources.includes("synthetic")) console.log("  ⚠ golden set is synthetic; T-33 replaces it with الملاحي's sample");
for (const f of failures) console.log(`  ✗ ${f}`);
mkdirSync(path.join(root, "results"), { recursive: true });
writeFileSync(path.join(root, "results", "latest.json"), JSON.stringify({ at: new Date().toISOString(), target: real ? "real" : "mock", sources, values, breaches: broken, failures }, null, 2));
if (broken.length) { console.error(`threshold breaches:\n  ${broken.join("\n  ")}`); process.exit(1); }
console.log("all enforced thresholds met");
