import "server-only";
import { DomainError } from "@wbl/domain";
import { DbError } from "@wbl/kernel";
import { t } from "./i18n";

/** Server actions return a result instead of throwing raw errors to the client. Messages are Arabic. */
export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; details?: unknown };

export function toMessage(e: unknown): string {
  if (e instanceof DomainError) {
    const known = t(`errors.${e.code}`);
    if (!known.startsWith("errors.")) return known;
    const msg = e.message.includes(": ") ? e.message.split(": ").slice(1).join(": ") : e.message;
    return /[؀-ۿ]/.test(msg) ? msg : t("errors.generic");
  }
  if (e instanceof DbError) {
    if (e.isStaleVersion) return t("errors.stale_version");
    if (e.isPermission) return t("errors.forbidden");
    const m = /insufficient_budget/.test(e.message) ? "الرصيد المتاح لا يكفي لحجز هذا المبلغ" : /otp_required/.test(e.message) ? "أدخل رمز التحقق المرسل إلى الرقم الرسمي" : null;
    if (m) return m;
  }
  console.error(JSON.stringify({ level: "error", event: "action_failed", error: String((e as Error)?.message ?? e) }));
  return t("errors.generic");
}

export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    return { ok: false, error: toMessage(e), details: e instanceof DomainError ? e.details : undefined };
  }
}
