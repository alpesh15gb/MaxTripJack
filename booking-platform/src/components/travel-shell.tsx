"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {BrandLogo} from "./brand-logo";
import {ConciergeHeader, type HeaderProps} from "./concierge-header";
import {FooterSocialIcon} from "./footer-social-icon";
import {footerPolicyLinks,footerSocialLinks} from "@/lib/footer-links";
import {useCompanyProfile} from "./company-profile-context";
import {TravelIcon} from "./travel-icon";
import {StitchSymbol} from "./stitch-symbol";
import "./package-navigation.css";
import "./workflow-footer.css";
export {TravelIcon} from "./travel-icon";

export function TravelHeader({active, onProductChange, hotelHref = '/book?product=HOTEL', mobileTitle, ...props}: HeaderProps) {
  const path = usePathname();
  if (path === '/' || path === '/book' || path === '/my-trips' || path?.startsWith('/my-trips/')) {
    const priority = path.startsWith('/my-trips');
    return <ConciergeHeader key={path} {...props} active={active} onProductChange={onProductChange} hotelHref={hotelHref}
      mobileTitle={mobileTitle ?? (path==='/my-trips' ? 'My Trips' : priority ? 'Booking details' : undefined)}
      dock={path==='/' || path==='/my-trips'} priority={priority} isHome={path==='/'}/>;
  }
  return <>
    <a className="travel-skip" href="#main-content">Skip to main content</a>
    <div className="travel-environment"><span />In Testing <span className="travel-environment-detail">No live bookings or payments</span></div>
    <header className="travel-header">
      <Link href="/" className="travel-brand travel-brand--official" aria-label="Max Travel home"><BrandLogo/></Link>
      <nav aria-label="Main navigation">
        {(["FLIGHT", "HOTEL"] as const).map(product => {
          const label = product === "FLIGHT" ? "Flights" : "Hotels";
          const selected = active === (product === "FLIGHT" ? "flights" : "hotels");
          return onProductChange ? <button type="button" key={product} aria-current={selected ? "page" : undefined} onClick={() => onProductChange(product)}>{label}</button> : <Link key={product} aria-current={selected ? "page" : undefined} href={product === "FLIGHT" ? "/book?product=FLIGHT" : hotelHref}>{label}</Link>;
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
 const businessProfile=useCompanyProfile();
 const path=usePathname();
 if(path==='/'||path==='/book'||path==='/my-trips'||path?.startsWith('/my-trips/')) {
   const directory = <div className="concierge-footer-grid">
     <div><Link href="/" className="concierge-brand-link" aria-label="MaxTravel home"><span className="concierge-mark"><StitchSymbol name="flight_takeoff"/></span><b>{businessProfile.name} Desk</b></Link><p>Flights, handpicked stays, holiday packages, visa assistance and travel insurance from our {businessProfile.address.addressLocality} travel desk.</p><Link href="/office">Visit our office <span aria-hidden="true"><TravelIcon name="arrow-up-right" size={14}/></span></Link>{businessProfile.gstNumber && <span>GSTIN · {businessProfile.gstNumber}</span>}</div>
     <div><h2>Core Travel Portals</h2><Link href="/flights">Domestic &amp; global flights</Link><Link href="/hotels">Hotels &amp; resorts</Link><Link href="/packages">Custom holiday packages</Link><Link href="/visa-guide">Visa assistance</Link><Link href="/travel-insurance-guide">Travel insurance</Link><Link href="/contact">Bus enquiries</Link></div>
     <div><h2>Airport Planning Hubs</h2><Link href="/flights/routes">Explore flight routes</Link><Link href="/domestic-flights">Domestic flight planning</Link><Link href="/international-flights">International departures</Link><Link href="/flight-booking-guide#section-4">Flight check-in help</Link></div>
     <div><h2>Customer Care &amp; Legal</h2><a className="concierge-footer-call" href={businessProfile.phoneHref}><strong>Booking support</strong><span>{businessProfile.phone.replace(/^(\+91)(\d{5})(\d{5})$/, '$1 $2 $3')}</span></a><span>{businessProfile.hours.display}</span><Link href="/customer-support">Customer support</Link><FooterPolicyLinks/></div>
   </div>;
   return <footer className="travel-footer concierge-footer">
     <div className="concierge-desktop-directory">{directory}</div>
     <details className="concierge-mobile-directory"><summary>Help &amp; policies <StitchSymbol name="expand_more" size={17}/></summary>{directory}</details>
     <div className="concierge-footer-base"><span>© {new Date().getFullYear()} {businessProfile.legalName||businessProfile.name}. All rights reserved.</span><span>In Testing · No live bookings or payments</span></div>
     <AirportDataCredit/>
   </footer>;
 }
 if(compact)return <footer className="travel-footer travel-footer--compact"><div className="workflow-footer-content"><div><h2>Support for your journey</h2><p>{businessProfile.hours.display}</p></div><nav aria-label="Travel workspace support"><Link href="/customer-support">Help & support</Link><a href={businessProfile.phoneHref}>{businessProfile.phone}</a><a href={businessProfile.emailHref}>Email us</a></nav></div><FooterPolicyLinks/><div className="travel-footer-bottom"><span>© {new Date().getFullYear()} {businessProfile.legalName||businessProfile.name}</span><span>In Testing · No live bookings or payments</span></div><AirportDataCredit/></footer>;
 return <footer className="travel-footer travel-footer--reference">
  <div className="travel-footer-inner"><div className="travel-footer-grid">
   <div className="travel-footer-identity"><Link href="/" className="travel-footer-brand" aria-label="MaxTravel home"><BrandLogo variant="footer"/></Link><nav className="travel-footer-socials" aria-label="Follow MaxTravel">{footerSocialLinks.map(item=><a key={item.name} href={item.name==='google'?businessProfile.mapsHref:item.href} aria-label={item.label}><FooterSocialIcon name={item.name}/></a>)}</nav></div>
   <nav className="travel-footer-group" aria-labelledby="footer-tourism"><h2 id="footer-tourism">Travel & Tourism</h2><ul><li><Link href="/flight-booking-guide">Flight booking guide</Link></li><li><Link href="/holiday-packages-guide">Holiday planning</Link></li><li><Link href="/cruise-holidays-guide">Cruise guide</Link></li></ul></nav>
   <nav className="travel-footer-group travel-footer-services" aria-labelledby="footer-services"><h2 id="footer-services">Services</h2><ul><li><Link href="/book?product=FLIGHT"><TravelIcon name="airplane"/>Flights</Link></li><li><Link href="/hotels"><TravelIcon name="bed"/>Hotels</Link></li><li><Link href="/packages"><TravelIcon name="holiday"/>Holiday packages</Link></li><li><Link href="/visa-guide"><TravelIcon name="passport"/>Visa assistance</Link></li><li><Link href="/travel-insurance-guide"><TravelIcon name="shield"/>Travel insurance</Link></li><li><Link href="/contact"><TravelIcon name="bus"/>Bus enquiries</Link></li></ul></nav>
   <nav className="travel-footer-group" aria-labelledby="footer-support"><h2 id="footer-support">Help & Support</h2><ul><li><Link href="/customer-support">Booking support</Link></li><li><Link href="/flight-booking-guide#section-4">Flight check-in help</Link></li><li><Link href="/contact">Contact us</Link></li><li><Link href="/about">About us</Link></li><li><a href={businessProfile.emailHref+'?subject=Partnership%20enquiry'}>Become a partner</a></li></ul></nav>
  </div><div className="travel-footer-legal-row"><FooterPolicyLinks/>
   {/* eslint-disable-next-line @next/next/no-img-element -- Original local SVG brand artwork, served without an image proxy. */}
   <img className="travel-footer-iata" src="/brand/iata.svg" width="76" height="48" loading="lazy" alt="IATA"/>
  </div><p className="travel-footer-testing">In Testing · No live bookings or payments</p></div>
  <div className="travel-footer-copyright">© Copyright {new Date().getFullYear()} {businessProfile.legalName||businessProfile.name}{businessProfile.gstNumber&&` · GSTIN: ${businessProfile.gstNumber}`}</div><AirportDataCredit/>
 </footer>;
}
