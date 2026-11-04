import HomeSearch from "@/components/home-search";
import { HomePublicIntro } from "@/components/public-content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "/",
  "Travel Agent in Secunderabad: Flights, Hotels, Visas",
  "MaxTravel is a Secunderabad travel agent for flights, hotels, visas, cruises, luxury tour packages, forex and insurance. Office open every day, 9 am–9 pm.",
);

export default function Home() {
  return <HomeSearch><HomePublicIntro /></HomeSearch>;
}
