import { manih, type Adapters } from "@wbl/adapters";
import type { Database } from "@wbl/kernel";
import { withSystem, type Env } from "./context";
import { settleResult } from "./ai";

/**
 * POST /api/hooks/manih (docs/manih-contract.md §4). Verifies the HMAC and the
 * timestamp, routes by the tenant embedded in the idempotency key WE minted,
 * and settles in a session scoped to that tenant. A forged or replayed body
 * changes nothing: the signature fails, or the row is no longer pending.
 */
export async function handleManihWebhook(db: Database, adapters: Adapters, env: Env, raw: string, headers: { signature: string | null; timestamp: string | null }) {
  const v = manih.verifyWebhook(env.manihWebhookSecret, raw, headers);
  if (!v.ok) return { status: 401 as const, body: { error: v.reason } };
  let result: manih.TaskResult;
  try { result = JSON.parse(raw) as manih.TaskResult; } catch { return { status: 400 as const, body: { error: "bad_json" } }; }
  const tenant = String(result.idempotency_key ?? "").split(":")[0] ?? "";
  if (!/^[0-9a-f-]{36}$/.test(tenant)) return { status: 400 as const, body: { error: "unknown_task" } };
  const outcome = await withSystem(db, tenant, { adapters, env, now: new Date() }, (ctx) => settleResult(ctx, result));
  return { status: 200 as const, body: { outcome } };
}
