import { financeService } from "@wbl/services";
import { asUser, getSession } from "@/lib/auth";

/* R-068: the orders export — the same rows and amounts as the records. */
export async function GET() {
  if (!(await getSession())) return new Response("unauthorized", { status: 401 });
  try {
    const r = await asUser((ctx) => financeService.exportOrdersCsv(ctx), { readOnly: true });
    return new Response(r.csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="disbursement-orders.csv"` } });
  } catch { return new Response("forbidden", { status: 403 }); }
}
