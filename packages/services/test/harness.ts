import { execFileSync } from "node:child_process";
import path from "node:path";
import { createAdapters, manih, MemoryEmailSender, MockOtpSender, MemoryWhatsAppSender, type Adapters } from "@wbl/adapters";
import { Database } from "@wbl/kernel";
import { handleManihWebhook, withPerson, withSystem, worker, type Ctx, type Env } from "../src";

const root = path.resolve(__dirname, "../../..");
export const DB_NAME = "grants_it";
export const URL = `postgres://authenticator:authenticator@localhost:54329/${DB_NAME}`;

export function resetDb() {
  execFileSync("node", [path.join(root, "scripts/db.mjs"), "reset"], { env: { ...process.env, DB_NAME }, stdio: "pipe" });
}

export const env: Env = { appUrl: "http://platform.test", manihWebhookSecret: "test-secret", otpSalt: "test-salt" };

export function makeAdapters(db: Database, mode: "ok" | "fail" | "invalid" = "ok"): Adapters & { email: MemoryEmailSender; otp: MockOtpSender; whatsapp: MemoryWhatsAppSender } {
  const base = createAdapters({ STORAGE_ROOT: path.join(root, ".storage-test") });
  const adapters = { ...base, email: new MemoryEmailSender(), otp: new MockOtpSender(), whatsapp: new MemoryWhatsAppSender() } as Adapters & { email: MemoryEmailSender; otp: MockOtpSender; whatsapp: MemoryWhatsAppSender };
  // The mock Manih "calls back" straight into the webhook handler, signature and all.
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    const r = await handleManihWebhook(db, adapters, env, String(init.body), { signature: h["x-manih-signature"] ?? null, timestamp: h["x-manih-timestamp"] ?? null });
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  adapters.manih = new manih.MockManihClient({ secret: env.manihWebhookSecret, mode, fetchImpl });
  return adapters;
}

export async function lookup(db: Database, email: string) {
  const rows = await db.anon<{ person_id: string }>("select person_id from iam.login_lookup($1)", [email]);
  const m = await db.anon<{ tenant_id: string }>("select tenant_id from iam.login_memberships($1)", [rows[0]!.person_id]);
  return { personId: rows[0]!.person_id, tenantId: m[0]!.tenant_id };
}

export function as(db: Database, adapters: Adapters, now: () => Date) {
  return async <T>(email: string, fn: (ctx: Ctx) => Promise<T>) => {
    const p = await lookup(db, email);
    return withPerson(db, p.personId, p.tenantId, { adapters, env, now: now() }, fn);
  };
}
export function system(db: Database, adapters: Adapters, now: () => Date) {
  return async <T>(tenantId: string, fn: (ctx: Ctx) => Promise<T>) => withSystem(db, tenantId, { adapters, env, now: now() }, fn);
}
export const drain = (db: Database, adapters: Adapters) => worker.drain(db, adapters, env);
