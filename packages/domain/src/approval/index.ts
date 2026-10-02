import { holds } from "@wbl/rules";
import type { ChainConfig } from "../framework";
import { DomainError } from "../shared";

/**
 * The single approval engine (architecture §6, R-042–R-044, R-057, R-064). It
 * receives a subject with facts, keeps only the levels whose activation holds,
 * freezes them, and walks them. Pure: the caller persists the returned state.
 */
export type Level = ChainConfig["levels"][number];
export type ApprovalState = {
  definition: ChainConfig;
  applicable: Level[];
  current: number;           // index into applicable
  status: "open" | "approved" | "rejected" | "returned";
  amountHalalas: number;
  passed: string[];          // level keys already approved
};
export type ApprovalFacts = Record<string, unknown> & { amountHalalas: number };

export function applicableLevels(chain: ChainConfig, facts: ApprovalFacts): Level[] {
  return chain.levels.filter((l) => l.activation.every((c) => holds(c, facts).held));
}

export function openApproval(chain: ChainConfig, facts: ApprovalFacts): ApprovalState {
  const applicable = applicableLevels(chain, facts);
  if (!applicable.length) throw new DomainError("empty_chain", "no applicable approval level");
  return { definition: chain, applicable, current: 0, status: "open", amountHalalas: facts.amountHalalas, passed: [] };
}

export function currentLevel(s: ApprovalState): Level | null {
  return s.status === "open" ? s.applicable[s.current] ?? null : null;
}

/** R-079: is this actor the one the current level is waiting for (primary role, or backup when every primary holder is absent)? */
export function isAwaiting(s: ApprovalState, actorRoles: string[], primaryAvailable = true): boolean {
  const lvl = currentLevel(s);
  if (!lvl) return false;
  if (actorRoles.includes(lvl.role)) return true;
  return !primaryAvailable && !!lvl.backupRole && actorRoles.includes(lvl.backupRole);
}

export type ApprovalAction =
  | { kind: "approve" }
  | { kind: "reject"; note: string }
  | { kind: "return"; note: string }
  | { kind: "modify_amount"; amountHalalas: number; facts: ApprovalFacts };

export function act(s: ApprovalState, action: ApprovalAction): ApprovalState {
  const lvl = currentLevel(s);
  if (!lvl) throw new DomainError("approval_closed");
  switch (action.kind) {
    case "approve": {
      const passed = [...s.passed, lvl.key];
      const next = s.current + 1;
      return next >= s.applicable.length ? { ...s, passed, current: next, status: "approved" } : { ...s, passed, current: next };
    }
    case "reject":
      if (!action.note.trim()) throw new DomainError("note_required");
      return { ...s, status: "rejected" };
    case "return":
      if (!action.note.trim()) throw new DomainError("note_required");
      return { ...s, status: "returned" };
    case "modify_amount": {
      if (!Number.isSafeInteger(action.amountHalalas) || action.amountHalalas < 0) throw new DomainError("bad_amount");
      // Re-evaluate: levels already passed stay passed; remaining levels are whatever now applies (R-057).
      const facts = { ...action.facts, amountHalalas: action.amountHalalas };
      const nowApplicable = applicableLevels(s.definition, facts);
      const done = s.applicable.slice(0, s.current);
      const remaining = nowApplicable.filter((l) => !done.some((d) => d.key === l.key));
      return { ...s, amountHalalas: action.amountHalalas, applicable: [...done, ...remaining], current: done.length };
    }
  }
}

/** The labels of the levels still ahead, for «مسار الاعتماد القادم». */
export function remainingLabels(s: ApprovalState): string[] {
  return s.applicable.slice(s.current).map((l) => l.label);
}
