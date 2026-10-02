import { t } from "@/lib/i18n";
import { RegisterFlow } from "./RegisterFlow";

export default function RegisterPage() {
  return <RegisterFlow labels={{ title: t("auth.createAccount"), fullName: t("auth.fullName"), email: t("auth.email"), phone: t("auth.phone"), password: t("auth.password"), passwordHint: t("auth.passwordHint"), create: t("auth.createAccount"), registered: t("auth.registered") }} />;
}
