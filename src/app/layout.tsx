import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KlingDom Forge",
  description: "AI video generation studio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
