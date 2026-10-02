import { asUser } from "@/lib/auth";
import { currentVersion } from "@wbl/services";
import { DocsClient } from "./DocsClient";

export const dynamic = "force-dynamic";

/* J5 · R-013 N-01: upload → Manih proposes type/number/dates → the association confirms. */
export default async function Documents() {
  const types = await asUser(async (ctx) => (await currentVersion(ctx.tx)).config.documentTypes, { readOnly: true });
  return <DocsClient types={types.map((d) => ({ key: d.key, label: d.label }))} />;
}
