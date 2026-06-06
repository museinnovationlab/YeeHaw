import type { Metadata } from "next";
import {
  Bungee,
  Bungee_Shade,
  Space_Mono,
  Atkinson_Hyperlegible,
} from "next/font/google";
import "./globals.css";

// Brand typography (all free Google Fonts)
const bungee = Bungee({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bungee",
  display: "swap",
});
const bungeeShade = Bungee_Shade({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bungee-shade",
  display: "swap",
});
const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
  display: "swap",
});
const atkinson = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-atkinson",
  display: "swap",
});

export const metadata: Metadata = {
  title: "YeeHaw — A Saturday Morning Mixtape",
  description:
    "Weird finds, useful ideas, and good little detours. A nostalgic internet mixtape of products, movies, music, articles, and other good stuff.",
  metadataBase: new URL("https://yeehaw.io"),
  openGraph: {
    title: "YeeHaw — A Saturday Morning Mixtape",
    description:
      "Weird finds, useful ideas, and good little detours, delivered to your inbox.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bungee.variable} ${bungeeShade.variable} ${spaceMono.variable} ${atkinson.variable}`}
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
