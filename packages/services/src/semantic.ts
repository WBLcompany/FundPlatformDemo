import type { Ctx } from "./context";
import { authorize, currentVersion } from "./context";
import { runSyncTask } from "./ai";

/**
 * D-09 / R-100: the semantic layer. Manih turns a question into an INTENT
 * (metric + filters + period); the number always comes from this catalogue's
 * SQL, under the asker's RLS, and links to the list it counts. A question the
 * catalogue cannot express is answered «لم أفهم» — never guessed.
 */
type Metric = { label: string; unit: "money" | "count"; sql: string; list: string; filters: Record<string, string> };

const CATALOGUE: Record<string, Metric> = {
  disbursed_total: {
    label: "مجموع الدفعات المنفذة", unit: "money",
    sql: "select coalesce(sum(o.amount_halalas),0)::bigint as v from finance.disbursement_orders o join project.projects p on p.tenant_id = o.tenant_id and p.id = o.project_id where o.status = 'executed' and ($1::timestamptz is null or o.executed_at >= $1) and ($2::text is null or p.waqf_category = $2) and ($3::text is null or p.program_id = $3)",
    list: "/staff/reports/disbursements", filters: { waqf_category: "$2", program_id: "$3" },
  },
  approved_total: {
    label: "مجموع المبالغ المعتمدة", unit: "money",
    sql: "select coalesce(sum(a.approved_halalas),0)::bigint as v from cycle.applications a where a.decision = 'approved' and ($1::timestamptz is null or a.decided_at >= $1) and ($2::text is null or exists (select 1 from project.projects p where p.application_id = a.id and p.waqf_category = $2)) and ($3::text is null or a.program_id = $3)",
    list: "/staff/applications?status=approved", filters: { waqf_category: "$2", program_id: "$3" },
  },
  applications_count: {
    label: "عدد الطلبات", unit: "count",
    sql: "select count(*)::bigint as v from cycle.applications a where a.status <> 'draft' and ($1::timestamptz is null or a.submitted_at >= $1) and ($4::text is null or a.status = $4) and ($3::text is null or a.program_id = $3)",
    list: "/staff/applications", filters: { status: "$4", program_id: "$3" },
  },
  beneficiaries_total: {
    label: "مجموع المستفيدين من التقارير الختامية", unit: "count",
    sql: "select coalesce(sum(f.beneficiaries),0)::bigint as v from project.final_reports f join project.projects p on p.tenant_id = f.tenant_id and p.id = f.project_id where f.status = 'accepted' and ($1::timestamptz is null or f.decided_at >= $1) and ($3::text is null or p.program_id = $3)",
    list: "/staff/reports/outputs", filters: { program_id: "$3" },
  },
};

export type Intent = { metric: string; filters: Record<string, string | number>; period: string | null };

function periodStart(period: string | null, now: Date): string | null {
  if (period === "this_year") return `${new Date(now.getTime() + 3 * 3600_000).getUTCFullYear()}-01-01T00:00:00+03:00`;
  if (period === "this_month") { const d = new Date(now.getTime() + 3 * 3600_000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00+03:00`; }
  return null;
}

/** Executes an intent against the catalogue; refuses anything outside it. */
export async function runIntent(ctx: Ctx, intent: Intent) {
  const m = CATALOGUE[intent.metric];
  if (!m) return null;
  for (const k of Object.keys(intent.filters)) if (!(k in m.filters)) return null;   // unknown filter → no guess
  // Waqf categories arrive as labels; map to keys via the current framework.
  let waqf = intent.filters.waqf_category as string | undefined;
  if (waqf) {
    const cfg = (await currentVersion(ctx.tx)).config;
    waqf = cfg.waqfCategories.find((c) => c.label === waqf || c.key === waqf)?.key;
    if (!waqf) return null;
  }
  const all = [periodStart(intent.period, ctx.now), waqf ?? null, (intent.filters.program_id as string) ?? null, (intent.filters.status as string) ?? null];
  const used = Math.max(...[...m.sql.matchAll(/\$(\d+)/g)].map((x) => Number(x[1])));
  const row = await ctx.tx.one<{ v: number }>(m.sql, all.slice(0, used));
  const qs = new URLSearchParams(Object.entries({ ...intent.filters, ...(intent.period ? { period: intent.period } : {}) }).map(([k, v]) => [k, String(v)])).toString();
  return {
    value: row.v, unit: m.unit, label: m.label,
    understood: [m.label, ...Object.entries(intent.filters).map(([k, v]) => `${k === "waqf_category" ? "المصرف" : k === "program_id" ? "البرنامج" : "الحالة"}: ${v}`), intent.period === "this_year" ? "هذا العام" : intent.period === "this_month" ? "هذا الشهر" : "كل الفترات"].join(" · "),
    listHref: `${m.list}${m.list.includes("?") ? "&" : "?"}${qs}`,
  };
}

/** R-100 / N-06: a question in Arabic → Manih's intent → catalogue SQL. Disabled AI falls back to normal search. */
export async function ask(ctx: Ctx, question: string, naturalLanguageRoles: string[]) {
  authorize(ctx, "query.ask", {}, { naturalLanguageRoles });
  const metrics = Object.entries(CATALOGUE).map(([k, m]) => ({ key: k, label: m.label, filters: Object.keys(m.filters) }));
  const r = await runSyncTask(ctx, { task: "query.interpret", subjectKind: "query", subjectId: ctx.actor.personId, inputs: { question, metrics, roles: ctx.actor.grants.map((g) => g.role) } });
  if (r.status === "disabled") return { kind: "disabled" as const };
  if (!r.output || !("understood" in r.output) || r.output.understood !== true) return { kind: "not_understood" as const };
  const out = r.output as { metric: string; filters: Record<string, string | number>; period: string | null };
  const res = await runIntent(ctx, { metric: out.metric, filters: out.filters, period: out.period });
  return res ? { kind: "answer" as const, ...res } : { kind: "not_understood" as const };
}

export const METRICS = Object.keys(CATALOGUE);
