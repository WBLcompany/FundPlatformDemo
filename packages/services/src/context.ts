import { DomainError, framework, iam, type Halalas } from "@wbl/domain";
import type { Adapters } from "@wbl/adapters";
import type { Database, Tx, Claims } from "@wbl/kernel";

/**
 * Every use case receives a Ctx bound to ONE transaction under the caller's
 * claims (invariant 2: one transaction writes state, audit, outbox and SLA).
 * `system` is set only by the worker, whose session is scoped to one tenant.
 */
export type Env = { appUrl: string; manihWebhookSecret: string; otpSalt: string };
export type Ctx = { tx: Tx; actor: iam.Actor; adapters: Adapters; now: Date; env: Env; system?: boolean };

export class Forbidden extends DomainError {
  constructor(action: string) { super("forbidden", `not allowed: ${action}`); }
}

export function authorize(ctx: Ctx, action: iam.Action, resource: Omit<iam.Resource, "tenantId">, opts?: { naturalLanguageRoles?: string[] }) {
  if (ctx.system) return;
  if (!iam.can(ctx.actor, action, { tenantId: ctx.actor.tenantId, ...resource }, opts)) throw new Forbidden(action);
}

/** Reads the caller's own memberships (RLS lets a person read their own rows). */
export async function loadActor(tx: Tx, personId: string, tenantId: string): Promise<iam.Actor> {
  const rows = await tx.query<{ id: string; role: iam.Role; org_id: string | null; scope_application_id: string | null; scope_expires_at: string | null }>(
    "select id, role, org_id, scope_application_id, scope_expires_at from iam.memberships where person_id = $1 and tenant_id = $2 and active",
    [personId, tenantId],
  );
  return { personId, tenantId, grants: rows.map((r) => ({ role: r.role, membershipId: r.id, orgId: r.org_id, scopeApplicationId: r.scope_application_id, scopeExpiresAt: r.scope_expires_at })) };
}

export function systemActor(tenantId: string): iam.Actor {
  return { personId: "00000000-0000-4000-8000-000000000000", tenantId, grants: [] };
}

/** Invariant 5: the runtime reads the frozen snapshot of a version, never the draft. */
export async function versionConfig(tx: Tx, versionId: string): Promise<{ id: string; number: string; config: framework.FrameworkConfig }> {
  const v = await tx.one<{ id: string; number: string; snapshot: framework.FrameworkConfig }>("select id, number, snapshot from framework.versions where id = $1", [versionId]);
  return { id: v.id, number: v.number, config: v.snapshot };
}
export async function currentVersion(tx: Tx) {
  const v = await tx.maybe<{ id: string; number: string; snapshot: framework.FrameworkConfig }>("select id, number, snapshot from framework.current_version");
  if (!v) throw new DomainError("no_framework", "لا توجد نسخة إطار معتمدة");
  return { id: v.id, number: v.number, config: v.snapshot };
}

export function programOf(config: framework.FrameworkConfig, programId: string) {
  const p = config.programs.find((x) => x.id === programId);
  if (!p) throw new DomainError("unknown_program", programId);
  return p;
}

export async function holidays(tx: Tx): Promise<Set<string>> {
  const rows = await tx.query<{ day: string }>("select to_char(day, 'YYYY-MM-DD') as day from kernel.holidays");
  return new Set(rows.map((r) => r.day));
}

export function riyadhToday(now: Date): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export async function donor(tx: Tx): Promise<{ id: string; name: string; ai_enabled: boolean; slug: string }> {
  return tx.one("select id, name, ai_enabled, slug from platform.donors where id = app.tenant()");
}

export const asHalalas = (n: unknown): Halalas => Number(n ?? 0);

/** Opens a session for a signed-in person and builds the Ctx. */
export async function withPerson<T>(db: Database, personId: string, tenantId: string, base: Omit<Ctx, "tx" | "actor">, fn: (ctx: Ctx) => Promise<T>, opts?: { readOnly?: boolean }): Promise<T> {
  const claims: Claims = { role: "authenticated", sub: personId, tenant_id: tenantId };
  return db.session(claims, async (tx) => fn({ ...base, tx, actor: await loadActor(tx, personId, tenantId) }), opts);
}

export async function withSystem<T>(db: Database, tenantId: string, base: Omit<Ctx, "tx" | "actor" | "system">, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  return db.session({ role: "system", tenant_id: tenantId }, async (tx) => fn({ ...base, tx, actor: systemActor(tenantId), system: true }));
}
