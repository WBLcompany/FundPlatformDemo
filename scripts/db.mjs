#!/usr/bin/env node
// Local database lifecycle: reset (shim + migrations + seed), test (pgTAP), new migration.
// Uses psql/pg_prove from PATH. Never points at a hosted database: the admin URL
// must be localhost, and the script refuses anything else.
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = process.env.DATABASE_ADMIN_URL ?? "postgres://postgres@localhost:54329/postgres";
const host = new URL(ADMIN).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) {
  console.error(`refusing: DATABASE_ADMIN_URL host is ${host}, not localhost`);
  process.exit(1);
}
const dbUrl = (name) => { const u = new URL(ADMIN); u.pathname = `/${name}`; return u.toString(); };
const psql = (url, args, opts = {}) => execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", ...args], { stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8", env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" } });
const sqlFiles = (dir) => readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(root, dir, f));

function reset(name, { seed }) {
  psql(ADMIN, ["-c", `drop database if exists ${name} with (force)`, "-c", `create database ${name}`]);
  const url = dbUrl(name);
  for (const f of sqlFiles("supabase/local")) psql(url, ["-f", f]);
  for (const f of sqlFiles("supabase/migrations")) psql(url, ["-f", f]);
  if (seed) for (const f of sqlFiles("supabase/seed")) psql(url, ["-f", f]);
  console.log(`db: ${name} reset (${seed ? "with" : "without"} seed)`);
  return url;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "reset") {
  reset(process.env.DB_NAME ?? "grants_dev", { seed: arg !== "--no-seed" });
} else if (cmd === "test") {
  const url = reset("grants_test", { seed: true });
  psql(url, ["-f", path.join(root, "supabase/tests/support/helpers.sql")]);
  execFileSync("pg_prove", ["-d", url, ...sqlFiles("supabase/tests")], { stdio: "inherit" });
} else if (cmd === "new") {
  if (!arg) { console.error("usage: db new <name>"); process.exit(1); }
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const file = path.join(root, "supabase/migrations", `${stamp}_${arg}.sql`);
  writeFileSync(file, `-- ${arg}\n`);
  console.log(file);
} else {
  console.error("usage: db.mjs reset [--no-seed] | test | new <name>");
  process.exit(1);
}
