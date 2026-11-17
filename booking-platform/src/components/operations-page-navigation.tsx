import Link from "next/link";
import "@/app/operations-page-navigation.css";

type OperationsPage = "enquiries" | "promos" | "reports" | "visibility" | "settings";

const pages: { page: OperationsPage; label: string }[] = [
  { page: "enquiries", label: "Travel enquiries" },
  { page: "promos", label: "Promo codes" },
  { page: "reports", label: "Booking reports" },
  { page: "visibility", label: "Measurement" },
  { page: "settings", label: "Company settings" },
];

export default function OperationsPageNavigation({ active }: { active: OperationsPage }) {
  return <div className="ops-page-navigation">
    <div className="ops-page-navigation-top">
      <Link href="/operations" className="ops-page-home"><span aria-hidden="true">M.</span><div><strong>MaxTravel</strong><small>Operations workspace</small></div></Link>
      <Link href="/account" className="ops-page-account">Account <span aria-hidden="true">↗</span></Link>
    </div>
    <nav aria-label="Operations navigation">
      <Link href="/operations">Booking desk</Link>
      {pages.map(({page, label}) => <Link key={page} href={`/operations/${page}`} aria-current={active === page ? "page" : undefined}>{label}</Link>)}
    </nav>
  </div>;
}
