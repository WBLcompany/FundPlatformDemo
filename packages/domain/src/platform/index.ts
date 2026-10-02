/** R-084: what counts as consumption from day one. */
export const USAGE_KINDS = ["application.submitted", "application.completed", "ai.task"] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

/** R-085: a support grant is live only between creation and expiry, and only if not revoked. */
export function supportGrantLive(g: { expiresAt: string; revokedAt: string | null }, now = new Date()): boolean {
  return !g.revokedAt && Date.parse(g.expiresAt) > now.getTime();
}
