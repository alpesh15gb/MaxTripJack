import {getCompanyProfile} from '@/lib/company-settings';
import {CompanyProfileProvider} from '@/components/company-profile-context';
import MaxAiAssistant from '@/components/max-ai-assistant';
import {maxAiGatewayConfiguration} from '@/lib/max-ai-provider';
import {conversationConfigured} from '@/lib/max-ai-conversation';
import type { Metadata } from "next";
import { connection } from "next/server";
import { DM_Sans, Geist, Geist_Mono, Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
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
import "./journey-flow.css";
import "./journey-polish.css";
import "./flight-decision.css";
import "./visual-polish.css";
import "./checkout-flow.css";
import "./homepage-design.css";
import "./site-polish.css";
import "./stitch-shell.css";
import "./stitch-home.css";
import "./stitch-shopping.css";
import "./stitch-checkout.css";

const bookingDisplay = Plus_Jakarta_Sans({ variable: "--font-stitch-display", subsets: ["latin"], display: "swap" });
const bookingBody = DM_Sans({ variable: "--font-stitch-body", subsets: ["latin"], display: "swap" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const travelDisplay = Instrument_Serif({
  variable: "--font-travel-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  icons: {icon:{url:"/brand/plane-favicon.png",type:"image/png",sizes:"48x48"},apple:{url:"/brand/apple-touch-icon.png",sizes:"180x180",type:"image/png"}},
  title: { default: `${SITE_NAME} | Flight and hotel booking`, template: `%s | ${SITE_NAME}` },
  description: "Explore flights and hotels with MaxTravel. Review total prices and supplier rules before payment, and follow your booking confirmation in My trips.",
  robots: siteRobots(),
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every rendered document gets a fresh CSP nonce, including framework scripts.
  await connection();
  const company=await getCompanyProfile();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${travelDisplay.variable} ${bookingDisplay.variable} ${bookingBody.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><CompanyProfileProvider value={company}>{children}<MaxAiAssistant enabled={Boolean(maxAiGatewayConfiguration())&&conversationConfigured()}/></CompanyProfileProvider></body>
    </html>
  );
}
