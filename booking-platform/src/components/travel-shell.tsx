"use client";

import Link from "next/link";
import {BrandLogo} from "./brand-logo";
import "./package-navigation.css";
import "./workflow-footer.css";
import {FooterSocialIcon} from "./footer-social-icon";
import {footerPolicyLinks,footerSocialLinks} from "@/lib/footer-links";
import { businessProfile } from "@/lib/business-profile";

type IconName = "plane" | "airplane" | "hotel" | "bed" | "bus" | "holiday" | "passport" | "arrow" | "arrow-up-right" | "shield" | "bag" | "user" | "search" | "pin" | "check" | "swap" | "clock" | "receipt" | "chevron" | "refresh" | "globe";

export function TravelIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    airplane: "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z",
    plane: "m22 2-7 20-4-9-9-4L22 2ZM11 13l6-6",
    bed: "M3 18v3m18-3v3M3 18h18V9H3v9Zm0-9V5h18v4M7 9V7h3v2m4 0V7h3v2",
    bus: "M5 17v3m14-3v3M5 3h14l1 3v11H4V6l1-3Zm-1 8h16M8 14h.01M16 14h.01M8 6h8",
    holiday: "M3 10c2-7 16-7 18 0H3Zm9 0v10m-5 0h10M4 22h16M7 10l-2 4m12-4 2 4",
    passport: "M5 3h14v18H5V3Zm4 14h6M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-3-3v6M9 10h6",
    hotel: "M3 21V3h12v18M15 9h6v12M7 7h4M7 11h4M7 15h4M7 21v-3h4v3M19 13v2M19 17v2",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    "arrow-up-right": "M7 17 17 7M7 7h10v10",
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

export function TravelHeader({ active, onProductChange }: { active?: "flights" | "hotels" | "trips" | "account" | "packages"; onProductChange?: (product: "FLIGHT" | "HOTEL") => void }) {
  return <>
    <a className="travel-skip" href="#main-content">Skip to main content</a>
    <div className="travel-environment"><span />In Testing <span className="travel-environment-detail">No live bookings or payments</span></div>
    <header className="travel-header">
      <Link href="/" className="travel-brand travel-brand--official" aria-label="Max Travel home"><BrandLogo/></Link>
      <nav aria-label="Main navigation">
        {(["FLIGHT", "HOTEL"] as const).map(product => {
          const label = product === "FLIGHT" ? "Flights" : "Hotels";
          const selected = active === (product === "FLIGHT" ? "flights" : "hotels");
          return onProductChange ? <button type="button" key={product} aria-current={selected ? "page" : undefined} onClick={() => onProductChange(product)}>{label}</button> : <Link key={product} aria-current={selected ? "page" : undefined} href={product === "FLIGHT" ? "/book?product=FLIGHT" : "/book?product=HOTEL"}>{label}</Link>;
        })}
        <Link href="/packages" aria-current={active === "packages" ? "page" : undefined}>Packages</Link>
        <Link href="/my-trips" aria-current={active === "trips" ? "page" : undefined}>My trips</Link>
        <Link className="travel-business-nav" href="/office">Our office <span aria-hidden="true"><TravelIcon name="arrow-up-right" size={14} /></span></Link>
      </nav>
      <div className="travel-header-actions"><span className="travel-currency">INR <span>₹</span></span><Link className="travel-account" href="/account" aria-current={active === "account" ? "page" : undefined}><TravelIcon name="user" size={17} /><span>My account</span></Link></div>
    </header>
  </>;
}

function FooterPolicyLinks(){
 return <nav className="travel-footer-policies" aria-label="Policies">{footerPolicyLinks.map(link=><Link key={link.href} href={link.href} aria-label={link.label}>{link.label}</Link>)}</nav>;
}

function AirportDataCredit(){return <p className="travel-footer-data-credit">Airport timezone data © <a href="https://openflights.org/data.php">OpenFlights contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a></p>;}
export function TravelFooter({compact=false}:{compact?:boolean}={}) {
 if(compact)return <footer className="travel-footer travel-footer--compact"><div className="workflow-footer-content"><div><h2>Support for your journey</h2><p>{businessProfile.hours.display}</p></div><nav aria-label="Travel workspace support"><Link href="/customer-support">Help & support</Link><a href={businessProfile.phoneHref}>{businessProfile.phone}</a><a href={businessProfile.emailHref}>Email us</a></nav></div><FooterPolicyLinks/><div className="travel-footer-bottom"><span>© {new Date().getFullYear()} Max Travel</span><span>In Testing · No live bookings or payments</span></div><AirportDataCredit/></footer>;
 return <footer className="travel-footer travel-footer--reference">
  <div className="travel-footer-inner"><div className="travel-footer-grid">
   <div className="travel-footer-identity"><Link href="/" className="travel-footer-brand" aria-label="MaxTravel home"><BrandLogo variant="footer"/></Link><nav className="travel-footer-socials" aria-label="Follow MaxTravel">{footerSocialLinks.map(item=><a key={item.name} href={item.href} aria-label={item.label}><FooterSocialIcon name={item.name}/></a>)}</nav></div>
   <nav className="travel-footer-group" aria-labelledby="footer-tourism"><h2 id="footer-tourism">Travel & Tourism</h2><ul><li><Link href="/flight-booking-guide">Flight booking guide</Link></li><li><Link href="/holiday-packages-guide">Holiday planning</Link></li><li><Link href="/cruise-holidays-guide">Cruise guide</Link></li></ul></nav>
   <nav className="travel-footer-group travel-footer-services" aria-labelledby="footer-services"><h2 id="footer-services">Services</h2><ul><li><Link href="/book?product=FLIGHT"><TravelIcon name="airplane"/>Flight</Link></li><li><Link href="/book?product=HOTEL"><TravelIcon name="bed"/>Hotel</Link></li><li><a href="https://maxtravel.us/bus"><TravelIcon name="bus"/>Bus</a></li><li><Link href="/packages"><TravelIcon name="holiday"/>Holiday</Link></li><li><a href="https://maxtravel.us/visa"><TravelIcon name="passport"/>Visa</a></li><li><a href={businessProfile.emailHref+'?subject=Travel%20insurance%20enquiry'}><TravelIcon name="shield"/>Insurance</a></li></ul></nav>
   <nav className="travel-footer-group" aria-labelledby="footer-support"><h2 id="footer-support">Help & Support</h2><ul><li><a href={businessProfile.emailHref+'?subject=Partnership%20enquiry'}>Become a Partner</a></li><li><a href="https://maxtravel.us/web-check-in">Web Check In</a></li><li><Link href="/contact">Contact Us</Link></li><li><Link href="/about">About Us</Link></li></ul></nav>
  </div><div className="travel-footer-legal-row"><FooterPolicyLinks/>
   {/* eslint-disable-next-line @next/next/no-img-element -- Original local SVG brand artwork, served without an image proxy. */}
   <img className="travel-footer-iata" src="/brand/iata.svg" width="76" height="48" loading="lazy" alt="IATA"/>
  </div><p className="travel-footer-testing">In Testing · No live bookings or payments</p></div>
  <div className="travel-footer-copyright">© Copyright {new Date().getFullYear()} MaxTravel</div><AirportDataCredit/>
 </footer>;
}
