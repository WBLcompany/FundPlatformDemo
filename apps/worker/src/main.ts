// The background worker (architecture §2): outbox consumers, sweeps, Manih tasks.
// Connects as `authenticator` and switches to restricted roles per operation; it
// never holds a service-role key (invariant 3).
import { createAdapters } from "@wbl/adapters";
import { Database, secretFromEnv } from "@wbl/kernel";
import { worker } from "@wbl/services";

const db = new Database(process.env.DATABASE_URL ?? "postgres://authenticator:authenticator@localhost:54329/grants_dev");
const adapters = createAdapters(process.env);
const env = { appUrl: process.env.APP_URL ?? "http://localhost:3000", manihWebhookSecret: secretFromEnv("MANIH_WEBHOOK_SECRET", "dev-manih-secret"), otpSalt: secretFromEnv("OTP_SALT", "dev-otp-salt") };
const OUTBOX_MS = Number(process.env.OUTBOX_INTERVAL_MS ?? 1000);
const SWEEP_MS = Number(process.env.SWEEP_INTERVAL_MS ?? 60_000);

let stopping = false;
async function outboxLoop() {
  while (!stopping) {
    try { await worker.drain(db, adapters, env, 5); } catch (e) { console.error(JSON.stringify({ level: "error", event: "outbox_loop", error: String(e) })); }
    await new Promise((r) => setTimeout(r, OUTBOX_MS));
  }
}
const SCAN_MS = Number(process.env.SCAN_INTERVAL_MS ?? 2000);
async function scanLoop() {
  while (!stopping) {
    try { const r = await worker.scanQuarantine(db, adapters, env); if (r.scanned) console.log(JSON.stringify({ level: "info", event: "scanned", ...r })); }
    catch (e) { console.error(JSON.stringify({ level: "error", event: "scan_loop", error: String(e) })); }
    await new Promise((r) => setTimeout(r, SCAN_MS));
  }
}
async function sweepLoop() {
  while (!stopping) {
    try { const r = await worker.runSweeps(db, adapters, env); console.log(JSON.stringify({ level: "info", event: "sweeps", result: r })); }
    catch (e) { console.error(JSON.stringify({ level: "error", event: "sweep_loop", error: String(e) })); }
    await new Promise((r) => setTimeout(r, SWEEP_MS));
  }
}
process.on("SIGTERM", () => { stopping = true; void Database.closeAll(); });
process.on("SIGINT", () => { stopping = true; void Database.closeAll(); process.exit(0); });
console.log(JSON.stringify({ level: "info", event: "worker_started", manih: adapters.manih.name }));
void outboxLoop();
void scanLoop();
void sweepLoop();
