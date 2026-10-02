/**
 * Business days for SLA clocks (R-044): Sunday–Thursday, minus the donor's
 * holiday calendar, counted in Riyadh time. A clock that starts on a weekend
 * starts the next business morning.
 */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // Asia/Riyadh has no DST

function riyadhDate(d: Date): string {
  return new Date(d.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}
function weekday(isoDay: string): number {
  return new Date(`${isoDay}T00:00:00Z`).getUTCDay(); // 0=Sun … 5=Fri, 6=Sat
}
function addDays(isoDay: string, n: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isBusinessDay(isoDay: string, holidays: ReadonlySet<string>): boolean {
  const wd = weekday(isoDay);
  return wd !== 5 && wd !== 6 && !holidays.has(isoDay);
}

/** The due instant: end of the Nth business day after `start` (23:59:59 Riyadh). */
export function addBusinessDays(start: Date, days: number, holidays: ReadonlySet<string> = new Set()): Date {
  if (!Number.isInteger(days) || days < 0) throw new Error("days must be a non-negative integer");
  let day = riyadhDate(start);
  let counted = 0;
  while (counted < days) {
    day = addDays(day, 1);
    if (isBusinessDay(day, holidays)) counted++;
  }
  if (days === 0) while (!isBusinessDay(day, holidays)) day = addDays(day, 1);
  return new Date(new Date(`${day}T23:59:59Z`).getTime() - RIYADH_OFFSET_MS);
}

export function businessDaysBetween(from: Date, to: Date, holidays: ReadonlySet<string> = new Set()): number {
  let day = riyadhDate(from);
  const end = riyadhDate(to);
  let n = 0;
  while (day < end) {
    day = addDays(day, 1);
    if (isBusinessDay(day, holidays)) n++;
  }
  return n;
}

export type DueTone = "active" | "near" | "late";
/** «يقترب» within 1 business day, «متأخر» after the due instant. */
export function dueTone(due: Date, now: Date, holidays: ReadonlySet<string> = new Set()): DueTone {
  if (now.getTime() > due.getTime()) return "late";
  return businessDaysBetween(now, due, holidays) <= 1 ? "near" : "active";
}
