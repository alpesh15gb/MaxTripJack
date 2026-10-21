import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_NAME, SITE_ORIGIN, siteRobots } from "@/lib/seo";
import "./globals.css";
import "./refinement.css";
import "./reference-theme.css";
import "./flight-results.css";
import "./account.css";
import "./live-booking.css";
import "./booking-ui.css";
import "./operations.css";
import "./travel-design.css";
import "./experience-system.css";
import "./journey-studio.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  icons: {icon:"/brand/favicon.png",apple:"/brand/favicon.png"},
  title: { default: `${SITE_NAME} | Flight and hotel booking`, template: `%s | ${SITE_NAME}` },
  description: "Explore flights and hotels with MaxTravel. Review total prices and supplier rules before payment, and follow your booking confirmation in My trips.",
  robots: siteRobots(),
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every rendered document gets a fresh CSP nonce, including framework scripts.
  await connection();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
