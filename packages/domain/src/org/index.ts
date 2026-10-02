export { documentState } from "../cycle/readiness";

/** R-017: documents to remind about (N days before) and to drop from readiness (on the day). */
export function expiryActions(docs: Array<{ id: string; expiryDate: string | null; reminded: boolean }>, today: string, remindDays: number) {
  const remind: string[] = [];
  const expired: string[] = [];
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + remindDays);
  const h = horizon.toISOString().slice(0, 10);
  for (const d of docs) {
    if (!d.expiryDate) continue;
    if (d.expiryDate === today) expired.push(d.id);
    else if (!d.reminded && d.expiryDate > today && d.expiryDate <= h) remind.push(d.id);
  }
  return { remind, expired };
}

/** Masks an official phone/email for display before verification (J2/J3). */
export function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  return digits.length < 4 ? "••••" : `+${digits.slice(0, 3)} ${digits.slice(3, 4)}• ••• ••${digits.slice(-2)}`;
}
export function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!u || !d) return "•••";
  return `${u[0]}•••@${d}`;
}

/** Saudi NCNP licence numbers are digits; registry lookups never see anything else. */
export function normalizeLicense(s: string): string | null {
  const t = s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\s+/g, "");
  return /^\d{1,10}$/.test(t) ? t : null;
}
