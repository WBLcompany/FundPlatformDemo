import { redirect } from "next/navigation";
import { cycleService } from "@wbl/services";
import { EmptyState } from "@wbl/ui";
import { asUser } from "@/lib/auth";
import { toMessage } from "@/lib/actions";
import { orgOf } from "@/lib/vm/portal";

export const dynamic = "force-dynamic";

/* Creates (or reopens) the draft for a programme, pinned to the current framework version, then opens the form. */
export default async function NewApplication({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const { program } = await searchParams;
  let id: string | null = null;
  let error: string | null = null;
  try { id = await asUser((ctx) => cycleService.createDraft(ctx, orgOf(ctx), String(program))); } catch (e) { error = toMessage(e); }
  if (id) redirect(`/portal/applications/${id}/edit`);
  return <div className="mx-auto max-w-xl px-4 py-12"><EmptyState title={error ?? ""} /></div>;
}
