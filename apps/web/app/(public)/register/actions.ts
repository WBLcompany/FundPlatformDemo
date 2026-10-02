"use server";
import { orgService } from "@wbl/services";
import { asAnon } from "@/lib/auth";
import { run } from "@/lib/actions";

/* J2 / J3 · R-009 R-010 R-011: registration runs as anon for this portal. */
export async function lookupAction(license: string) {
  return asAnon((ctx) => orgService.lookupLicense(ctx, license));
}
export async function startOtpAction(license: string) {
  return run(() => asAnon((ctx) => orgService.startRegistrationOtp(ctx, license)));
}
export async function verifyOtpAction(otpId: string, code: string) {
  return asAnon((ctx) => orgService.verifyOtp(ctx, otpId, "registration", code));
}
export async function completeAction(input: { license: string; otpId: string | null; via: "otp" | "letter"; fullName: string; email: string; phone: string; password: string; letterFileId?: string | null }) {
  return run(() => asAnon((ctx) => orgService.completeRegistration(ctx, input)));
}
