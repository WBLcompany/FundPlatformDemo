"use client";
import { useState, useTransition, type ComponentProps } from "react";
import { ExecutiveHomeView } from "@wbl/ui/views";
import { saveOrderAction } from "./actions";

type Props = ComponentProps<typeof ExecutiveHomeView>;
type K = Props["order"][number];
/** R-082: the executive's home in their personal order, saved per person. Takes data only: a
 * function cannot cross from the server page into a client component. */
export function OrderClient({ initial, decide, money, team }: { initial: K[] } & Omit<Props, "order" | "onReorder">) {
  const [order, setOrder] = useState(initial);
  const [, start] = useTransition();
  return <ExecutiveHomeView order={order} decide={decide} money={money} team={team}
    onReorder={(o) => { setOrder(o); start(() => { void saveOrderAction(o); }); }} />;
}
