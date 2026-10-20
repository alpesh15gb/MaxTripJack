import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("pricing-transparency")!;
export const metadata = pageMetadata("/pricing-transparency", page.title, page.description);

export default function Page() {
  return <PublicPageView page={page} />;
}
