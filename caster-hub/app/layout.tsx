import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CasterHub - Global Radio Charts & Broadcast Network",
  description: "Live broadcast intelligence, air-time stats, and crowd-sourced radio charts for radio casters.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="bg-carbon text-[#F4F4F6] min-h-screen antialiased selection:bg-amberSignal selection:text-carbon">
        {children}
      </body>
    </html>
  );
}
