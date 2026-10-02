import { z } from "zod";
import { validateTable, type DecisionTable } from "@wbl/rules";

const condition = z.object({
  field: z.string().min(1),
  op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "in", "notIn", "exists", "missing", "between", "contains"]),
  value: z.unknown().optional(),
  valueFrom: z.string().optional(),
});
const refusalTable = z.object({
  id: z.string().min(1),
  name: z.string(),
  hitPolicy: z.literal("COLLECT"),
  rules: z.array(z.object({ id: z.string().min(1), when: z.array(condition), then: z.object({ refuse: z.literal(true) }), reason: z.string().min(1), label: z.string().min(1).optional() })),
});

/** The application form is JSON Schema (a validated subset) with x-step / x-widget hints (architecture §1). */
const formProperty = z.object({
  type: z.enum(["string", "number", "integer"]),
  title: z.string().min(1),
  description: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  maxLength: z.number().int().positive().optional(),
  "x-step": z.number().int().min(1),
  "x-widget": z.enum(["text", "textarea", "money"]).optional(),
  "x-maps-to": z.enum(["title", "requested_amount", "beneficiaries"]).optional(),
});
export const formSchema = z.object({
  type: z.literal("object"),
  required: z.array(z.string()),
  properties: z.record(z.string(), formProperty),
  "x-steps": z.array(z.string().min(1)).min(1),
});

export const criterionSchema = z.object({ key: z.string().min(1), name: z.string().min(1), weight: z.number().int().positive(), max: z.number().int().positive().default(5), description: z.string().optional() });

const level = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  role: z.enum(["grants_manager", "committee_secretary", "executive", "finance", "system_admin", "grants_specialist"]),
  committee: z.boolean().default(false),
  activation: z.array(condition).default([]),   // empty = always applies
  backupRole: z.enum(["grants_manager", "executive", "finance", "system_admin"]).optional(),
});
export const chainSchema = z.object({ id: z.string().min(1), name: z.string().min(1), levels: z.array(level).min(1) });

export const programSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string(),
  type: z.enum(["open_proposal", "catalog_item"]),
  access: z.enum(["public", "invite"]),
  capHalalas: z.number().int().nonnegative(),
  durationMonths: z.number().int().positive(),
  window: z.object({ opensAt: z.string(), closesAt: z.string() }),
  criteria: z.array(criterionSchema).min(1),
  form: formSchema,
  eligibility: refusalTable,
  conditions: z.array(z.string()),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  studyMode: z.enum(["manih_first", "independent"]).optional(),
  approvalChainId: z.string(),
  waqfCategory: z.string().optional(),
  track: z.string().optional(),
  budgetAccount: z.string(),
});

