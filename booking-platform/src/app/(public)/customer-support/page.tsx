import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("customer-support")!;
export const metadata = pageMetadata("/customer-support", page.title, page.description);

export default function Page() {
  return <PublicPageView page={page} />;
}
