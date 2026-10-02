import { Card, EmptyState, PageHeader, PixelPattern, formatDate, formatMoney } from "@wbl/ui";
import { asAnon } from "@/lib/auth";
import { currentPortal } from "@/lib/tenant";
import { t } from "@/lib/i18n";
import type { framework } from "@wbl/domain";

export const dynamic = "force-dynamic";

export default async function Home() {
  const portal = await currentPortal();
  if (!portal) return <EmptyState title={t("auth.noPortal")} />;
  const cur = await asAnon((ctx) => ctx.tx.maybe<{ snapshot: framework.FrameworkConfig }>("select snapshot from framework.current_version"));
  const programs = (cur?.snapshot.programs ?? []).filter((p) => p.access === "public");
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-8">
      <PageHeader title={t("public.programs")} />
      {programs.length === 0 ? <EmptyState title={t("public.noPrograms")} /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {programs.map((p) => (
            <Card key={p.id} className="flex flex-col gap-3">
              <PixelPattern />
              <h2 className="text-h2 font-bold">{p.name}</h2>
              <p className="text-body text-text-muted">{p.description}</p>
              <p className="text-body-sm"><span className="font-mono">{formatMoney(p.capHalalas)}</span> · {formatDate(p.window.closesAt)}</p>
              <a href={`/programs/${p.id}`} className="self-start text-link underline-offset-4 hover:underline">{t("public.open")}</a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
