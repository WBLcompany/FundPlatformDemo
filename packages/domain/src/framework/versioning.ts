import { createHash } from "node:crypto";
import type { FrameworkConfig } from "./schema";

/** Canonical JSON (sorted keys) so the same config always hashes the same. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function snapshotHash(config: FrameworkConfig): string {
  return createHash("sha256").update(canonical(config)).digest("hex");
}

/** R-087: readable version numbers YYYY-NN, incrementing within the year. */
export function nextVersionNumber(existing: string[], year: number): string {
  const n = existing.filter((v) => v.startsWith(`${year}-`)).map((v) => Number(v.slice(5))).reduce((a, b) => Math.max(a, b), 0);
  if (n >= 99) throw new Error("version counter exhausted for the year");
  return `${year}-${String(n + 1).padStart(2, "0")}`;
}

/** A human list of what changed between two configs (G4 «ما تغيّر»; R-088 base). */
export function diffConfigs(before: FrameworkConfig | null, after: FrameworkConfig): string[] {
  if (!before) return ["الإصدار الأول للإطار"];
  const changes: string[] = [];
  const bp = new Map(before.programs.map((p) => [p.id, p]));
  for (const p of after.programs) {
    const old = bp.get(p.id);
    if (!old) { changes.push(`إضافة برنامج «${p.name}»`); continue; }
    if (old.capHalalas !== p.capHalalas) changes.push(`سقف «${p.name}»: ${old.capHalalas / 100} ← ${p.capHalalas / 100} ريال`);
    if (canonical(old.criteria) !== canonical(p.criteria)) changes.push(`معايير «${p.name}» وأوزانها`);
    if (canonical(old.eligibility) !== canonical(p.eligibility)) changes.push(`جدول أهلية «${p.name}»`);
    if (canonical(old.form) !== canonical(p.form)) changes.push(`نموذج تقديم «${p.name}»`);
    if (old.approvalChainId !== p.approvalChainId) changes.push(`مسار اعتماد «${p.name}»`);
    if (canonical(old.window) !== canonical(p.window)) changes.push(`فترة التقديم على «${p.name}»`);
  }
  for (const p of before.programs) if (!after.programs.some((x) => x.id === p.id)) changes.push(`إيقاف برنامج «${p.name}»`);
  if (canonical(before.approvalChains) !== canonical(after.approvalChains)) changes.push("سلاسل اعتماد المنح");
  if (canonical(before.disbursementChain) !== canonical(after.disbursementChain)) changes.push("سلسلة اعتماد الصرف");
  if (canonical(before.settings) !== canonical(after.settings)) changes.push("الإعدادات العامة");
  if (canonical(before.catalog) !== canonical(after.catalog)) changes.push("كتالوج البنود");
  if (canonical(before.waqfCategories) !== canonical(after.waqfCategories)) changes.push("مصارف صك الوقفية");
  return changes;
}
