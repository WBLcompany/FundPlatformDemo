import "server-only";
import { cycle, framework } from "@wbl/domain";
import { currentVersion, orgService, type Ctx } from "@wbl/services";
import type { ApplicationRow, DocumentVM, ReadinessItem } from "@wbl/ui/views";
import { appTone } from "./status";

export function orgOf(ctx: Ctx): string {
  const g = ctx.actor.grants.find((x) => x.orgId);
  if (!g?.orgId) throw new Error("no association");
  return g.orgId;
}

export async function portalHome(ctx: Ctx) {
  const org = orgOf(ctx);
  const cfg = (await currentVersion(ctx.tx)).config;
  const assoc = await ctx.tx.one<{ name: string }>("select name from org.associations where id = $1", [org]);
  const r = await orgService.readiness(ctx, org);
  const docs = await orgService.associationDocuments(ctx, org);
  const apps = await ctx.tx.query<{ id: string; ref: string | null; title: string; status: cycle.ApplicationStatus; requested_halalas: number | null; program_id: string }>(
    "select id, ref, title, status, requested_halalas, program_id from cycle.applications where association_id = $1 order by created_at desc", [org]);
  const invitations = await ctx.tx.query<{ id: string; program_id: string; deadline: string; status: string }>("select id, program_id, deadline, status from cycle.invitations where association_id = $1 and status = 'sent'", [org]);
  const amendments = await ctx.tx.query<{ id: string; project_id: string; justification: string }>(
    "select a.id, a.project_id, a.justification from project.amendments a join project.projects p on p.tenant_id = a.tenant_id and p.id = a.project_id where p.association_id = $1 and a.status = 'awaiting_signatory'", [org]);
  // «ينتظر إجراءك»: everything the association has to act on, each with the page that does it.
  const agreementsToSign = await ctx.tx.query<{ id: string; ref: string | null }>(
    "select g.id, a.ref from project.agreements g join cycle.applications a on a.tenant_id = g.tenant_id and a.id = g.application_id where a.association_id = $1 and g.status = 'issued'", [org]);
  const deliverablesDue = await ctx.tx.query<{ id: string; label: string; due_date: string; status: string }>(
    "select d.id, d.label, d.due_date::text, d.status from project.deliverables d join project.projects p on p.tenant_id = d.tenant_id and p.id = d.project_id where p.association_id = $1 and d.status in ('pending','returned') and p.status = 'active' order by d.due_date limit 5", [org]);
  const todo: Array<{ id: string; key: string; params: Record<string, string>; href: string }> = [
    ...apps.filter((a) => a.status === "awaiting_info").map((a) => ({ id: `info-${a.id}`, key: "todo.info", params: { ref: a.ref ?? "" }, href: `/portal/applications/${a.id}` })),
    ...agreementsToSign.map((g) => ({ id: `agr-${g.id}`, key: "todo.sign", params: { ref: g.ref ?? "" }, href: `/portal/agreements/${g.id}` })),
    ...deliverablesDue.map((d) => ({ id: `del-${d.id}`, key: d.status === "returned" ? "todo.deliverableReturned" : "todo.deliverable", params: { label: d.label, date: d.due_date }, href: `/portal/deliverables/${d.id}` })),
  ];
  const now = new Date();
  const programs = cfg.programs.filter((p) => (p.access === "public" || invitations.some((i) => i.program_id === p.id)) && cycle.programIsOpen(p, now));
  const labels = Object.fromEntries(cfg.documentTypes.map((d) => [d.key, d.label]));
  return {
    org, name: assoc.name, cfg,
    readiness: r.items.map((i): ReadinessItem => ({ key: i.key, label: i.label, ok: i.ok, reason: i.reason, actionHref: i.documentType ? "/portal/documents" : null, actionLabel: i.documentType ? "ارفع الوثيقة" : undefined })),
    programs: programs.map((p) => ({ id: p.id, name: p.name, closesAt: p.window.closesAt, href: `/portal/applications/new?program=${p.id}` })),
    applications: apps.map((a): ApplicationRow => ({ id: a.id, ref: a.ref ?? "مسودة", title: a.title || "—", association: { kind: "association", id: org, label: assoc.name }, program: cfg.programs.find((p) => p.id === a.program_id)?.name ?? "", stage: cycle.ASSOCIATION_STAGE[a.status].label, stageTone: appTone[a.status] ?? "neutral", requestedHalalas: a.requested_halalas ?? 0, href: a.status === "draft" ? `/portal/applications/${a.id}/edit` : `/portal/applications/${a.id}` })),
    documents: docs.map((d): DocumentVM => ({ id: d.id, type: labels[d.doc_type] ?? d.doc_type, number: d.number ?? undefined, expiresAt: d.expiry_date, state: d.state, fileName: d.file_name ?? "" })),
    invitations, amendments, todo,
  };
}
export type { framework };
