import { notFound } from "next/navigation";
import { projectService } from "@wbl/services";
import { asUser } from "@/lib/auth";
import { fmtDate } from "@/lib/vm/status";
import { UploadClient } from "./UploadClient";

export const dynamic = "force-dynamic";

/* P2 · R-052: files plus the unified numeric fields. */
export default async function Upload({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await asUser((ctx) => projectService.getDeliverable(ctx, id), { readOnly: true }).catch(() => null);
  if (!d) notFound();
  return <UploadClient id={id} projectId={d.project_id} label={d.label} dueLabel={fmtDate(d.due_date)} done={d.status === "submitted" || d.status === "accepted"} />;
}
