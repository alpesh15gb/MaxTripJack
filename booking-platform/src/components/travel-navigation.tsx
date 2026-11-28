"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import { BrandLogo } from "./brand-logo";
import { useCompanyProfile } from "./company-profile-context";
import { StitchSymbol } from "./stitch-symbol";
import { TravelIcon } from "./travel-icon";

const serviceLinks = [
  { label: "Travel Insurance", icon: "shield", href: "/travel-insurance-guide" },
  { label: "Visa Services", icon: "passport", href: "/visa-guide" },
  { label: "Destinations", icon: "globe", href: "/destinations" },
  { label: "Cruises", icon: "holiday", href: "/cruise-holidays-guide" },
] as const;

const helpLinks = [
  { label: "Help Center & FAQs", icon: "search", href: "/customer-support/faq" },
  { label: "Raise a support request", icon: "phone", href: "/customer-support/request" },
  { label: "Find my trip", icon: "receipt", href: "/my-trips" },
] as const;

type TravelSearchProduct = "FLIGHT" | "HOTEL" | "PACKAGE" | "ACTIVITY";

export type HeaderProps = {
  active?: "flights" | "hotels" | "trips" | "account" | "packages" | "visas" | "insurance";
  onProductChange?: (product: TravelSearchProduct) => void;
  hotelHref?: "/hotels" | "/book?product=HOTEL";
  mobileTitle?: string | null;
  mobileSubtitle?: string;
  onMobileEdit?: () => void;
  onMobileBack?: () => void;
  tripTools?: boolean;
};

export function TravelNavigation({active, onProductChange, hotelHref, mobileTitle, mobileSubtitle, onMobileEdit, onMobileBack, tripTools}: HeaderProps) {
  const company = useCompanyProfile();
  const { data: session } = authClient.useSession();
  const menuGroup = useId();
  const mobileMenu = useRef<HTMLDialogElement>(null);
  const control = useRef<HTMLButtonElement>(null);
  const closeMenu = () => mobileMenu.current?.close();
  const accountLabel = session ? "Account" : "Sign in";

  function productLink(product: TravelSearchProduct, label: string) {
    const href = {FLIGHT:"/book?product=FLIGHT", HOTEL:hotelHref??"/book?product=HOTEL", PACKAGE:"/#packages", ACTIVITY:"/#tours"}[product];
    if (!onProductChange) return <Link href={href} onClick={closeMenu}>{label}</Link>;
    return <button type="button" onClick={event => {
      const menu = event.currentTarget.closest("details");
      if (menu) menu.open = false;
      closeMenu();
      onProductChange(product);
    }}>{label}</button>;
  }

  return <>
    <a className="travel-skip" href="#main-content">Skip to main content</a>
    <header className="travel-navigation" onKeyDown={event => {
      if (event.key === "Escape" && event.target instanceof HTMLElement) {
        const menu = event.target.closest("details[open]");
        if (menu instanceof HTMLDetailsElement) {
          menu.open = false;
          menu.querySelector("summary")?.focus();
        }
      }
    }}>
      <button ref={control} type="button" className="travel-navigation-trigger" aria-label="Open navigation" aria-haspopup="dialog" onClick={() => mobileMenu.current?.showModal()}><TravelIcon name="menu" size={24}/></button>
      <Link href="/" className="travel-navigation-brand" aria-label="Max Travel home"><BrandLogo/></Link>
      <nav className="travel-navigation-products" aria-label="Main navigation">
        <details name={menuGroup}><summary>Flights <StitchSymbol name="expand_more" size={16}/></summary><div className="travel-navigation-menu">
          {productLink("FLIGHT", "Search all flights")}<Link href="/flights/routes">Popular flight routes</Link><Link href="/domestic-flights">Domestic flights</Link><Link href="/international-flights">International flights</Link><Link href="/destinations">All destinations</Link>
        </div></details>
        <details name={menuGroup}><summary>Hotels <StitchSymbol name="expand_more" size={16}/></summary><div className="travel-navigation-menu">
          {productLink("HOTEL", "Search all hotels")}<Link href="/hotels">Hotel directory</Link><Link href="/destinations">All destinations</Link>
        </div></details>
        <details name={menuGroup}><summary>Activities <StitchSymbol name="expand_more" size={16}/></summary><div className="travel-navigation-menu">
          {productLink("ACTIVITY", "Tours & Activities")}<Link href="/destinations">All destinations</Link><Link href="/contact?topic=activity#office-enquiry">Ask about an activity</Link>
        </div></details>
        <details name={menuGroup}><summary><span>More</span> <StitchSymbol name="expand_more" size={16}/></summary><div className="travel-navigation-menu">
          {productLink("PACKAGE", "Flight + Hotel")}<Link href="/packages" aria-current={active === "packages" ? "page" : undefined}>Packages</Link>
          {serviceLinks.map(link => <Link key={link.label} href={link.href}>{link.label}</Link>)}
          <Link href="/about">About Max Travel</Link>
        </div></details>
      </nav>
      <div className="travel-navigation-tools">
        <details name={menuGroup} className="travel-navigation-currency"><summary aria-label="Currency, Indian rupee"><span className="india-flag" aria-hidden="true"/><span>₹ INR</span><StitchSymbol name="expand_more" size={16}/></summary><div className="travel-navigation-menu"><p><strong>Indian rupee · INR</strong><br/>Search and payment currency</p></div></details>
        <details name={menuGroup} className="travel-navigation-help"><summary><StitchSymbol name="support_agent" size={19}/> Help &amp; Support <StitchSymbol name="expand_more" size={16}/></summary><div className="travel-navigation-menu">
          <a href={company.emailHref}>{company.email}</a><a href={company.phoneHref}>{company.phone}<small>{company.hours.display}</small></a>
          {helpLinks.map(link => <Link key={link.href} href={link.href}><TravelIcon name={link.icon} size={17}/>{link.label}</Link>)}
          <p className="travel-navigation-testing"><strong>In Testing</strong><br/>No live bookings or payments</p>
        </div></details>
        <Link href="/account" className="travel-navigation-account" aria-label={accountLabel} aria-current={active === "account" ? "page" : undefined}><TravelIcon name="user" size={18}/><span>{accountLabel}</span></Link>
      </div>
      {mobileTitle && <div className="travel-navigation-context">
        {onMobileBack && <button type="button" aria-label="Go back" onClick={onMobileBack}><StitchSymbol name="arrow_back" size={20}/></button>}
        {!onMobileBack && active === "trips" && !tripTools && <Link href="/my-trips" aria-label="Back to My Trips"><StitchSymbol name="arrow_back" size={20}/></Link>}
        <div><strong>{mobileTitle}</strong>{mobileSubtitle && <small>{mobileSubtitle}</small>}</div>
        {tripTools && <><a href="#trip-search" aria-label="Search bookings"><StitchSymbol name="search" size={20}/></a><a href="#trip-updates" aria-label="Booking updates"><StitchSymbol name="notifications" size={20}/></a></>}
        {onMobileEdit && <button type="button" aria-label="Edit search" onClick={onMobileEdit}><StitchSymbol name="edit" size={18}/></button>}
      </div>}
      <dialog className="travel-navigation-drawer" ref={mobileMenu} aria-label="Travel menu" onClose={() => control.current?.focus()} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX > bounds.right) closeMenu();
      }}>
        <div className="travel-navigation-drawer-head"><Link href="/" aria-label="Max Travel home" onClick={closeMenu}><BrandLogo/></Link><button type="button" aria-label="Close navigation" onClick={closeMenu}><TravelIcon name="close" size={24}/></button></div>
        <nav aria-label="Main navigation">
          {productLink("FLIGHT", "Flights")}{productLink("HOTEL", "Hotels")}{productLink("ACTIVITY", "Tours & Activities")}{productLink("PACKAGE", "Flight + Hotel")}
          <Link href="/packages" onClick={closeMenu}>Packages</Link>
          {serviceLinks.map(link => <Link key={link.label} href={link.href} onClick={closeMenu}><TravelIcon name={link.icon} size={19}/>{link.label}</Link>)}
          {helpLinks.map(link => <Link key={link.href} href={link.href} onClick={closeMenu}><TravelIcon name={link.icon} size={19}/>{link.label}</Link>)}
          <Link href="/account" onClick={closeMenu}>{accountLabel}</Link>
        </nav>
        <p className="travel-navigation-testing"><strong>In Testing</strong><br/>No live bookings or payments</p>
      </dialog>
    </header>
  </>;
}

