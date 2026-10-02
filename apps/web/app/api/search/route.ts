import { queries } from "@wbl/services";
import { asUser, getSession } from "@/lib/auth";

/* R-099: instant search, permission-scoped by RLS. */
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json([], { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const hits = await asUser((ctx) => queries.search(ctx, q.slice(0, 100)), { readOnly: true });
  return Response.json(hits);
}
