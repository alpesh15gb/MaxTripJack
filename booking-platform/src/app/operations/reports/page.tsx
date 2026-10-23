import Link from "next/link";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { administrator } from "@/lib/access";
import { HttpError } from "@/lib/http";
import { privatePageMetadata } from "@/lib/seo";
import BookingReports from "@/components/booking-reports";
import "./reports.css";

export const metadata = privatePageMetadata("Booking reports");
export default async function BookingReportsPage() {
  try {
    await administrator(new Request("https://maxtravel.in/operations/reports", { headers: await headers() }), "finance:read");
  } catch (error) {
    unstable_rethrow(error);
    const denied = error instanceof HttpError && [401, 403].includes(error.status);
    return <main className="reports-page"><p className="reports-eyebrow">PRIVATE OPERATIONS</p><h1>Booking reports</h1><section className="reports-notice" role="status"><h2>{denied ? "Finance access required" : "Access verification unavailable"}</h2><p>Use a verified staff account with two-factor authentication and finance permission. No reporting data has been loaded.</p><Link href="/account">Account & security</Link></section></main>;
  }
  return <BookingReports />;
}
