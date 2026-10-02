import { PageHeader, TextField } from "@wbl/ui";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { t } from "@/lib/i18n";
import { mfaAction } from "../actions";

export default function MfaPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <PageHeader title={t("auth.mfaTitle")} description={t("auth.mfaIntro")} />
      <ActionForm action={mfaAction}>
        <TextField label={t("auth.mfaCode")} name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} required />
        <SubmitButton>{t("auth.mfaSubmit")}</SubmitButton>
      </ActionForm>
    </div>
  );
}
