"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {TravelNavigation, type HeaderProps} from "./travel-navigation";
import {BrandLogo} from "./brand-logo";
import {FooterSocialIcon} from "./footer-social-icon";
import {footerPolicyLinks,footerSocialLinks} from "@/lib/footer-links";
import {useCompanyProfile} from "./company-profile-context";
import {TravelIcon} from "./travel-icon";
import {StitchSymbol} from "./stitch-symbol";
import {MaxAiFooterAction} from "./max-ai-assistant";
import "./package-navigation.css";
export {TravelIcon} from "./travel-icon";

export function TravelHeader({active, onProductChange, hotelHref = '/book?product=HOTEL', mobileTitle, ...props}: HeaderProps) {
  const path = usePathname();
  const trips = path === '/my-trips';
  const tripDetails = Boolean(path?.startsWith('/my-trips/'));
  const guide = path === '/visa-guide' ? 'visas' : path === '/travel-insurance-guide' ? 'insurance' : undefined;
  return <TravelNavigation key={path} {...props} active={active ?? guide} onProductChange={onProductChange} hotelHref={hotelHref}
    mobileTitle={mobileTitle === null ? undefined : mobileTitle ?? (trips ? 'My Trips' : tripDetails ? 'Booking details' : path === '/book' ? 'Find your trip' : undefined)}/>;
}

function FooterPolicyLinks(){
 return <nav className="travel-footer-policies" aria-label="Policies">{footerPolicyLinks.map(link=><Link key={link.href} href={link.href} aria-label={link.label}>{link.label}</Link>)}</nav>;
}

function AirportDataCredit(){return <p className="travel-footer-data-credit">Airport timezone data © <a href="https://openflights.org/data.php">OpenFlights contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a></p>;}
export function TravelFooter({contactEmail}: {contactEmail?: string} = {}) {
  const company = useCompanyProfile();
  return <footer className="travel-footer destina-footer">
    <MaxAiFooterAction/>
    <div className="destina-footer-inner">
      <div className="destina-footer-brand">
        <Link href="/" aria-label="MaxTravel home"><BrandLogo variant="footer"/></Link>
        <p>Flights, stays, activities and holidays, backed by our {company.address.addressLocality} travel desk.</p>
        <span className="destina-footer-locale"><span className="india-flag" aria-hidden="true"/><span><small>Region &amp; currency</small><strong>India · ₹ INR</strong></span></span>
        <nav className="destina-footer-socials" aria-label="Follow MaxTravel">{footerSocialLinks.map(item => <a key={item.name} href={item.name === 'google' ? company.mapsHref : item.href} aria-label={item.label}><FooterSocialIcon name={item.name}/></a>)}</nav>
      </div>
      <div className="destina-footer-directory">
        <div><h2>Contact us</h2><Link href="/customer-support">Customer Support</Link><Link href="/customer-support/faq">Help / FAQ</Link><Link href="/customer-support/request">Raise a support request</Link><a href={contactEmail ? `mailto:${contactEmail}` : company.emailHref}>Email us</a>
          <a className="destina-footer-call" href={company.phoneHref}><StitchSymbol name="call" size={18}/><span><small>{company.address.addressLocality}</small><strong>{company.phone}</strong></span></a><span>{company.hours.display}</span>
        </div>
        <div><h2>About</h2><Link href="/about">About MaxTravel</Link><Link href="/office">Visit our office <span aria-hidden="true"><TravelIcon name="arrow-up-right" size={14}/></span></Link><Link href="/contact?topic=partner#office-enquiry">Become a partner</Link><FooterPolicyLinks/></div>
        <div><h2>Other services</h2><Link href="/account">My Account</Link><Link href="/my-trips">Find My Trip</Link><Link href="/packages">Holiday packages</Link><Link href="/visa-guide">Visa assistance</Link><Link href="/travel-insurance-guide">Travel insurance</Link><Link href="/contact?topic=bus#office-enquiry">Bus enquiries</Link><Link href="/flight-booking-guide#section-4">Flight check-in help</Link></div>
        <div><h2>Payment methods</h2><p>Available payment methods are shown at checkout.</p><Link href="/pricing-transparency">How pricing and payments work</Link></div>
      </div>
      <div className="destina-footer-base"><span>© {new Date().getFullYear()} {company.legalName || company.name}. All rights reserved.</span>{company.gstNumber && <span>GSTIN · {company.gstNumber}</span>}<span>In Testing · No live bookings or payments</span><AirportDataCredit/></div>
    </div>
  </footer>;
}
