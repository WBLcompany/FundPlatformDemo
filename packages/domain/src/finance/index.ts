import { DomainError, splitByPercent, type Halalas } from "../shared";

/**
 * R-063: blockers are checked before an order becomes executable. A deterministic
 * list, each with the reason shown to finance and to whoever owns the fix.
 */
export type BlockerInput = {
  associationSuspended: boolean;
  essentialDocsExpired: string[];   // labels
  bankAccountAcknowledged: boolean;
  projectSuspended: boolean;
  priorReceiptOverdue: boolean;
};
export type Blocker = { key: string; label: string; owner: "association" | "finance" | "specialist" };

export function disbursementBlockers(i: BlockerInput): Blocker[] {
  const b: Blocker[] = [];
  if (i.associationSuspended) b.push({ key: "association_suspended", label: "تعاملات الجمعية موقوفة", owner: "association" });
  for (const d of i.essentialDocsExpired) b.push({ key: `doc_expired:${d}`, label: `وثيقة منتهية: ${d}`, owner: "association" });
  if (!i.bankAccountAcknowledged) b.push({ key: "bank_unacknowledged", label: "الحساب البنكي لم تقرّه المالية", owner: "finance" });
  if (i.projectSuspended) b.push({ key: "project_suspended", label: "المشروع معلّق", owner: "specialist" });
  if (i.priorReceiptOverdue) b.push({ key: "receipt_overdue", label: "مستند استلام دفعة سابقة متأخر", owner: "association" });
  return b;
}

/** R-050: installments are generated from the approved schedule and must sum to the approved amount. */
export type ScheduleLine = { label: string; percent: number; condition: "signature" | "deliverable" | "final_report"; deliverable?: { label: string; dueOffsetDays: number } };
export function buildInstallments(approved: Halalas, schedule: ScheduleLine[], finalRule?: { enabled: boolean; minPercent: number }) {
  if (!schedule.length) throw new DomainError("empty_schedule");
  const amounts = splitByPercent(approved, schedule.map((s) => s.percent));
  if (finalRule?.enabled) {
    const last = schedule[schedule.length - 1]!;
    if (last.condition !== "final_report") throw new DomainError("final_installment_required", "آخر دفعة يجب أن تُربط بالتقرير الختامي");
    if (last.percent < finalRule.minPercent) throw new DomainError("final_installment_too_small", `الدفعة الختامية أقل من ${finalRule.minPercent}%`);
  }
  return schedule.map((s, i) => ({ seq: i + 1, label: s.label, amountHalalas: amounts[i]!, condition: s.condition, deliverable: s.deliverable }));
}

/** R-073: a project closes only when every halala is accounted for. */
export function closureCheck(approved: Halalas, disbursed: Halalas, spent: Halalas, unspentDisposition: string | null): string[] {
  const reasons: string[] = [];
  if (disbursed > approved) reasons.push("المصروف يتجاوز المعتمد");
  const unspent = disbursed - spent;
  if (unspent > 0 && !unspentDisposition) reasons.push(`مبلغ غير مصروف (${unspent / 100} ريال) لم يُحسم مصيره`);
  if (spent > disbursed) reasons.push("المصروف المُبلَّغ يتجاوز المحوَّل");
  return reasons;
}

/** IBAN validation (ISO 13616, Saudi format) — before an account change is accepted (R-070). */
export function validSaudiIban(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^SA\d{22}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_checks: "بانتظار الفحص", blocked: "موقوف بمانع", in_approval: "في الاعتماد", ready: "بانتظار التنفيذ",
  returned: "مُرجَع", executed: "نُفّذ", suspended: "معلّق",
};
