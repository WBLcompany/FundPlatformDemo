import "server-only";
import { createAdapters, type Adapters } from "@wbl/adapters";
import { Database, secretFromEnv } from "@wbl/kernel";
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
// Read when used, not at import: `next build` loads this module with no secrets present.
export const env: Env = {
  get appUrl() { return process.env.APP_URL ?? "http://localhost:3000"; },
  get manihWebhookSecret() { return secretFromEnv("MANIH_WEBHOOK_SECRET", "dev-manih-secret"); },
  get otpSalt() { return secretFromEnv("OTP_SALT", "dev-otp-salt"); },
};
