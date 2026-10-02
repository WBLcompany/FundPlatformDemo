import { refusals, type DecisionTable, type Verdict } from "@wbl/rules";
import type { ProgramConfig } from "../framework/schema";

/** Facts the eligibility table reads. Built by the server from the database, never from the client. */
export type EligibilityFacts = {
  association: { ready: boolean; openApplicationsInProgram: number; licenseValid: boolean; overdueObligations: number; city?: string | null };
  application: { requestedHalalas: number; beneficiaries?: number };
  program: { capHalalas: number; isOpen: boolean; id: string };
};

export function checkEligibility(program: ProgramConfig, facts: EligibilityFacts): Verdict {
  return refusals(program.eligibility as DecisionTable<{ refuse: true }>, facts as unknown as Record<string, unknown>);
}

export function programIsOpen(program: ProgramConfig, now: Date): boolean {
  return Date.parse(program.window.opensAt) <= now.getTime() && now.getTime() <= Date.parse(program.window.closesAt);
}

/** R-020 / R-008: a catalogue request must fit the item's per-association cap and the remaining stock. */
export function checkCatalogRequest(item: { perAssociationMax: number; totalQuantity: number }, qty: number, alreadyRequestedByAssociation: number, alreadyCommittedTotal: number): string[] {
  const reasons: string[] = [];
  if (!Number.isInteger(qty) || qty <= 0) reasons.push("الكمية غير صالحة");
  if (alreadyRequestedByAssociation + qty > item.perAssociationMax) reasons.push("الكمية تتجاوز سقف الجمعية لهذا البند");
  if (alreadyCommittedTotal + qty > item.totalQuantity) reasons.push("الكمية تتجاوز الرصيد المتبقي للبند");
  return reasons;
}
