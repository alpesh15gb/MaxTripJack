import HomeSearch from "@/components/home-search";
import { HomePublicIntro } from "@/components/public-content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "/",
  "Flight & Hotel Planning with Secunderabad Office Support",
  "Plan flights and hotels with MaxTravel: competitive travel pricing, clear booking guidance and a real Secunderabad office open every day, 9 am–9 pm India time.",
);

export default function Home() {
  return <HomeSearch><HomePublicIntro /></HomeSearch>;
}
