"use client";
import { useParams } from "next/navigation";
import { ScreenFrame } from "@/lib/frame";
import { screens } from "@/lib/screens";

export default function Screen() {
  const { screen } = useParams<{ screen: string }>();
  const id = decodeURIComponent(screen);
  if (!screens.some((s) => s.id === id)) return <p className="p-8">الشاشة غير موجودة.</p>;
  return <ScreenFrame id={id} />;
}
