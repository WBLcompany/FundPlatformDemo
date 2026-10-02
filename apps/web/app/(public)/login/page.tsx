import { PageHeader, TextField } from "@wbl/ui";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { t } from "@/lib/i18n";
import { loginAction } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <PageHeader title={t("auth.title")} description={sp.registered ? t("auth.registered") : undefined} />
      <ActionForm action={loginAction}>
        <TextField label={t("auth.email")} name="email" type="email" autoComplete="username" dir="ltr" required />
        <TextField label={t("auth.password")} name="password" type="password" autoComplete="current-password" dir="ltr" required />
        <SubmitButton>{t("auth.submit")}</SubmitButton>
      </ActionForm>
      <a href="/register" className="text-body-sm text-link underline-offset-4 hover:underline">{t("auth.register")}</a>
    </div>
  );
}
