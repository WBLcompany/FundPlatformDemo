/**
 * R-024 / R-026 / N-08: automatic assignment — first the specialists configured
 * for the programme (all specialists if none are), then the lightest open load.
 * The absent and anyone who declared a conflict are excluded. Ties break on the
 * membership id so the result is deterministic.
 */
export type Candidate = { membershipId: string; personId: string; openLoad: number; absentFrom?: string | null; absentUntil?: string | null; active: boolean };

export function isAbsent(c: Candidate, today: string): boolean {
  return !!c.absentFrom && c.absentFrom <= today && (!c.absentUntil || today <= c.absentUntil);
}

export function pickAssignee(input: {
  candidates: Candidate[];
  programSpecialists?: string[]; // membership ids configured for the programme
  conflicted?: string[];         // membership ids with a COI declaration on this application
  exclude?: string[];            // e.g. the current holder during a reassignment
  today: string;
}): Candidate | null {
  const pool0 = input.candidates.filter((c) => c.active && !isAbsent(c, input.today) && !(input.conflicted ?? []).includes(c.membershipId) && !(input.exclude ?? []).includes(c.membershipId));
  const scoped = input.programSpecialists?.length ? pool0.filter((c) => input.programSpecialists!.includes(c.membershipId)) : pool0;
  const pool = scoped.length ? scoped : pool0;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => a.openLoad - b.openLoad || a.membershipId.localeCompare(b.membershipId))[0]!;
}

/** R-028: performance windows count only the time a person actually held an item. */
export type CustodySpan = { membershipId: string; from: string; to: string | null };
export function heldDuring(spans: CustodySpan[], membershipId: string, at: string): boolean {
  return spans.some((s) => s.membershipId === membershipId && s.from <= at && (s.to === null || at < s.to));
}

/** R-029: an account with open custody cannot be deactivated. */
export function canDeactivate(openItems: number): { ok: boolean; reason?: string } {
  return openItems === 0 ? { ok: true } : { ok: false, reason: `في عهدته ${openItems} عنصراً مفتوحاً. رحّلها أولاً.` };
}
