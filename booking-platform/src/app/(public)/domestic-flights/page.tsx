import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("domestic-flights")!;
export const metadata = pageMetadata("/domestic-flights", page.title, page.description);

export default function Page() {
  return <PublicPageView page={page} />;
}
