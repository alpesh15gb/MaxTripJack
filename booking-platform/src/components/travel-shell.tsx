"use client";

import Link from "next/link";
import { businessProfile } from "@/lib/business-profile";

type IconName = "plane" | "hotel" | "arrow" | "shield" | "bag" | "user" | "search" | "pin" | "check" | "swap" | "clock" | "receipt" | "chevron" | "refresh" | "globe";

export function TravelIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    plane: "m22 2-7 20-4-9-9-4L22 2ZM11 13l6-6",
    hotel: "M3 21V3h12v18M15 9h6v12M7 7h4M7 11h4M7 15h4M7 21v-3h4v3M19 13v2M19 17v2",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6",
    bag: "M4 7h16v14H4V7Zm4 0V3h8v4M8 11v5m8-5v5",
    user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
    search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 4 7 7",
    pin: "M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 1 1 14 0ZM12 8v2",
    check: "m5 12 4 4L19 6",
    swap: "M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4",
    clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
    receipt: "M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 4h6M9 11h6M9 15h3",
    chevron: "m9 5 7 7-7 7",
    refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18A8 8 0 0 1 5 16",
    globe: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c5 6 5 14 0 20-5-6-5-14 0-20Z",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function TravelHeader({ active, onProductChange }: { active?: "flights" | "hotels" | "trips" | "account"; onProductChange?: (product: "FLIGHT" | "HOTEL") => void }) {
  return <>
    <a className="travel-skip" href="#main-content">Skip to main content</a>
    <div className="travel-environment"><span />Test environment <span className="travel-environment-detail">TripJack UAT · No live travel bookings</span></div>
    <header className="travel-header">
      <Link href="/" className="travel-brand" aria-label="Max Travel home"><span className="travel-brand-symbol"><TravelIcon name="plane" size={22} /></span>max<span>travel</span><i>.</i></Link>
      <nav aria-label="Main navigation">
        {(["FLIGHT", "HOTEL"] as const).map(product => {
          const label = product === "FLIGHT" ? "Flights" : "Hotels";
          const selected = active === (product === "FLIGHT" ? "flights" : "hotels");
          return onProductChange ? <button type="button" key={product} aria-current={selected ? "page" : undefined} onClick={() => onProductChange(product)}>{label}</button> : <Link key={product} aria-current={selected ? "page" : undefined} href={product === "FLIGHT" ? "/flights" : "/book?product=HOTEL"}>{label}</Link>;
        })}
        <Link href="/my-trips" aria-current={active === "trips" ? "page" : undefined}>My trips</Link>
        <Link className="travel-business-nav" href="/office">Our office <span aria-hidden="true">↗</span></Link>
      </nav>
      <div className="travel-header-actions"><span className="travel-currency">INR <span>₹</span></span><Link className="travel-account" href="/account"><TravelIcon name="user" size={17} /><span>My account</span></Link></div>
    </header>
  </>;
}

export function TravelFooter() {
  return <footer className="travel-footer">
    <div className="travel-footer-top">
      <div><Link href="/" className="travel-brand">max<span>travel</span><i>.</i></Link><p>Competitive travel prices.<br />Real people. A real office.</p><span className="travel-footer-caption">MaxTravel · Secunderabad, India</span><Link href="/about">About MaxTravel</Link><Link href="/services">Our services</Link></div>
      <div><h2>Plan your next trip</h2><Link href="/flights">Flight planning & route guides</Link><Link href="/domestic-flights">Domestic flights</Link><Link href="/international-flights">International flights</Link><Link href="/cheap-flight-tickets">Compare affordable flights</Link><Link href="/last-minute-flights">Last-minute planning</Link><Link href="/book?product=HOTEL">Plan a stay</Link></div>
      <div><h2>Help at every step</h2><Link href="/flight-booking-guide">Flight booking guide</Link><Link href="/pricing-transparency">Pricing transparency</Link><Link href="/customer-support">Customer support</Link><Link href="/my-trips">Manage my trips</Link><Link href="/account">Your account</Link><Link href="/contact">Contact MaxTravel</Link></div>
      <div className="travel-footer-promise"><TravelIcon name="pin" size={25} /><h2>A real office in Secunderabad.</h2><p>{businessProfile.hours.display}</p><a href={businessProfile.phoneHref}>{businessProfile.phone}</a><a href={businessProfile.emailHref}>{businessProfile.email}</a><Link href="/office">Office address & directions</Link><p>Review the full total and supplier rules. Payment alone does not confirm a trip.</p></div>
    </div>
    <div className="travel-footer-bottom"><span>© {new Date().getFullYear()} Max Travel</span><span>Test environment · Supplier confirmation required</span><span>Made for the journey.</span></div>
  </footer>;
}