export function HomeServiceRail({product, onProductChange}: {product: "FLIGHT" | "HOTEL" | "PACKAGE" | "ACTIVITY"; onProductChange: (product: "FLIGHT" | "HOTEL" | "PACKAGE" | "ACTIVITY") => void}) {
  return <nav className="home-service-rail" aria-label="Travel services">
    <button type="button" title="Flights" aria-label="Flights" aria-current={product === "FLIGHT" ? "true" : undefined} onClick={() => onProductChange("FLIGHT")}><StitchSymbol name="flight" size={18}/></button>
    <button type="button" title="Hotels" aria-label="Hotels" aria-current={product === "HOTEL" ? "true" : undefined} onClick={() => onProductChange("HOTEL")}><StitchSymbol name="hotel" size={18}/></button>
    <button type="button" title="Tours & Activities" aria-label="Tours & Activities" aria-current={product === "ACTIVITY" ? "true" : undefined} onClick={() => onProductChange("ACTIVITY")}><TravelIcon name="holiday" size={18}/></button>
    <button type="button" title="Flight + Hotel" aria-label="Flight + Hotel" aria-current={product === "PACKAGE" ? "true" : undefined} onClick={() => onProductChange("PACKAGE")}><StitchSymbol name="luggage" size={18}/></button>
    <hr/>
    {serviceLinks.map(link => <Link key={link.href} title={link.label} aria-label={link.label} href={link.href}><TravelIcon name={link.icon} size={18}/></Link>)}
    <hr/>
    <Link title="Find my trip" aria-label="Find my trip" href="/my-trips"><TravelIcon name="receipt" size={18}/></Link>
    <Link title="Help Center" aria-label="Help Center" href="/customer-support"><StitchSymbol name="support_agent" size={18}/></Link>
  </nav>;
}
