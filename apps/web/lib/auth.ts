import "server-only";
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { cache } from "react";
import { iam } from "@wbl/domain";
import { loadActor, type Ctx, withPerson } from "@wbl/services";
import { currentPortal } from "./tenant";
import { env, runtime } from "./server";

/**
 * Sessions: a signed, httpOnly cookie carrying {sub, tenant}. Staff must pass a
 * TOTP second factor (architecture §8) before the session is full; idle
 * sessions expire. On Supabase, GoTrue replaces the password check and the
 * claims hook adds the tenant — the rest of the app is unchanged.
 */
const COOKIE = "wbl_session";
const PENDING = "wbl_mfa";
const IDLE_SECONDS = Number(process.env.SESSION_IDLE_SECONDS ?? 60 * 60 * 8);
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-session-secret-change-me-32-bytes!!");

export type Session = { sub: string; tenant: string; staff: boolean };

export function verifyPassword(pw: string, stored: string): boolean {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const salt = Buffer.from(saltB64, "base64").toString();
  const key = scryptSync(pw, salt, 32, { N: Number(n), r: Number(r), p: Number(p) });
  const expected = Buffer.from(keyB64, "base64");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** RFC 6238 TOTP, 30s steps, ±1 step of drift. */
export function totp(secretB32: string, at = Date.now(), step = 0): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretB32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000) + step));
  const h = createHmac("sha1", bytes).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
export function verifyTotp(secretB32: string, code: string) {
  return [-1, 0, 1].some((s) => totp(secretB32, Date.now(), s) === code);
}

async function sign(payload: Record<string, unknown>, seconds: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${seconds}s`).sign(secret());
}
const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });

export type LoginResult = { ok: true; next: "home" | "mfa" } | { ok: false; error: string };
export async function login(email: string, password: string): Promise<LoginResult> {
  const portal = await currentPortal();
  if (!portal) return { ok: false, error: "auth.noPortal" };
  const { db } = runtime();
  const [u] = await db.anon<{ person_id: string; password_hash: string; mfa_secret: string | null; disabled: boolean }>("select * from iam.login_lookup($1)", [email.trim()]);
  if (!u || u.disabled || !verifyPassword(password, u.password_hash)) return { ok: false, error: "auth.invalid" };
  const ms = await db.anon<{ tenant_id: string; role: string }>("select tenant_id, role from iam.login_memberships($1)", [u.person_id]);
  const here = ms.filter((m) => m.tenant_id === portal.id);
  if (!here.length) return { ok: false, error: "auth.invalid" };        // never reveal membership elsewhere
  const staff = here.some((m) => (iam.STAFF_ROLES as readonly string[]).includes(m.role));
  const jar = await cookies();
  if (staff && u.mfa_secret) {
    jar.set(PENDING, await sign({ sub: u.person_id, tenant: portal.id }, 300), cookieOpts(300));
    return { ok: true, next: "mfa" };
  }
  jar.set(COOKIE, await sign({ sub: u.person_id, tenant: portal.id, staff }, IDLE_SECONDS), cookieOpts(IDLE_SECONDS));
  return { ok: true, next: "home" };
}

export async function completeMfa(code: string): Promise<boolean> {
  const jar = await cookies();
  const pending = jar.get(PENDING)?.value;
  if (!pending) return false;
  try {
    const { payload } = await jwtVerify(pending, secret());
    const rows = await runtime().db.anon<{ mfa_secret: string | null }>("select mfa_secret from iam.mfa_for($1)", [payload.sub]);
    const s = rows[0]?.mfa_secret;
    if (!s || !verifyTotp(s, code.trim())) return false;
    jar.delete(PENDING);
    jar.set(COOKIE, await sign({ sub: payload.sub, tenant: payload.tenant, staff: true }, IDLE_SECONDS), cookieOpts(IDLE_SECONDS));
    return true;
  } catch { return false; }
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(PENDING);
}

export const getSession = cache(async (): Promise<Session | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    const portal = await currentPortal();
    // A session minted on one donor's portal is not valid on another's (R-109).
    if (!portal || payload.tenant !== portal.id) return null;
    return { sub: String(payload.sub), tenant: String(payload.tenant), staff: Boolean(payload.staff) };
  } catch { return null; }
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Runs a use case as the signed-in person, in one transaction under their claims. */
export async function asUser<T>(fn: (ctx: Ctx) => Promise<T>, opts?: { readOnly?: boolean }): Promise<T> {
  const s = await requireSession();
  const { db, adapters } = runtime();
  return withPerson(db, s.sub, s.tenant, { adapters, env, now: new Date() }, fn, opts);
}

/** Runs as anon for this portal (public pages, registration). */
export async function asAnon<T>(fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  const portal = await currentPortal();
  if (!portal) throw new Error("no portal");
  const { db, adapters } = runtime();
  return db.session({ role: "anon", tenant_id: portal.id }, (tx) => fn({ tx, adapters, env, now: new Date(), actor: { personId: "anon", tenantId: portal.id, grants: [] } }));
}

export const currentActor = cache(async () => {
  const s = await getSession();
  if (!s) return null;
  const { db } = runtime();
  return db.session({ role: "authenticated", sub: s.sub, tenant_id: s.tenant }, async (tx) => {
    const actor = await loadActor(tx, s.sub, s.tenant);
    const me = await tx.one<{ full_name: string }>("select full_name from iam.persons where id = $1", [s.sub]);
    const donor = await tx.one<{ name: string; ai_enabled: boolean }>("select name, ai_enabled from platform.donors where id = app.tenant()");
    return { actor, name: me.full_name, donor };
  }, { readOnly: true });
});
