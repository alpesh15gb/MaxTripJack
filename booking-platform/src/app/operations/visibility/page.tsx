import Link from "next/link";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import VisibilityDashboard from "@/components/visibility-dashboard";
import { administrator } from "@/lib/access";
import { HttpError } from "@/lib/http";
import { privatePageMetadata } from "@/lib/seo";
import styles from "./visibility.module.css";

export const metadata = privatePageMetadata("Visibility & measurement readiness");

export default async function VisibilityPage() {
  try {
    // URL is an inert Request constructor base, not a network destination.
    await administrator(new Request("https://maxtravel.in/operations/visibility", { headers: await headers() }), "finance:read");
  } catch (error) {
    unstable_rethrow(error);
    const denied = error instanceof HttpError && (error.status === 401 || error.status === 403);
    return <main className={styles.page}>
      <p className={styles.eyebrow}>PRIVATE OPERATIONS</p><h1>Visibility dashboard</h1>
      <section className={styles.notice} role="status"><h2>{denied ? "Authorised access required" : "Access verification unavailable"}</h2>
        <p>{denied ? "Use a verified staff account with two-factor authentication and finance permission. No reporting data has been loaded." : "Reporting is unavailable until authentication can be verified. No reporting data has been loaded."}</p>
        <Link href="/account">Account & security</Link>
      </section>
    </main>;
  }
  return <VisibilityDashboard />;
}
