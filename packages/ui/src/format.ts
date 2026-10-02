/** Western digits with thousands separators (D-11). Amounts are stored in halalas. */
export function formatMoney(halalas: number, withCurrency = true): string {
  const riyals = halalas / 100;
  const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: Number.isInteger(riyals) ? 0 : 2 }).format(riyals);
  return withCurrency ? `${s} ريال` : s;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

const RIYADH = "Asia/Riyadh";

/** Gregorian date in Arabic month names with Western digits, Riyadh time. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: RIYADH, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: RIYADH, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Umm al-Qura Hijri date (N-13). */
export function formatHijri(iso: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { timeZone: RIYADH, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

/** Both calendars, as an official document shows them (N-13). */
export function formatDualDate(iso: string): string {
  return `${formatHijri(iso)} الموافق ${formatDate(iso)}`;
}
