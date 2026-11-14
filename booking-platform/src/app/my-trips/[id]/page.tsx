import { notFound } from "next/navigation";
import { z } from "zod";
import BookingStatusPage from "@/components/booking-status-page";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Your booking status");

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  return <BookingStatusPage bookingId={id} />;
}
