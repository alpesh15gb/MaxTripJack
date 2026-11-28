import { SupportRequestExperience } from '@/components/support-experience';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/customer-support/request', 'Raise a MaxTravel Support Request', 'Prepare an email for the MaxTravel team about an existing booking or a travel question.');

export default function Page() {
  return <SupportRequestExperience />;
}
