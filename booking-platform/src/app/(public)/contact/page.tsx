import {getCompanyProfile} from "@/lib/company-settings";
import { PublicPageView } from "@/components/public-content";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/seo";
import { indiaToday } from "@/lib/booking-presentation";

const page = getPublicPage("contact")!;
export async function generateMetadata(){const current=getPublicPage("contact",await getCompanyProfile())!;return pageMetadata("/contact",current.title,current.description);}

function travelDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : undefined;
}

export default async function Page({searchParams}: PageProps<'/contact'>) {
  const {topic,destination,start,end,travellers}=await searchParams;
  const contactTopic = topic === 'bus' ? 'BUS' : topic === 'partner' ? 'PARTNERSHIP' : undefined;
  const enquiryType = topic === 'package' ? 'Holiday package enquiry' : topic === 'activity' ? 'Activities enquiry' : topic === 'insurance' ? 'Travel insurance enquiry' : undefined;
  const city = typeof destination === 'string' && !/[\u0000-\u001f\u007f]/.test(destination) ? destination.trim().slice(0, 100) : '';
  const departure = travelDate(start);
  const arrival = travelDate(end);
  const dates = departure && arrival && departure >= indiaToday() && arrival >= departure ? `${departure} to ${arrival}` : '';
  const count = typeof travellers === 'string' && /^[1-9]\d?$/.test(travellers) && Number(travellers) <= 50 ? travellers : '';
  const travelEnquiry = enquiryType ? { subject: enquiryType, message: [
    city && `Destination: ${city}`, dates && `Travel dates: ${dates}`, count && `Travellers: ${count}`,
  ].filter(Boolean).join('\n') } : undefined;
  return <PublicPageView page={page} contactTopic={contactTopic} travelEnquiry={travelEnquiry} />;
}
