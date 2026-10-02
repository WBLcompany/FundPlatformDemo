import { execFileSync } from "node:child_process";
import path from "node:path";

/* A fresh local database before the web server and worker start. */
export default function globalSetup() {
  const root = path.resolve(import.meta.dirname, "../../..");
  execFileSync("node", [path.join(root, "scripts/db.mjs"), "reset"], { stdio: "inherit", env: { ...process.env, DB_NAME: "grants_e2e" } });
}
