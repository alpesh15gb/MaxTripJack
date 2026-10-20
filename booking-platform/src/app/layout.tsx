import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./refinement.css";
import "./reference-theme.css";
import "./flight-results.css";
import "./account.css";
import "./live-booking.css";
import "./booking-ui.css";
import "./operations.css";
import "./travel-design.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  icons: {icon:"/brand/favicon.png",apple:"/brand/favicon.png"},
  title: "Max Travel — Your next adventure",
  description: "Discover flights and thoughtful stays with Max Travel. Book flights and hotels, manage your trips and travel for business.",
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
