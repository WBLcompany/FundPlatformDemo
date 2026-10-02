"use server";
import { queries } from "@wbl/services";
import { asUser } from "@/lib/auth";

export async function saveOrderAction(order: string[]) {
  const allowed = new Set(["decide", "money", "team"]);
  if (order.length !== 3 || !order.every((o) => allowed.has(o))) return;
  await asUser((ctx) => queries.saveHomeOrder(ctx, order));
}
