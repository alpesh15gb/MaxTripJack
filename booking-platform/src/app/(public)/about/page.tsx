import {getCompanyProfile} from "@/lib/company-settings";
import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("about")!;
export async function generateMetadata(){const current=getPublicPage("about",await getCompanyProfile())!;return pageMetadata("/about",current.title,current.description);}

export default function Page() {
  return <PublicPageView page={page} />;
}
