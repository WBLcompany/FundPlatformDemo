"use server";
import { redirect } from "next/navigation";
import { completeMfa, login } from "@/lib/auth";
import { t } from "@/lib/i18n";

export async function loginAction(_: unknown, fd: FormData) {
  const r = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (!r.ok) return { ok: false, error: t(r.error) };
  redirect(r.next === "mfa" ? "/login/mfa" : "/home");
}

export async function mfaAction(_: unknown, fd: FormData) {
  if (!(await completeMfa(String(fd.get("code") ?? "")))) return { ok: false, error: t("auth.mfaInvalid") };
  redirect("/home");
}
