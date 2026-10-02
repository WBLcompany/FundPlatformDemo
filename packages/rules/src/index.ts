/**
 * Decision tables in the manner of DMN (D-05), evaluated by a pure function.
 * Eligibility, caps, duplication and disbursement blockers are tables, never
 * model calls (invariant 8). Every evaluation returns its trace — which rule
 * matched and the actual fact values it compared — so a refusal can always
 * say why ("أثر التطابق").
 */

export type Op = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "notIn" | "exists" | "missing" | "between" | "contains";

export type Condition = { field: string; op: Op; value?: unknown; valueFrom?: string };

export type Rule<O> = {
  id: string;
  when: Condition[]; // all must hold (AND); an empty list always matches
  then: O;
  reason?: string; // human-readable (Arabic) explanation shown to the user
};

export type HitPolicy = "FIRST" | "COLLECT" | "ANY";

export type DecisionTable<O> = {
  id: string;
  name: string;
  hitPolicy: HitPolicy;
  rules: Rule<O>[];
  default?: O;
};

export type Facts = Record<string, unknown>;

export type ConditionTrace = { field: string; op: Op; expected: unknown; actual: unknown; held: boolean };
export type Match<O> = { ruleId: string; outcome: O; reason?: string; conditions: ConditionTrace[] };
export type Evaluation<O> = { tableId: string; matches: Match<O>[]; outcomes: O[]; usedDefault: boolean };

/** Reads "a.b.c" from nested facts. */
export function getPath(facts: Facts, path: string): unknown {
  let cur: unknown = facts;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function cmp(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "bigint" || typeof b === "bigint") {
    try { const x = BigInt(a as never), y = BigInt(b as never); return x === y ? 0 : x < y ? -1 : 1; } catch { return null; }
  }
  if (typeof a === "string" && typeof b === "string") {
    // ISO dates and plain strings both order lexicographically.
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return null;
}

export function holds(c: Condition, facts: Facts): ConditionTrace {
  const actual = getPath(facts, c.field);
  const expected = c.valueFrom ? getPath(facts, c.valueFrom) : c.value;
  let held = false;
  switch (c.op) {
    case "exists": held = actual !== undefined && actual !== null && actual !== ""; break;
    case "missing": held = actual === undefined || actual === null || actual === ""; break;
    case "eq": held = actual === expected; break;
    case "ne": held = actual !== expected; break;
    case "in": held = Array.isArray(expected) && expected.includes(actual); break;
    case "notIn": held = Array.isArray(expected) && !expected.includes(actual); break;
    case "contains": held = Array.isArray(actual) && actual.includes(expected); break;
    case "between": {
      const [lo, hi] = Array.isArray(expected) ? expected : [];
      const a = cmp(actual, lo), b = cmp(actual, hi);
      held = a !== null && b !== null && a >= 0 && b <= 0;
      break;
    }
    default: {
      const r = cmp(actual, expected);
      if (r === null) { held = false; break; }
      held = c.op === "lt" ? r < 0 : c.op === "lte" ? r <= 0 : c.op === "gt" ? r > 0 : r >= 0;
    }
  }
  return { field: c.field, op: c.op, expected, actual, held };
}

export function evaluate<O>(table: DecisionTable<O>, facts: Facts): Evaluation<O> {
  const matches: Match<O>[] = [];
  for (const rule of table.rules) {
    const conditions = rule.when.map((c) => holds(c, facts));
    if (conditions.every((t) => t.held)) {
      matches.push({ ruleId: rule.id, outcome: rule.then, reason: rule.reason, conditions });
      if (table.hitPolicy === "FIRST") break;
    }
  }
  if (table.hitPolicy === "ANY" && matches.length > 1) {
    const first = JSON.stringify(matches[0]!.outcome);
    if (matches.some((m) => JSON.stringify(m.outcome) !== first)) {
      throw new Error(`decision table ${table.id}: ANY hit policy produced conflicting outcomes`);
    }
  }
  const usedDefault = matches.length === 0 && table.default !== undefined;
  const outcomes = usedDefault ? [table.default as O] : matches.map((m) => m.outcome);
  return { tableId: table.id, matches, outcomes, usedDefault };
}

/** Static validation used when a framework version is approved: unknown ops and empty ids are refused. */
export function validateTable<O>(table: DecisionTable<O>): string[] {
  const errors: string[] = [];
  const ops: Op[] = ["eq", "ne", "lt", "lte", "gt", "gte", "in", "notIn", "exists", "missing", "between", "contains"];
  const ids = new Set<string>();
  if (!table.id) errors.push("table id is required");
  for (const r of table.rules) {
    if (!r.id) errors.push("rule id is required");
    if (ids.has(r.id)) errors.push(`duplicate rule id ${r.id}`);
    ids.add(r.id);
    for (const c of r.when) {
      if (!ops.includes(c.op)) errors.push(`rule ${r.id}: unknown op ${String(c.op)}`);
      if (!c.field) errors.push(`rule ${r.id}: condition without field`);
      if ((c.op === "in" || c.op === "notIn" || c.op === "between") && c.valueFrom === undefined && !Array.isArray(c.value)) errors.push(`rule ${r.id}: ${c.op} needs an array`);
    }
  }
  return errors;
}

/** Convenience for "refusal" tables: each matched rule is a reason the subject fails. */
export type Verdict = { pass: boolean; reasons: Array<{ ruleId: string; reason: string; trace: ConditionTrace[] }> };
export function refusals(table: DecisionTable<{ refuse: true }>, facts: Facts): Verdict {
  const ev = evaluate({ ...table, hitPolicy: "COLLECT" }, facts);
  const reasons = ev.matches.map((m) => ({ ruleId: m.ruleId, reason: m.reason ?? m.ruleId, trace: m.conditions }));
  return { pass: reasons.length === 0, reasons };
}
