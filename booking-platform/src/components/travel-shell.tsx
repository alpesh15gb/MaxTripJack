"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ConciergeHeader, type HeaderProps} from "./concierge-header";
import {BrandLogo} from "./brand-logo";
import {FooterSocialIcon} from "./footer-social-icon";
import {footerPolicyLinks,footerSocialLinks} from "@/lib/footer-links";
import {useCompanyProfile} from "./company-profile-context";
import {TravelIcon} from "./travel-icon";
import {StitchSymbol} from "./stitch-symbol";
import "./package-navigation.css";
export {TravelIcon} from "./travel-icon";

export function TravelHeader({active, onProductChange, hotelHref = '/book?product=HOTEL', mobileTitle, ...props}: HeaderProps) {
  const path = usePathname();
  const home = path === '/';
  const trips = path === '/my-trips';
  const tripDetails = Boolean(path?.startsWith('/my-trips/'));
  return <ConciergeHeader key={path} {...props} active={active} onProductChange={onProductChange} hotelHref={hotelHref}
    mobileTitle={mobileTitle ?? (trips ? 'My Trips' : tripDetails ? 'Booking details' : path === '/book' ? 'Find your trip' : undefined)}
    dock={home || trips} priority={trips || tripDetails} isHome={home}
    showTesting={!home && !trips && !tripDetails && path !== '/book'}/>;
}

function FooterPolicyLinks(){
 return <nav className="travel-footer-policies" aria-label="Policies">{footerPolicyLinks.map(link=><Link key={link.href} href={link.href} aria-label={link.label}>{link.label}</Link>)}</nav>;
}

function AirportDataCredit(){return <p className="travel-footer-data-credit">Airport timezone data © <a href="https://openflights.org/data.php">OpenFlights contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a></p>;}
export function TravelFooter() {
  const company = useCompanyProfile();
  const directory = <div className="concierge-footer-grid">
    <div>
      <Link href="/" className="concierge-brand-link" aria-label="MaxTravel home"><BrandLogo variant="footer"/></Link>
      <p>Flights, handpicked stays, holiday packages, visa assistance and travel insurance from our {company.address.addressLocality} travel desk.</p>
      <Link href="/office" className="concierge-footer-office">Visit our office <span aria-hidden="true"><TravelIcon name="arrow-up-right" size={14}/></span></Link>
      {company.gstNumber && <span>GSTIN · {company.gstNumber}</span>}
      <nav className="concierge-footer-socials" aria-label="Follow MaxTravel">
        {footerSocialLinks.map(item => <a key={item.name} href={item.name === 'google' ? company.mapsHref : item.href} aria-label={item.label}><FooterSocialIcon name={item.name}/></a>)}
      </nav>
    </div>
    <div>
      <h2>Travel services</h2>
      <Link href="/flights">Domestic &amp; global flights</Link>
      <Link href="/hotels">Hotels &amp; resorts</Link>
      <Link href="/packages">Holiday packages</Link>
      <Link href="/visa-guide">Visa assistance</Link>
      <Link href="/travel-insurance-guide">Travel insurance</Link>
      <Link href="/contact">Bus enquiries</Link>
    </div>
    <div>
      <h2>Plan your trip</h2>
      <Link href="/flights/routes">Explore flight routes</Link>
      <Link href="/domestic-flights">Domestic flight planning</Link>
      <Link href="/international-flights">International departures</Link>
      <Link href="/flight-booking-guide#section-4">Flight check-in help</Link>
      <Link href="/holiday-packages-guide">Holiday planning</Link>
      <Link href="/cruise-holidays-guide">Cruise guide</Link>
      <Link href="/about">About MaxTravel</Link>
    </div>
    <div>
      <h2>Customer care &amp; legal</h2>
      <a className="concierge-footer-call" href={company.phoneHref}><strong>Call the travel desk</strong><span>{company.phone}</span></a>
      <span>{company.hours.display}</span>
      <Link href="/customer-support">Booking support</Link>
      <a href={company.emailHref}>Email us</a>
      <a href={company.emailHref + '?subject=Partnership%20enquiry'}>Become a partner</a>
      <FooterPolicyLinks/>
    </div>
  </div>;
  return <footer className="travel-footer concierge-footer">
    <div className="concierge-desktop-directory">{directory}</div>
    <details className="concierge-mobile-directory"><summary>Help &amp; policies <StitchSymbol name="expand_more" size={17}/></summary>{directory}</details>
    <div className="concierge-footer-base"><span>© {new Date().getFullYear()} {company.legalName || company.name}. All rights reserved.</span><span>In Testing · No live bookings or payments</span></div>
    <AirportDataCredit/>
  </footer>;
}
