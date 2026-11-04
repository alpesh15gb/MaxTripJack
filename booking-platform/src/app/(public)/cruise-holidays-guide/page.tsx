import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("cruise-holidays-guide")!;
export const metadata = pageMetadata("/cruise-holidays-guide", page.title, page.description);

export default function Page() {
  return <PublicPageView page={page} />;
}
