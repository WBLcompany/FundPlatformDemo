#!/usr/bin/env node
// T-60 · R-116 load test: N concurrent sessions per role hitting each role's screens for D seconds.
// Signs in once per role through a real browser (staff pass TOTP), then drives plain HTTP with the
// session cookie. Reports p50/p95/p99 and errors against the page target (3 s).
//
//   node scripts/load-test.mjs --base http://localhost:3000 --concurrency 50 --seconds 30
//
// Locally this measures the code on one machine; the R-116 sign-off is the same run against the
// staging environment of the chosen host (Q-1).
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3000");
const CONC = Number(arg("concurrency", 50));
const SECONDS = Number(arg("seconds", 30));
const TARGET_MS = 3000;
const PASSWORD = process.env.LOAD_PASSWORD ?? "Wbl-demo-2026";      // demo seed only
const TOTP_SECRET = process.env.LOAD_TOTP ?? "JBSWY3DPEHPK3PXP";   // demo seed only

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

function totp(secret) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const c of secret) bits += a.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

const ROLES = [
  { email: "owner@albir.demo", pages: ["/portal", "/portal/applications", "/portal/projects", "/portal/documents"] },
  { email: "sara@almulhi.demo", pages: ["/staff", "/staff/applications", "/staff/projects", "/staff/associations"] },
  { email: "manager@almulhi.demo", pages: ["/staff/home", "/staff/applications", "/staff/finance", "/staff/reports"] },
];

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const r of ROLES) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("input[name=email]", r.email);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
  if (page.url().includes("/mfa")) { await page.fill("input[name=code]", totp(TOTP_SECRET)); await page.click("button[type=submit]"); await page.waitForURL((u) => !u.pathname.includes("/mfa")); }
  r.cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  await ctx.close();
}
await browser.close();

const samples = []; let errors = 0; const errorKinds = {};
const until = Date.now() + SECONDS * 1000;
async function session(i) {
  const r = ROLES[i % ROLES.length];
  let n = 0;
  while (Date.now() < until) {
    const path = r.pages[n++ % r.pages.length];
    const t0 = performance.now();
    try {
      const res = await fetch(BASE + path, { headers: { cookie: r.cookie }, redirect: "manual" });
      await res.arrayBuffer();
      if (res.status !== 200) { errors++; const k = `${res.status} ${path}`; errorKinds[k] = (errorKinds[k] ?? 0) + 1; }
    } catch (e) { errors++; errorKinds[e.code ?? "network"] = (errorKinds[e.code ?? "network"] ?? 0) + 1; }
    samples.push(performance.now() - t0);
  }
}
await Promise.all(Array.from({ length: CONC }, (_, i) => session(i)));

samples.sort((a, b) => a - b);
const pct = (p) => Math.round(samples[Math.min(samples.length - 1, Math.floor((p / 100) * samples.length))] ?? 0);
const report = { base: BASE, concurrency: CONC, seconds: SECONDS, requests: samples.length, rps: Math.round(samples.length / SECONDS), p50: pct(50), p95: pct(95), p99: pct(99), errors, errorKinds };
console.log(JSON.stringify(report, null, 2));
const ok = report.p95 <= TARGET_MS && errors === 0;
console.log(ok ? `p95 ${report.p95} ms ≤ ${TARGET_MS} ms, no errors` : `FAILED: p95 ${report.p95} ms (target ${TARGET_MS}), errors ${errors}`);
process.exit(ok ? 0 : 1);
