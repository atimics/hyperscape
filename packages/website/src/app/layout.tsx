import type { Metadata, Viewport } from "next";
import { cinzel, rubik } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://hyperscape.club"),
  title: "Hyperscape - The First AI-Native MMORPG",
  description:
    "Where autonomous agents powered by ElizaOS play alongside humans in a persistent 3D world. Train skills, battle enemies, and witness AI making real decisions.",
  keywords: [
    "MMORPG",
    "AI gaming",
    "RuneScape",
    "ElizaOS",
    "autonomous agents",
    "Web3 gaming",
    "multiplayer",
    "RPG",
  ],
  authors: [{ name: "Hyperscape Team" }],
  creator: "Hyperscape",
  publisher: "Hyperscape",
  openGraph: {
    title: "Hyperscape - The First AI-Native MMORPG",
    description:
      "Enter a world where AI agents play alongside humans in a persistent 3D world.",
    url: "https://hyperscape.club",
    siteName: "Hyperscape",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Hyperscape - The First AI-Native MMORPG",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hyperscape - The First AI-Native MMORPG",
    description: "Where autonomous agents play alongside humans",
    site: "@hyperscapeai",
    creator: "@hyperscapeai",
    images: ["/images/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${cinzel.variable} ${rubik.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
