import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { runtime } from "./server";

/**
 * R-109: the donor is decided by the host (almulhi.example.sa → «almulhi»), never by
 * the request body. Locally, almulhi.localhost works; plain localhost falls back to
 * DEFAULT_PORTAL. The value is a selector for app.tenant(), which re-checks it.
 */
export type Portal = { id: string; name: string; slug: string; subdomain: string; status: string };

export function subdomainOf(host: string | null): string | null {
  if (!host) return null;
  const h = host.split(":")[0]!.toLowerCase();
  const base = (process.env.PORTAL_BASE_DOMAIN ?? "localhost").toLowerCase();
  if (h === base || h === "127.0.0.1") return null;
  if (h.endsWith(`.${base}`)) return h.slice(0, -(base.length + 1)).split(".").pop() ?? null;
  return null;
}

export const currentPortal = cache(async (): Promise<Portal | null> => {
  const h = await headers();
  const sub = subdomainOf(h.get("x-forwarded-host") ?? h.get("host")) ?? process.env.DEFAULT_PORTAL ?? "almulhi";
  if (sub === (process.env.OPERATOR_SUBDOMAIN ?? "ops")) return null;
  const rows = await runtime().db.anon<{ id: string; name: string; slug: string; status: string }>("select * from platform.resolve_portal($1)", [sub]);
  return rows[0] ? { ...rows[0], subdomain: sub } : null;
});
