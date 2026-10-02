/**
 * The entity reference resolver (R-097): every mention of an entity becomes
 * {label, href|null}. The href is present only when the viewer's permission
 * allows opening the page; the decision is `can()` on the server, not the UI.
 */
import { iam } from "@wbl/domain";

export type EntityKind = "application" | "association" | "project" | "person" | "grant" | "deliverable" | "disbursement" | "amendment" | "agreement" | "program" | "supplier" | "supplier_order";

export type EntityRefInput = { kind: EntityKind; id: string; label: string; ref?: string; orgId?: string | null; assigneeMembershipId?: string | null };
export type EntityRefOut = { kind: string; id: string; label: string; ref?: string; href: string | null };

const PATHS: Record<EntityKind, (id: string) => string> = {
  application: (id) => `/staff/applications/${id}`,
  association: (id) => `/staff/associations/${id}`,
  project: (id) => `/staff/projects/${id}`,
  person: (id) => `/staff/people/${id}`,
  grant: (id) => `/staff/applications/${id}/rationale`,
  deliverable: (id) => `/staff/deliverables/${id}`,
  disbursement: (id) => `/staff/finance/orders/${id}`,
  amendment: (id) => `/staff/amendments/${id}`,
  agreement: (id) => `/staff/agreements/${id}`,
  program: (id) => `/programs/${id}`,
  supplier: (id) => `/staff/suppliers/${id}`,
  supplier_order: (id) => `/staff/supplier-orders/${id}`,
};
const ASSOC_PATHS: Partial<Record<EntityKind, (id: string) => string>> = {
  application: (id) => `/portal/applications/${id}`,
  project: (id) => `/portal/projects/${id}`,
  program: (id) => `/programs/${id}`,
};

export function resolveRef(viewer: iam.Actor, e: EntityRefInput): EntityRefOut {
  const out = { kind: e.kind, id: e.id, label: e.label, ref: e.ref };
  const staff = iam.isStaff(viewer);
  const res = { tenantId: viewer.tenantId, orgId: e.orgId ?? null, applicationId: e.kind === "application" ? e.id : undefined, assigneeMembershipId: e.assigneeMembershipId ?? null };
  let allowed = false;
  switch (e.kind) {
    case "application": case "grant": allowed = iam.can(viewer, "application.read", res); break;
    case "association": allowed = staff || (!!e.orgId && viewer.grants.some((g) => g.orgId === e.id)); break;
    case "project": case "deliverable": case "agreement": case "amendment": allowed = staff || (!!e.orgId && viewer.grants.some((g) => g.orgId === e.orgId)); break;
    case "disbursement": allowed = iam.can(viewer, "disbursement.view", res); break;
    case "person": allowed = staff; break;
    case "program": allowed = true; break;
    case "supplier": case "supplier_order": allowed = staff || (!!e.orgId && viewer.grants.some((g) => g.orgId === e.orgId)); break;
  }
  if (!allowed) return { ...out, href: null };
  const path = staff ? PATHS[e.kind] : ASSOC_PATHS[e.kind] ?? (e.kind === "supplier_order" ? (id: string) => `/supplier/orders/${id}` : undefined);
  return { ...out, href: path ? path(e.id) : null };
}