export const configSchema = z.object({
  identity: z.object({ displayName: z.string().min(1), logoPath: z.string().optional() }),
  settings: z.object({
    verification: z.enum(["otp", "otp_or_letter"]).default("otp_or_letter"),
    readiness: z.object({
      requiredDocuments: z.array(z.string()),
      essentialDocuments: z.array(z.string()),
      noOverdueObligations: z.boolean().default(true),
      nearExpiryDays: z.number().int().positive().default(30),
    }),
    assignment: z.object({ method: z.enum(["program_then_load"]).default("program_then_load"), specialistsByProgram: z.record(z.string(), z.array(z.string())).default({}) }),
    studyMode: z.enum(["manih_first", "independent"]).default("manih_first"),
    showRejectionReason: z.boolean().default(false),
    performanceVisibility: z.enum(["internal", "full", "summary"]).default("internal"),
    sla: z.object({
      submitted: z.number().int().positive(), in_review: z.number().int().positive(), awaiting_info: z.number().int().positive(),
      in_approval: z.number().int().positive(), receiptDays: z.number().int().positive(), deliverableReminderDays: z.number().int().positive(),
      signatoryResponseDays: z.number().int().positive(),
    }),
    escalation: z.enum(["notify_only", "notify_and_escalate"]).default("notify_only"),
    reminderChannel: z.enum(["whatsapp", "email"]).default("whatsapp"),
    finalInstallment: z.object({ enabled: z.boolean(), minPercent: z.number().min(0).max(100) }).default({ enabled: true, minPercent: 10 }),
    advanceLimitPercent: z.number().min(0).max(100).optional(),
    naturalLanguageRoles: z.array(z.string()).default(["executive", "grants_manager"]),
  }),
  documentTypes: z.array(z.object({ key: z.string(), label: z.string(), expires: z.boolean() })).min(1),
  programs: z.array(programSchema).min(1),
  approvalChains: z.array(chainSchema).min(1),
  disbursementChain: chainSchema,
  catalog: z.array(z.object({ id: z.string(), name: z.string(), unitHalalas: z.number().int().positive(), totalQuantity: z.number().int().positive(), perAssociationMax: z.number().int().positive(), windowDays: z.number().int().positive() })).default([]),
  waqfCategories: z.array(z.object({ key: z.string(), label: z.string(), targetPercent: z.number().optional() })).default([]),
  budgetAccounts: z.array(z.object({ key: z.string(), name: z.string(), period: z.string() })).min(1),
});

export type FrameworkConfig = z.infer<typeof configSchema>;
export type ProgramConfig = z.infer<typeof programSchema>;
export type FormSchema = z.infer<typeof formSchema>;
export type ChainConfig = z.infer<typeof chainSchema>;
export type Criterion = z.infer<typeof criterionSchema>;

/**
 * Parses and cross-checks a config. Returns the typed config or a list of Arabic-free
 * machine errors (they are shown to an administrator next to the field).
 */
export function validateConfig(input: unknown): { ok: true; config: FrameworkConfig } | { ok: false; errors: string[] } {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const c = parsed.data;
  const errors: string[] = [];
  const chainIds = new Set(c.approvalChains.map((x) => x.id));
  const accounts = new Set(c.budgetAccounts.map((x) => x.key));
  const docKeys = new Set(c.documentTypes.map((d) => d.key));
  const programIds = new Set<string>();
  for (const p of c.programs) {
    if (programIds.has(p.id)) errors.push(`programs.${p.id}: duplicate id`);
    programIds.add(p.id);
    const sum = p.criteria.reduce((s, x) => s + x.weight, 0);
    if (sum !== 100) errors.push(`programs.${p.id}.criteria: weights total ${sum}, must be 100`);
    if (!chainIds.has(p.approvalChainId)) errors.push(`programs.${p.id}.approvalChainId: unknown chain ${p.approvalChainId}`);
    if (!accounts.has(p.budgetAccount)) errors.push(`programs.${p.id}.budgetAccount: unknown account ${p.budgetAccount}`);
    for (const r of p.form.required) if (!(r in p.form.properties)) errors.push(`programs.${p.id}.form: required field ${r} is not defined`);
    for (const [k, prop] of Object.entries(p.form.properties)) if (prop["x-step"] > p.form["x-steps"].length) errors.push(`programs.${p.id}.form.${k}: step out of range`);
    if (!Object.values(p.form.properties).some((x) => x["x-maps-to"] === "requested_amount") && p.type === "open_proposal") errors.push(`programs.${p.id}.form: no field maps to requested_amount`);
    errors.push(...validateTable(p.eligibility as DecisionTable<{ refuse: true }>).map((e) => `programs.${p.id}.eligibility: ${e}`));
    if (Date.parse(p.window.closesAt) <= Date.parse(p.window.opensAt)) errors.push(`programs.${p.id}.window: closes before it opens`);
  }
  for (const d of [...c.settings.readiness.requiredDocuments, ...c.settings.readiness.essentialDocuments]) {
    if (!docKeys.has(d)) errors.push(`settings.readiness: unknown document type ${d}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, config: c };
}
