import { queries } from "@wbl/services";
import { MyTasksView } from "@wbl/ui/views";
import { asUser } from "@/lib/auth";
import { dueLabel } from "@/lib/vm/status";

/* S1 · R-077: «مهامي» — the entry point for every staff role. */
export default async function Tasks() {
  const tasks = await asUser((ctx) => queries.myTasks(ctx), { readOnly: true });
  return <MyTasksView tasks={tasks.map((t) => ({
    id: t.id, kind: t.kind, title: t.title, entity: t.entity, href: t.href,
    whatYouNeedToDo: { status: "plain", value: t.whatToDo },
    dueLabel: t.due ? dueLabel(t.due) : "—", dueTone: t.tone === "neutral" ? "neutral" : t.tone,
  }))} />;
}
