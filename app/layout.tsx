import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BiyoAI",
  description:
    "Biyoloji dersi kaynaklarından soruları cevaplayan öğretim asistanı.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
