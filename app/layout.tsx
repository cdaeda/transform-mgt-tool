import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Condensed caps echo the game's card headers; Plex Mono keeps the numbers lined up.
const display = Barlow_Condensed({ variable: "--font-display-face", subsets: ["latin"], weight: ["500", "600", "700"] });
const body = Source_Sans_3({ variable: "--font-body", subsets: ["latin"] });
const figures = IBM_Plex_Mono({ variable: "--font-figures", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Transform CFO",
  description: "Team 1 CFO dashboard and AI copilot for the Transform! simulator",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${figures.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
