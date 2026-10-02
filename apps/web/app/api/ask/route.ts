import { semantic, currentVersion } from "@wbl/services";
import { asUser, getSession } from "@/lib/auth";

/* R-100 / N-06: a natural-language question, answered from the semantic layer — never guessed. */
export async function POST(req: Request) {
  if (!(await getSession())) return Response.json({ kind: "not_understood" }, { status: 401 });
  const { q } = (await req.json().catch(() => ({}))) as { q?: string };
  if (!q || q.length > 300) return Response.json({ kind: "not_understood" });
  try {
    const r = await asUser(async (ctx) => {
      const cfg = (await currentVersion(ctx.tx)).config;
      return semantic.ask(ctx, q, cfg.settings.naturalLanguageRoles);
    }, { readOnly: false });
    return Response.json(r);
  } catch { return Response.json({ kind: "not_understood" }); }
}
