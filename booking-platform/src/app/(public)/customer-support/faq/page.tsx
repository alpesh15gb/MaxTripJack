import { SupportFaqExperience } from '@/components/support-experience';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/customer-support/faq', 'Frequently Asked Travel Questions', 'Find answers about MaxTravel bookings, payments, refunds, baggage, check-in and account help.');

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q, topic, answer } = await searchParams;
  return <SupportFaqExperience
    query={typeof q === 'string' ? q.trim().slice(0, 80) : ''}
    topic={typeof topic === 'string' ? topic : undefined}
    answer={typeof answer === 'string' ? answer : undefined}
  />;
}
