import HomeSearch from "@/components/home-search";
import HomeOffers from "@/components/home-offers";
import { HomePublicIntro, HomeRouteGuides } from "@/components/public-content";
import { pageMetadata } from "@/lib/seo";
import { cookies } from "next/headers";

export const metadata = pageMetadata(
  "/",
  "Travel Agent in Secunderabad: Flights, Hotels, Visas",
  "MaxTravel is a Secunderabad travel agent for flights, hotels, visas, cruises, luxury tour packages, forex and insurance. Office open every day, 9 am–9 pm.",
);

export default async function Home({searchParams}: PageProps<'/'>) {
  const [{product}, preferences] = await Promise.all([searchParams, cookies()]);
  const preferred = product ?? preferences.get("maxtravel-home-product")?.value;
  const startingProduct = preferred === "FLIGHT" ? "FLIGHT" : "HOTEL";
  return <HomeSearch startingProduct={startingProduct} offers={<HomeOffers />} guides={<HomeRouteGuides/>}><HomePublicIntro /></HomeSearch>;
}
