import { createHmac, timingSafeEqual } from "node:crypto";
import { parseOutput, SCHEMA_VERSION, type TaskOutput, type TaskType } from "./schemas";

/** The task contract (docs/manih-contract.md §4). */
export type TaskRequest<T extends TaskType = TaskType> = {
  task_type: T;
  schema_version: string;
  tenant_ref: string;
  framework_version_ref: string | null;
  inputs: Record<string, unknown>;
  idempotency_key: string;
  callback_url: string;
};
export type TaskResult = {
  task_id: string;
  idempotency_key: string;
  task_type: TaskType;
  schema_version: string;
  status: "completed" | "failed";
  output?: unknown;
  error?: string;
  model?: string;
  package_version?: string;
  cost_usd?: number;
  latency_ms?: number;
};

export interface ManihClient {
  readonly name: string;
  submit(req: TaskRequest): Promise<{ task_id: string }>;
  get(taskId: string): Promise<TaskResult | { status: "running" }>;
  /** Short synchronous tasks: 10s timeout, null on any failure (fails quietly, §3). */
  runSync<T extends TaskType>(task: T, tenantRef: string, inputs: Record<string, unknown>): Promise<TaskOutput<T> | null>;
}

/** Same header scheme Manih already uses for partner webhooks (x-manih-signature over `${ts}.${body}`). */
export function signWebhook(secret: string, body: string, ts = String(Date.now())) {
  return { "x-manih-timestamp": ts, "x-manih-signature": createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex") };
}

export function verifyWebhook(secret: string, body: string, headers: { signature: string | null; timestamp: string | null }, now = Date.now(), toleranceMs = 5 * 60_000): { ok: true } | { ok: false; reason: string } {
  if (!headers.signature || !headers.timestamp) return { ok: false, reason: "missing_signature" };
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceMs) return { ok: false, reason: "stale_timestamp" };
  const expected = createHmac("sha256", secret).update(`${headers.timestamp}.${body}`).digest();
  let given: Buffer;
  try { given = Buffer.from(headers.signature, "hex"); } catch { return { ok: false, reason: "bad_signature" }; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

export class HttpManihClient implements ManihClient {
  readonly name = "manih-http";
  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private async call(path: string, init: RequestInit, timeoutMs: number) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: ctrl.signal, headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}`, ...(init.headers ?? {}) } });
      if (!res.ok) throw new Error(`manih ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  async submit(req: TaskRequest) {
    return (await this.call("/tasks", { method: "POST", body: JSON.stringify(req) }, 15_000)) as { task_id: string };
  }
  async get(taskId: string) {
    return (await this.call(`/tasks/${encodeURIComponent(taskId)}`, { method: "GET" }, 15_000)) as TaskResult | { status: "running" };
  }
  async runSync<T extends TaskType>(task: T, tenantRef: string, inputs: Record<string, unknown>) {
    try {
      const r = (await this.call("/tasks/sync", { method: "POST", body: JSON.stringify({ task_type: task, schema_version: SCHEMA_VERSION, tenant_ref: tenantRef, inputs }) }, 10_000)) as TaskResult;
      if (r.status !== "completed") return null;
      const p = parseOutput(task, r.output);
      return p.ok ? p.value : null;
    } catch { return null; }
  }
}
