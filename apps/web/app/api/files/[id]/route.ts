import { asUser, getSession } from "@/lib/auth";
import { runtime } from "@/lib/server";

/**
 * Downloads go through RLS (kernel.files policy) and are always served as attachments,
 * never rendered inline, with a strict content type (architecture §8).
 * Quarantined or infected files are not served.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await getSession())) return new Response("not found", { status: 404 });
  const f = await asUser((ctx) => ctx.tx.maybe<{ storage_path: string; name: string; mime: string; scan_status: string }>("select storage_path, name, mime, scan_status from kernel.files where id = $1", [id]), { readOnly: true });
  if (!f || f.scan_status !== "clean") return new Response("not found", { status: 404 });
  const body = await runtime().adapters.storage.get(f.storage_path);
  if (!body) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(body), {
    headers: {
      "content-type": f.mime.startsWith("text/html") ? "text/html; charset=utf-8" : f.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
    },
  });
}
