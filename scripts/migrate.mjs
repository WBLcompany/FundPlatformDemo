#!/usr/bin/env node
// Forward-only migrations for a deployed database (D-23: self-hosted). Unlike scripts/db.mjs it
// never drops anything, accepts any host, and keeps a ledger, so it is safe on a database that
// holds real data.
//
//   DATABASE_ADMIN_URL=postgres://postgres:…@db:5432/grants AUTHENTICATOR_PASSWORD=… node scripts/migrate.mjs
//
//   --self-hosted   also apply supabase/local (roles, auth schema) — plain Postgres, not Supabase
//   --baseline      record every file as applied without running it (a database built by db.mjs)
//   --seed-demo     load the «الملاحي-تجريبي» demo seed afterwards (never on a database with real data)
//   --dry-run       list what would be applied
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2));
const url = process.env.DATABASE_ADMIN_URL;
if (!url) { console.error("DATABASE_ADMIN_URL is required"); process.exit(1); }

const files = (dir) => readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => ({ name: `${dir}/${f}`, sql: readFileSync(path.join(root, dir, f), "utf8") }));
const plan = [...(flags.has("--self-hosted") ? files("supabase/local") : []), ...files("supabase/migrations")];
const sha = (s) => createHash("sha256").update(s).digest("hex");

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("set client_min_messages = warning");
await client.query(`create schema if not exists ops;
  create table if not exists ops.schema_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now());
  revoke all on schema ops from public;`);
const applied = new Map((await client.query("select name, sha256 from ops.schema_migrations")).rows.map((r) => [r.name, r.sha256]));

let ran = 0;
for (const f of plan) {
  const h = sha(f.sql);
  if (applied.has(f.name)) {
    if (applied.get(f.name) !== h) { console.error(`refusing: ${f.name} changed after it was applied (write a new migration instead)`); process.exit(1); }
    continue;
  }
  if (flags.has("--dry-run")) { console.log(`would apply ${f.name}`); continue; }
  await client.query("begin");
  try {
    if (!flags.has("--baseline")) await client.query(f.sql);
    await client.query("insert into ops.schema_migrations (name, sha256) values ($1, $2)", [f.name, h]);
    await client.query("commit");
    ran++;
    console.log(`${flags.has("--baseline") ? "recorded" : "applied"} ${f.name}`);
  } catch (e) {
    await client.query("rollback");
    console.error(`failed ${f.name}: ${e.message}`);
    process.exit(1);
  }
}

// The app connects as `authenticator`; on a self-hosted database its password comes from the
// environment, never the shim's development default.
if (!flags.has("--dry-run")) {
  const pw = process.env.AUTHENTICATOR_PASSWORD;
  if (pw) await client.query(`alter role authenticator with password ${client.escapeLiteral(pw)}`);
  else if (flags.has("--self-hosted")) { console.error("AUTHENTICATOR_PASSWORD is required with --self-hosted"); process.exit(1); }
}

if (flags.has("--seed-demo") && !flags.has("--dry-run")) {
  const { rows } = await client.query("select count(*)::int as n from platform.donors");
  if (rows[0].n > 0) { console.error("refusing to seed: the database already has donors"); process.exit(1); }
  for (const f of files("supabase/seed")) { await client.query(f.sql); console.log(`seeded ${f.name}`); }
}

console.log(`migrations: ${ran} applied, ${plan.length - ran} already present`);
await client.end();
