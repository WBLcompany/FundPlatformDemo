import { PoweredBy } from "@wbl/ui";
import { currentPortal } from "@/lib/tenant";
import { t } from "@/lib/i18n";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const portal = await currentPortal();
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-4 py-3">
          <a href="/" className="text-h3 font-bold text-text">{portal?.name ?? t("app.name")}</a>
          <a href="/login" className="ms-auto text-body-sm text-link underline-offset-4 hover:underline">{t("auth.submit")}</a>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer><PoweredBy /></footer>
    </div>
  );
}
