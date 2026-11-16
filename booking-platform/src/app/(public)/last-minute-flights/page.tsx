import {getCompanyProfile} from "@/lib/company-settings";
import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("last-minute-flights")!;
export async function generateMetadata(){const current=getPublicPage("last-minute-flights",await getCompanyProfile())!;return pageMetadata("/last-minute-flights",current.title,current.description);}

export default function Page() {
  return <PublicPageView page={page} />;
}
