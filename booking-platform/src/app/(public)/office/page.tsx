import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("office")!;
export const metadata = pageMetadata("/office", page.title, page.description);

export default function Page() {
  return <PublicPageView page={page} />;
}
