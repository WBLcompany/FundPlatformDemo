import pg from "pg";
import type { DomainEvent } from "../events";

/**
 * Every query runs as the Postgres role `authenticated` (or `anon`) with the
 * caller's claims in request.jwt.claims — exactly how PostgREST runs on
 * Supabase — so RLS is the boundary for application code. The pool connects
 * as `authenticator`, which can do nothing on its own. There is no
 * service-role path here (invariant 3).
 */
export type Claims =
  | { role: "authenticated"; sub: string; tenant_id: string }
  | { role: "anon"; tenant_id: string }
  | { role: "system"; tenant_id: string; sub?: string };

export type Row = Record<string, unknown>;

export interface Tx {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T>;
  maybe<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Appends to kernel.outbox inside this transaction (invariant 2). */
  emit(event: DomainEvent): Promise<void>;
  readonly claims: Claims;
}

export class DbError extends Error {
  constructor(public readonly code: string | undefined, message: string) { super(message); this.name = "DbError"; }
  get isStaleVersion() { return this.code === "40001" || /stale_version/.test(this.message); }
  get isPermission() { return this.code === "42501" || /row-level security|permission denied/.test(this.message); }
}

const pools = new Map<string, pg.Pool>();
function pool(url: string): pg.Pool {
  let p = pools.get(url);
  if (!p) {
    p = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
    // An idle client dropped by the server (restart, failover) emits 'error' on the pool; without a
    // listener Node treats it as unhandled and kills the process. The pool discards the client and
    // the next query opens a fresh one.
    p.on("error", (e) => console.error(JSON.stringify({ level: "warn", event: "db_idle_client_error", code: (e as { code?: string }).code })));
    // The same for a client that is checked out but between queries (inside a transaction while
    // awaiting an adapter): its error is emitted on the client itself. The pending query, if any,
    // still rejects, so the transaction fails and rolls back as it should.
    p.on("connect", (client) => { client.on("error", (e) => console.error(JSON.stringify({ level: "warn", event: "db_client_error", code: (e as { code?: string }).code }))); });
    pools.set(url, p);
  }
  return p;
}

// bigint columns come back as JS numbers when safe; halalas never approach 2^53.
pg.types.setTypeParser(20, (v) => { const n = Number(v); return Number.isSafeInteger(n) ? n : v; });
pg.types.setTypeParser(1700, (v) => Number(v));

export class Database {
  constructor(private readonly url: string) {}

  async session<T>(claims: Claims, fn: (tx: Tx) => Promise<T>, { readOnly = false } = {}): Promise<T> {
    const client = await pool(this.url).connect();
    try {
      await client.query(readOnly ? "begin read only" : "begin");
      await client.query(`set local role ${claims.role === "anon" ? "anon" : "authenticated"}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      const tx: Tx = {
        claims,
        async query<R extends Row>(sql: string, params: unknown[] = []) {
          try { return (await client.query(sql, params)).rows as R[]; }
          catch (e) { const err = e as { code?: string; message: string }; throw new DbError(err.code, err.message); }
        },
        async one<R extends Row>(sql: string, params: unknown[] = []) {
          const rows = await tx.query<R>(sql, params);
          if (rows.length !== 1) throw new DbError("P0002", `expected one row, got ${rows.length}`);
          return rows[0]!;
        },
        async maybe<R extends Row>(sql: string, params: unknown[] = []) {
          const rows = await tx.query<R>(sql, params);
          return rows[0] ?? null;
        },
        async emit(event) {
          await tx.query(
            "insert into kernel.outbox (tenant_id, event_type, entity_kind, entity_id, actor, payload) values ($1,$2,$3,$4,$5,$6)",
            [claims.tenant_id, event.type, event.entityKind ?? null, event.entityId ?? null, "sub" in claims ? claims.sub ?? null : null, JSON.stringify(event.payload ?? {})],
          );
        },
      };
      const out = await fn(tx);
      await client.query("commit");
      return out;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /** The operator console runs as wbl_operator, which can read only the platform aggregates. */
  async operator<T>(fn: (q: <R extends Row>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
    const client = await pool(this.url).connect();
    try {
      await client.query("begin read only");
      await client.query("set local role wbl_operator");
      const out = await fn(async (sql, params = []) => (await client.query(sql, params)).rows);
      await client.query("commit");
      return out;
    } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
    finally { client.release(); }
  }

  /**
   * Pre-authentication lookups that must run before any claim exists (login,
   * resolving a subdomain to a tenant). They run as `anon` against definer
   * functions that return only what the caller is entitled to.
   */
  async anon<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await pool(this.url).connect();
    try {
      await client.query("begin read only");
      await client.query("set local role anon");
      const r = (await client.query(sql, params)).rows as T[];
      await client.query("commit");
      return r;
    } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
    finally { client.release(); }
  }

  /**
   * The worker's single cross-tenant read: pending (event, consumer) pairs.
   * Runs as the worker login role that holds EXECUTE on kernel.pending_events
   * and nothing else; processing then happens in a tenant-scoped session.
   */
  async pendingEvents(consumers: string[], limit = 50) {
    const client = await pool(this.url).connect();
    try {
      await client.query("begin read only");
      await client.query("set local role wbl_worker");
      const r = (await client.query("select * from kernel.pending_events($1, $2)", [consumers, limit])).rows as Array<{ tenant_id: string; event_id: number; event_type: string; consumer: string }>;
      await client.query("commit");
      return r;
    } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
    finally { client.release(); }
  }

  /** Lists tenants for scheduled sweeps (SLA, expiry). Same restricted role. */
  async tenantIds(): Promise<string[]> {
    const client = await pool(this.url).connect();
    try {
      await client.query("begin read only");
      await client.query("set local role wbl_worker");
      const r = (await client.query("select id from kernel.worker_tenants()")).rows as Array<{ id: string }>;
      await client.query("commit");
      return r.map((x) => x.id);
    } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
    finally { client.release(); }
  }

  static async closeAll() {
    await Promise.all([...pools.values()].map((p) => p.end()));
    pools.clear();
  }
}
