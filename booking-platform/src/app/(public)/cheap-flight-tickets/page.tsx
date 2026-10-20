import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("cheap-flight-tickets")!;
export const metadata = pageMetadata("/cheap-flight-tickets", page.title, page.description);

export default function Page() {
  return <PublicPageView page={page} />;
}
