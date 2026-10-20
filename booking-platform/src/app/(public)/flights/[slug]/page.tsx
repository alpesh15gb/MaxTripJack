import { notFound } from "next/navigation";
import { FlightGuideView } from "@/components/public-content";
import { flightGuides, getFlightGuide } from "@/lib/flight-guides";
import { pageMetadata } from "@/lib/seo";

// Only the five editorially reviewed slugs are routable. No city permutations.
export const dynamicParams = false;
export function generateStaticParams() {
  return flightGuides.map(guide => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getFlightGuide((await params).slug);
  if (!guide) notFound();
  return pageMetadata(`/flights/${guide.slug}`, guide.title, guide.description);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getFlightGuide((await params).slug);
  if (!guide) notFound();
  return <FlightGuideView guide={guide} />;
}
