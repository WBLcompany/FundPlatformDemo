import { t } from "@/lib/i18n";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: t("app.name"), robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
