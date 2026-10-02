import type { framework } from "@wbl/domain";
import type { ProgramVM } from "@wbl/ui/views";

export function programVM(p: framework.ProgramConfig, donorName: string, versionNumber: string, now = new Date()): ProgramVM {
  const isOpen = Date.parse(p.window.opensAt) <= now.getTime() && now.getTime() <= Date.parse(p.window.closesAt);
  return {
    id: p.id, name: p.name, donorName, description: p.description, capHalalas: p.capHalalas, opensAt: p.window.opensAt, closesAt: p.window.closesAt,
    durationMonths: p.durationMonths, conditions: p.conditions, criteria: p.criteria.map((c) => ({ name: c.name, weight: c.weight, description: c.description })),
    faq: p.faq, frameworkVersion: versionNumber, applyHref: isOpen ? `/portal/applications/new?program=${p.id}` : null, isOpen,
  };
}
