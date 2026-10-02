import { handleManihWebhook } from "@wbl/services";
import { env, runtime } from "@/lib/server";

/* docs/manih-contract.md §4: signed results from Manih. The raw body is verified before parsing. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 2_000_000) return Response.json({ error: "too_large" }, { status: 413 });
  const { db, adapters } = runtime();
  const r = await handleManihWebhook(db, adapters, env, raw, { signature: req.headers.get("x-manih-signature"), timestamp: req.headers.get("x-manih-timestamp") });
  return Response.json(r.body, { status: r.status });
}
