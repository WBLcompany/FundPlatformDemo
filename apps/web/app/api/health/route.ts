import { runtime } from "@/lib/server";

export async function GET() {
  try {
    await runtime().db.anon("select 1 as ok");
    return Response.json({ ok: true });
  } catch { return Response.json({ ok: false }, { status: 503 }); }
}
