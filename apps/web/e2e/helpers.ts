import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import path from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "../../..");
export const PASSWORD = "Wbl-demo-2026";
const STAFF_TOTP = "JBSWY3DPEHPK3PXP"; // demo seed only

/** RFC 6238 code for the demo staff secret. */
export function totp(secret = STAFF_TOTP, at = Date.now()): string {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret) bits += a.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest();
  const o = h[19]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

/** Local test database only (superuser over the socket); used to reset and to flip ai_enabled. */
export function sql(q: string): string {
  return execFileSync("psql", ["-h", "/tmp", "-p", "54329", "-U", "postgres", "-d", "grants_e2e", "-Atc", q], { encoding: "utf8" }).trim();
}
export function resetDb() {
  execFileSync("node", [path.join(root, "scripts/db.mjs"), "reset"], { stdio: "pipe", env: { ...process.env, DB_NAME: "grants_e2e" } });
}
export function setAi(enabled: boolean) {
  sql(`update platform.donors set ai_enabled = ${enabled} where subdomain = 'almulhi'`);
}

export async function login(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
  if (page.url().includes("/login/mfa")) {
    await page.locator("input[name=code]").fill(totp());
    await page.locator("button[type=submit]").click();
    await page.waitForURL((u) => !u.pathname.includes("/mfa"));
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/home"));
  return page;
}

/** Waits until the worker has delivered an outbox-driven effect (polls a query). */
export async function until(q: string, expected: string, timeoutMs = 30_000) {
  await expect.poll(() => sql(q), { timeout: timeoutMs, intervals: [250, 500, 1000] }).toBe(expected);
}

export const pdf = { name: "doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") };
