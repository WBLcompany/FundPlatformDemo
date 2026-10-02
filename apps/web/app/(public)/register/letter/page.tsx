import { createHash, randomUUID } from "node:crypto";
import { PageHeader, TextField } from "@wbl/ui";
import { orgService } from "@wbl/services";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { asAnon } from "@/lib/auth";
import { run } from "@/lib/actions";
import { t } from "@/lib/i18n";
import { uiT } from "@wbl/ui";

/* R-011: registration by an official letter that the donor's staff approve. */
async function letterAction(_: unknown, fd: FormData) {
  "use server";
  const file = fd.get("letter") as File | null;
  return run(async () => {
    if (!file || file.size === 0) throw new Error("letter required");
    return asAnon(async (ctx) => {
      const body = new Uint8Array(await file.arrayBuffer());
      const id = randomUUID();
      const key = `${ctx.actor.tenantId}/letters/${id}`;
      await ctx.adapters.storage.put(key, body, file.type || "application/octet-stream");
      await ctx.tx.query("select kernel.anon_letter_file($1, $2, $3, $4, $5, $6)", [id, key, file.name, file.type || "application/octet-stream", body.length, createHash("sha256").update(body).digest("hex")]);
      return orgService.completeRegistration(ctx, { license: String(fd.get("license")), otpId: null, via: "letter", letterFileId: id, fullName: String(fd.get("fullName")), email: String(fd.get("email")), phone: String(fd.get("phone")), password: String(fd.get("password")) });
    });
  }, t("auth.letterPending"));
}

export default function LetterPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <PageHeader title={uiT("views.register.letterTitle")} description={uiT("views.register.letterIntro")} />
      <ActionForm action={letterAction}>
        <TextField label={uiT("views.register.license")} name="license" dir="ltr" required />
        <label className="flex flex-col gap-1 text-caption font-medium">{uiT("views.register.letterFile")}<input type="file" name="letter" accept=".pdf,.png,.jpg" required /></label>
        <TextField label={t("auth.fullName")} name="fullName" required />
        <TextField label={t("auth.email")} name="email" type="email" dir="ltr" required />
        <TextField label={t("auth.phone")} name="phone" dir="ltr" required />
        <TextField label={t("auth.password")} name="password" type="password" dir="ltr" hint={t("auth.passwordHint")} required />
        <SubmitButton>{uiT("views.register.letterSend")}</SubmitButton>
      </ActionForm>
    </div>
  );
}
