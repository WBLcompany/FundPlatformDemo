import path from "node:path";
import { defineConfig } from "@playwright/test";

/*
 * T-59 · end-to-end: the whole grant cycle through the real UI, once with the Manih mock and once
 * with AI disabled for the donor. Runs against a local database (grants_e2e), the production build
 * of the web app and the worker. Never points at a hosted environment.
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const DB = "grants_e2e";
const DATABASE_URL = `postgres://authenticator:authenticator@localhost:54329/${DB}`;
const env = { DATABASE_URL, APP_URL: `http://localhost:${PORT}`, STORAGE_ROOT: path.resolve(import.meta.dirname, "../../.storage-e2e"), OPERATOR_TOKEN: "e2e-operator", SESSION_SECRET: "e2e-session-secret-not-for-production", DATA_MASTER_KEY: "e2e-master-key-not-for-production", MANIH_WEBHOOK_SECRET: "e2e-manih-secret", OTP_SALT: "e2e-otp-salt", SWEEP_INTERVAL_MS: "5000", OUTBOX_INTERVAL_MS: "500", SCAN_INTERVAL_MS: "500" };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: [
    // The same standalone server the container runs (pnpm build assembles it).
    { command: "node .next/standalone/apps/web/server.js", port: PORT, env: { ...env, PORT: String(PORT), HOSTNAME: "127.0.0.1" }, reuseExistingServer: false, timeout: 60_000 },
    { command: "npx tsx ../worker/src/main.ts", env, reuseExistingServer: false, wait: { stdout: /worker_started/ }, timeout: 60_000 },
  ],
});
