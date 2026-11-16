import {getCompanyProfile} from "@/lib/company-settings";
import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("contact")!;
export async function generateMetadata(){const current=getPublicPage("contact",await getCompanyProfile())!;return pageMetadata("/contact",current.title,current.description);}

export default function Page() {
  return <PublicPageView page={page} />;
}
