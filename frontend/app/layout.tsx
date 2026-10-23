import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Radio Caster Bridge | YouTube Music Studio Streamer & RadioBOSS Controller",
  description:
    "YouTube Music Studio Streamer and Queue Bridge for RadioBOSS Web Remote API.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-theme="black" className={`${plusJakarta.variable}`}>
      <body className="min-h-screen bg-base-100 font-sans text-base-content antialiased">
        {children}
      </body>
    </html>
  );
}
