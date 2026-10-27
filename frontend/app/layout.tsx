import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radio Caster Bridge | YouTube Music Studio Streamer & RadioBOSS Controller",
  description:
    "YouTube Music Studio Streamer and Queue Bridge for RadioBOSS Web Remote API.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-theme="black">
      <body className="min-h-screen bg-base-100 font-sans text-base-content antialiased selection:bg-primary selection:text-primary-content">
        {children}
      </body>
    </html>
  );
}
