import SupportExperience from "@/components/support-experience";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";

const page = getPublicPage("customer-support")!;
export const metadata = pageMetadata("/customer-support", page.title, page.description);

export default function Page() {
  return <SupportExperience />;
}
