import "server-only";
import { createAdapters, type Adapters } from "@wbl/adapters";
import { Database } from "@wbl/kernel";
import type { Env } from "@wbl/services";

/**
 * Process-wide singletons. The database URL authenticates as `authenticator`,
 * which can do nothing until a session switches it to `anon` or `authenticated`
 * with claims — so there is no privileged connection in the web app at all.
 */
const g = globalThis as unknown as { __wbl?: { db: Database; adapters: Adapters } };
export function runtime() {
  if (!g.__wbl) {
    g.__wbl = {
      db: new Database(process.env.DATABASE_URL ?? "postgres://authenticator:authenticator@localhost:54329/grants_dev"),
      adapters: createAdapters(process.env),
    };
  }
  return g.__wbl;
}
export const env: Env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  manihWebhookSecret: process.env.MANIH_WEBHOOK_SECRET ?? "dev-manih-secret",
  otpSalt: process.env.OTP_SALT ?? "dev-otp-salt",
};
