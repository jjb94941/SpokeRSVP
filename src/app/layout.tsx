import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Fraunces } from "next/font/google";
import "./globals.css";

export const dynamic = "force-dynamic";

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "SpokeRSVP · Mill Valley Village",
    template: "%s · SpokeRSVP",
  },
  description:
    "Local-village event RSVPs, waitlists, and optional carpools for Mill Valley Village. Complements Helpful Village — not a CRM.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${atkinson.variable} ${fraunces.variable} flex min-h-screen flex-col antialiased`}>
        {children}
      </body>
    </html>
  );
}
