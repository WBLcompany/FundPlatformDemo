/** Money is integer halalas everywhere (invariant 6). */
export type Halalas = number;
export const riyals = (r: number): Halalas => Math.round(r * 100);
export function assertHalalas(n: number): Halalas {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`invalid halalas amount: ${n}`);
  return n;
}

export class DomainError extends Error {
  constructor(public readonly code: string, message?: string, public readonly details?: unknown) {
    super(message ? `${code}: ${message}` : code);
    this.name = "DomainError";
  }
}

/** Distributes an amount across percentages so the parts sum exactly to the total (last part absorbs rounding). */
export function splitByPercent(total: Halalas, percents: number[]): Halalas[] {
  const sum = percents.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 1e-9) throw new DomainError("percent_sum", "percentages must total 100");
  const parts = percents.map((p) => Math.floor((total * p) / 100));
  const diff = total - parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1]! += diff;
  return parts;
}
