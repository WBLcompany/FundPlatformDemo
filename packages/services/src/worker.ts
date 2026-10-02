import type { Adapters } from "@wbl/adapters";
import type { Database } from "@wbl/kernel";
import { withSystem, type Env } from "./context";
import { consume, CONSUMERS, type ConsumerName, type OutboxEvent } from "./consumers";
import { runAll, pollManih } from "./sweeps";

/**
 * One pass of the outbox: claim pending (event, consumer) pairs, process each in
 * a session scoped to that event's tenant, and record the delivery in the SAME
 * transaction — the unique (event, consumer) key makes delivery at-most-once,
 * the retry loop makes it at-least-once: together, exactly once (T-17, R-096).
 */
const failures = new Map<string, number>();
const MAX_ATTEMPTS = 5;

export async function processOutbox(db: Database, adapters: Adapters, env: Env, limit = 100): Promise<{ processed: number; failed: number }> {
  const pending = await db.pendingEvents([...CONSUMERS], limit);
  let processed = 0, failed = 0;
  for (const p of pending) {
    const key = `${p.tenant_id}:${p.event_id}:${p.consumer}`;
    try {
      await withSystem(db, p.tenant_id, { adapters, env, now: new Date() }, async (ctx) => {
        const claimed = await ctx.tx.query("insert into kernel.outbox_deliveries (tenant_id, event_id, consumer) values (app.tenant(), $1, $2) on conflict do nothing returning event_id", [p.event_id, p.consumer]);
        if (!claimed.length) return;                       // another worker got it first
        const e = await ctx.tx.one<OutboxEvent>("select id, event_type, entity_kind, entity_id, actor, payload, created_at from kernel.outbox where id = $1", [p.event_id]);
        await consume(ctx, p.consumer as ConsumerName, e);
      });
      failures.delete(key);
      processed++;
    } catch (err) {
      failed++;
      const n = (failures.get(key) ?? 0) + 1;
      failures.set(key, n);
      console.error(JSON.stringify({ level: "error", event: "consumer_failed", consumer: p.consumer, event_id: p.event_id, attempt: n, error: String((err as Error).message) }));
      if (n >= MAX_ATTEMPTS) {
        // Dead letter: recorded as delivered with its error so it stops blocking, and is visible to the operator.
        await withSystem(db, p.tenant_id, { adapters, env, now: new Date() }, (ctx) =>
          ctx.tx.query("insert into kernel.outbox_deliveries (tenant_id, event_id, consumer, attempts, last_error) values (app.tenant(), $1, $2, $3, $4) on conflict do nothing", [p.event_id, p.consumer, n, String((err as Error).message).slice(0, 500)]));
        failures.delete(key);
      }
    }
  }
  return { processed, failed };
}

/** Drains the outbox until nothing is left (events emitted by consumers are processed too). */
export async function drain(db: Database, adapters: Adapters, env: Env, maxRounds = 20) {
  let total = 0;
  for (let i = 0; i < maxRounds; i++) {
    const r = await processOutbox(db, adapters, env);
    total += r.processed;
    if (r.processed === 0 && r.failed === 0) break;
  }
  return total;
}

/**
 * T-24 · scan files waiting in quarantine (oldest first) and mark them clean or infected. A file is
 * served only when clean (/api/files); an infected one stays blocked and its uploader is told.
 */
export async function scanQuarantine(db: Database, adapters: Adapters, env: Env, limit = 20) {
  let scanned = 0, infected = 0;
  for (const tenant of await db.tenantIds()) {
    await withSystem(db, tenant, { adapters, env, now: new Date() }, async (ctx) => {
      const files = await ctx.tx.query<{ id: string; storage_path: string; owner_org_id: string | null; name: string }>(
        "select id, storage_path, owner_org_id, name from kernel.files where scan_status = 'quarantine' order by created_at limit $1", [limit]);
      for (const f of files) {
        const body = await adapters.storage.get(f.storage_path);
        if (!body) continue; // object not written yet; retried on the next pass
        const verdict = await adapters.av.scan(body);
        await ctx.tx.query("update kernel.files set scan_status = $2 where id = $1 and scan_status = 'quarantine'", [f.id, verdict]);
        scanned++;
        if (verdict === "infected") {
          infected++;
          await ctx.tx.emit({ type: "file.infected", entityKind: "file", entityId: f.id, payload: { name: f.name, org_id: f.owner_org_id } });
        }
      }
    });
  }
  return { scanned, infected };
}

export async function runSweeps(db: Database, adapters: Adapters, env: Env, now = new Date()) {
  const out: Record<string, unknown> = {};
  for (const tenant of await db.tenantIds()) {
    out[tenant] = await withSystem(db, tenant, { adapters, env, now }, async (ctx) => {
      const has = await ctx.tx.maybe("select 1 from framework.current_version");
      if (!has) return null;
      return { ...(await runAll(ctx)), polled: await pollManih(ctx) };
    });
  }
  return out;
}
