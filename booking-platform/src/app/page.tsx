import HomeSearch from "@/components/home-search";
import HomeOffers from "@/components/home-offers";
import { HomePublicIntro, HomeRouteGuides } from "@/components/public-content";
import { pageMetadata } from "@/lib/seo";
import {maxAiGatewayConfiguration} from "@/lib/max-ai-provider";
import {conversationConfigured} from "@/lib/max-ai-conversation";

export const metadata = pageMetadata(
  "/",
  "Travel Agent in Secunderabad: Flights, Hotels, Visas",
  "MaxTravel is a Secunderabad travel agent for flights, hotels, visas, cruises, luxury tour packages, forex and insurance. Office open every day, 9 am–9 pm.",
);

export default function Home() {
  return <HomeSearch assistantEnabled={Boolean(maxAiGatewayConfiguration())&&conversationConfigured()} offers={<HomeOffers />} guides={<HomeRouteGuides/>}><HomePublicIntro /></HomeSearch>;
}
