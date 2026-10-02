import type { framework } from "@wbl/domain";
import { asAnon } from "@/lib/auth";

/* Public read API (architecture §2 api/v1): the open programmes of this portal, 360Giving-friendly fields. */
export async function GET() {
  const cur = await asAnon((ctx) => ctx.tx.maybe<{ snapshot: framework.FrameworkConfig; number: string }>("select snapshot, number from framework.current_version"));
  const programs = (cur?.snapshot.programs ?? []).filter((p) => p.access === "public").map((p) => ({
    id: p.id, title: p.name, description: p.description, currency: "SAR", amountMax: p.capHalalas / 100, opensAt: p.window.opensAt, closesAt: p.window.closesAt,
    criteria: p.criteria.map((c) => ({ name: c.name, weight: c.weight })), frameworkVersion: cur?.number,
  }));
  return Response.json({ programs });
}
