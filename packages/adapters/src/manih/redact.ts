/**
 * R-112: personal data is masked BEFORE anything leaves the platform. The
 * reverse map stays here; Manih only ever sees placeholders like ⟦PHONE_1⟧.
 * Patterns: Saudi national/iqama ids, phones, IBANs, emails, and names listed
 * explicitly (beneficiary names arrive as a list from the form).
 */
export type Redaction = { text: string; map: Record<string, string> };

const PATTERNS: Array<[string, RegExp]> = [
  ["IBAN", /\bSA\d{2}(?:\s?\d{4}){5}\b|\bSA\d{22}\b/gi],
  ["NATIONAL_ID", /\b[12]\d{9}\b/g],
  ["PHONE", /(?:\+?966|00966|0)?5\d{8}\b/g],
  ["EMAIL", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
];

export function redact(input: string, names: string[] = [], seed: Record<string, string> = {}): Redaction {
  const map: Record<string, string> = { ...seed };
  const reverse = new Map(Object.entries(map).map(([k, v]) => [v, k]));
  const counters: Record<string, number> = {};
  const token = (kind: string, value: string) => {
    const existing = reverse.get(value);
    if (existing) return existing;
    counters[kind] = (counters[kind] ?? Object.keys(map).filter((k) => k.startsWith(`⟦${kind}_`)).length) + 1;
    const t = `⟦${kind}_${counters[kind]}⟧`;
    map[t] = value;
    reverse.set(value, t);
    return t;
  };
  let text = input;
  for (const [kind, re] of PATTERNS) text = text.replace(re, (m) => token(kind, m));
  for (const n of names.filter((x) => x.trim().length > 2).sort((a, b) => b.length - a.length)) {
    text = text.split(n).join(token("NAME", n));
  }
  return { text, map };
}

export function redactDeep<T>(value: T, names: string[] = []): { value: T; map: Record<string, string> } {
  let map: Record<string, string> = {};
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") { const r = redact(v, names, map); map = r.map; return r.text; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(value) as T, map };
}

/** Puts real values back into text that came back from Manih. */
export function restore<T>(value: T, map: Record<string, string>): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replace(/⟦[A-Z_]+_\d+⟧/g, (t) => map[t] ?? t);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}
