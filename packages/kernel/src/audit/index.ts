import { createHash } from "node:crypto";

/**
 * Recomputes the per-tenant hash chain from rows read back (R-095). Mirrors
 * kernel.audit_chain() so an external verifier needs no database function.
 */
export type AuditRow = { id: number; tenant_id: string; at: string; actor: string | null; action: string; entity_kind: string; entity_id: string | null; before: unknown; after: unknown; prev_hash: string; hash: string };

export function verifyChain(rows: AuditRow[], pgText: (r: AuditRow) => { at: string; before: string; after: string }): { ok: true } | { ok: false; brokenAt: number } {
  let prev = "genesis";
  for (const r of rows) {
    const t = pgText(r);
    const h = createHash("sha256").update(`${prev}|${r.tenant_id}|${t.at}|${r.actor ?? ""}|${r.action}|${r.entity_kind}|${r.entity_id ?? ""}|${t.before}|${t.after}`).digest("hex");
    if (r.prev_hash !== prev || r.hash !== h) return { ok: false, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true };
}
