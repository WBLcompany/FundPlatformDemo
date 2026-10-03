// Next's standalone output leaves static assets (and public/) outside the bundle; copy them in so
// `.next/standalone` is the whole server — the same tree the container image ships.
import { cpSync, existsSync } from "node:fs";
const out = ".next/standalone/apps/web";
cpSync(".next/static", `${out}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${out}/public`, { recursive: true });
console.log(`standalone assembled: ${out}`);
