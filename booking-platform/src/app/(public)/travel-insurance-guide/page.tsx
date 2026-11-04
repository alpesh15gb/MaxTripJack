import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("travel-insurance-guide")!;
export const metadata = pageMetadata("/travel-insurance-guide", page.title, page.description);

export default function Page() {
  return <PublicPageView page={page} />;
}
