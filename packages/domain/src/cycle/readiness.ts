/**
 * R-015 / R-016 / R-017: readiness is checked on every submission attempt and
 * reports exactly what is missing. A document stops counting the day it expires.
 */
export type DocFact = { type: string; expiryDate: string | null; confirmed: boolean };
export type ReadinessInput = {
  accountActive: boolean;
  associationStatus: "pending_review" | "active" | "suspended" | "rejected";
  suspendedReason?: string | null;
  documents: DocFact[];
  requiredDocuments: string[];
  documentLabels: Record<string, string>;
  overdueObligations: number;
  noOverdueObligations: boolean;
  programOpen: boolean;
  today: string; // YYYY-MM-DD Riyadh
};
export type ReadinessItem = { key: string; label: string; ok: boolean; reason?: string; documentType?: string };

export function documentState(expiry: string | null, today: string, nearDays = 30): "valid" | "near" | "expired" {
  if (!expiry) return "valid";
  if (expiry < today) return "expired";
  const near = new Date(`${today}T00:00:00Z`);
  near.setUTCDate(near.getUTCDate() + nearDays);
  return expiry <= near.toISOString().slice(0, 10) ? "near" : "valid";
}

export function checkReadiness(i: ReadinessInput): { ready: boolean; items: ReadinessItem[] } {
  const items: ReadinessItem[] = [];
  items.push({ key: "account", label: "الحساب", ok: i.accountActive, reason: i.accountActive ? undefined : "الحساب غير مفعّل بعد" });
  const assocOk = i.associationStatus === "active";
  items.push({
    key: "association", label: "الجمعية", ok: assocOk,
    reason: assocOk ? undefined : i.associationStatus === "suspended" ? `التعاملات موقوفة: ${i.suspendedReason ?? "مستند استلام متأخر"}` : "التسجيل بانتظار مراجعة المانح",
  });
  for (const type of i.requiredDocuments) {
    const label = i.documentLabels[type] ?? type;
    const candidates = i.documents.filter((d) => d.type === type && d.confirmed);
    const valid = candidates.find((d) => documentState(d.expiryDate, i.today) !== "expired");
    if (valid) items.push({ key: `doc:${type}`, label, ok: true, documentType: type });
    else if (candidates.length) items.push({ key: `doc:${type}`, label, ok: false, reason: `انتهت في ${candidates.map((d) => d.expiryDate).sort().at(-1)}`, documentType: type });
    else items.push({ key: `doc:${type}`, label, ok: false, reason: "لم تُرفع بعد", documentType: type });
  }
  if (i.noOverdueObligations) {
    items.push({ key: "obligations", label: "الالتزامات", ok: i.overdueObligations === 0, reason: i.overdueObligations ? `${i.overdueObligations} التزامات متأخرة` : undefined });
  }
  items.push({ key: "program", label: "البرنامج", ok: i.programOpen, reason: i.programOpen ? undefined : "التقديم مغلق" });
  return { ready: items.every((x) => x.ok), items };
}
