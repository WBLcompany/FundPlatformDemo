"use client";
import { useState, useTransition, type ReactNode } from "react";
import { saveOrderAction } from "./actions";

type K = "decide" | "money" | "team";
/** R-082: the executive's personal order, saved per person. */
export function OrderClient({ initial, children }: { initial: K[]; children: (order: K[], set: (o: K[]) => void) => ReactNode }) {
  const [order, setOrder] = useState(initial);
  const [, start] = useTransition();
  return <>{children(order, (o) => { setOrder(o); start(() => { void saveOrderAction(o); }); })}</>;
}
