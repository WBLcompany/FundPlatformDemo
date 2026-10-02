import { notFound } from "next/navigation";
import { ProgramPublicView } from "@wbl/ui/views";
import type { framework } from "@wbl/domain";
import { asAnon } from "@/lib/auth";
import { currentPortal } from "@/lib/tenant";
import { programVM } from "@/lib/vm/program";

export const dynamic = "force-dynamic";

/* J1 · N-04: the public programme page — conditions, weighted criteria, FAQ, before registering. */
export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const portal = await currentPortal();
  const cur = await asAnon((ctx) => ctx.tx.maybe<{ snapshot: framework.FrameworkConfig; number: string }>("select snapshot, number from framework.current_version"));
  const p = cur?.snapshot.programs.find((x) => x.id === id && x.access === "public");
  if (!p || !portal) notFound();
  return <ProgramPublicView program={programVM(p, portal.name, cur!.number)} />;
}
