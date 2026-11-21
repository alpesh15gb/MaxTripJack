"use client";

import Link from 'next/link';
import {useId, useState} from 'react';
import {authClient} from '@/lib/auth-client';
import {BrandLogo} from './brand-logo';
import {useCompanyProfile} from './company-profile-context';
import {StitchSymbol} from './stitch-symbol';

export type HeaderProps = {
  active?: 'flights' | 'hotels' | 'trips' | 'account' | 'packages';
  onProductChange?: (product: 'FLIGHT' | 'HOTEL') => void;
  hotelHref?: '/hotels' | '/book?product=HOTEL';
  mobileTitle?: string;
  mobileSubtitle?: string;
  onMobileEdit?: () => void;
  onMobileBack?: () => void;
  tripTools?: boolean;
};

export function ConciergeBrand({priority = false}: {priority?: boolean}) {
  const company = useCompanyProfile();
  if (company.logoDataUrl) return <BrandLogo/>;
  return <span className="concierge-brand">
    <span className="concierge-mark"><StitchSymbol name={priority ? 'connecting_airports' : 'flight_takeoff'} size={22}/>{!priority && <span className="phone-brand-plane"><StitchSymbol name="flight" size={20}/></span>}</span>
    <span className="concierge-brand-copy"><strong>{company.name === 'MaxTravel' ? <>Max<em>Travel</em></> : company.name}</strong><small>Concierge Desk</small></span>
  </span>;
}

export function ConciergeHeader({active, onProductChange, hotelHref, mobileTitle, mobileSubtitle, onMobileEdit, onMobileBack, tripTools, dock, priority, isHome}: HeaderProps & {dock: boolean; priority: boolean; isHome: boolean}) {
  const company = useCompanyProfile();
  const {data: session, isPending} = authClient.useSession();
  const navId = useId();
  const [expanded, setExpanded] = useState(false);
  const displayPhone = company.phone.replace(/^(\+91)(\d{5})(\d{5})$/, '$1 $2 $3');
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];
  const avatar = <span className="concierge-account-symbol"><StitchSymbol name="person" size={18}/></span>;
  return <>
    <a className="travel-skip" href="#main-content">Skip to main content</a>
    <header className={`concierge-header ${dock ? 'has-dock' : 'has-menu'}${priority ? ' priority-desk' : ''}${isHome ? ' home-desk' : ''}`}>
      {priority && <div className="concierge-priority"><div>
        <a href={company.phoneHref}><i/>{company.address.addressLocality} priority desk <b>{displayPhone}</b></a>
        <span>Boutique Travel Concierge &amp; Bespoke Itineraries</span><span><StitchSymbol name="language" size={14}/>₹ INR · EN</span>
      </div></div>}
      <div className="concierge-bar">
        <Link href="/" aria-label="Max Travel home" className="concierge-brand-link"><ConciergeBrand priority={priority}/></Link>
        {!dock && (onMobileBack ?
          <button className="concierge-mobile-back" type="button" aria-label="Go back" onClick={onMobileBack}><StitchSymbol name="arrow_back" size={22}/></button> :
          <Link className="concierge-mobile-back" href={priority ? '/my-trips' : '/'} aria-label={priority ? 'Back to My trips' : 'Back to home'}><StitchSymbol name="arrow_back" size={22}/></Link>)}
        {mobileTitle && <div className="concierge-page-name"><strong>{mobileTitle}</strong>{mobileSubtitle && <small>{mobileSubtitle}</small>}</div>}
        <nav id={navId} aria-label="Main navigation" data-expanded={expanded} onKeyDown={event => {
          if (event.key === 'Escape') {setExpanded(false); event.currentTarget.closest('header')?.querySelector<HTMLButtonElement>('.concierge-menu-button')?.focus();}
        }}>
          {(['FLIGHT','HOTEL'] as const).map(product => {
            const flight = product === 'FLIGHT';
            const label = flight ? 'Flights' : 'Hotels';
            const current = active === (flight ? 'flights' : 'hotels') ? 'page' : undefined;
            const content = <><StitchSymbol name={flight ? 'flight' : 'hotel'} size={21}/>{label}</>;
            return onProductChange ? <button key={product} type="button" aria-current={current} onClick={() => {setExpanded(false); onProductChange(product);}}>{content}</button>
              : <Link key={product} prefetch={false} href={flight ? '/book?product=FLIGHT' : hotelHref ?? '/book?product=HOTEL'} aria-current={current} onClick={() => setExpanded(false)}>{content}</Link>;
          })}
          <Link href="/packages" aria-label="Packages"><StitchSymbol name={priority ? 'luggage' : 'beach_access'} size={21}/><span className="concierge-desk-only">Holiday&nbsp;</span>Packages</Link>
          <Link className="concierge-desk-only" href="/visa-guide">Visas</Link>
          <Link className="concierge-desk-only" href="/travel-insurance-guide">Travel Insurance</Link>
          <Link className="concierge-nav-trips" href="/my-trips" aria-current={active==='trips'?'page':undefined}><StitchSymbol name={priority ? 'confirmation_number' : 'luggage'} size={21}/>My Trips</Link>
          <Link className="concierge-phone-only" href="/account"><StitchSymbol name="manage_accounts" size={21}/>{priority ? 'Profile' : 'Account'}</Link>
        </nav>
        <div className="concierge-tools">
          {tripTools && <><a href="#trip-search" className="concierge-action-mobile" aria-label="Search bookings"><StitchSymbol name="search" size={22}/></a><a href="#trip-updates" className="concierge-action-mobile" aria-label="Booking updates"><StitchSymbol name="notifications" size={22}/></a></>}
          {onMobileEdit && <button className="concierge-action-mobile" type="button" aria-label="Edit search" onClick={onMobileEdit}><StitchSymbol name="edit" size={20}/></button>}
          <a className={`concierge-hub${onMobileEdit || tripTools ? ' desktop-hub' : ''}`} href={company.phoneHref} aria-label={`Call the ${company.address.addressLocality} desk`}><span>{company.address.addressLocality} Hub<strong>{displayPhone}</strong></span><i><StitchSymbol name="call" size={18}/><span className="phone-support-symbol"><StitchSymbol name="support_agent" size={20}/></span></i></a>
          <span className="concierge-currency"><span className="desktop-currency"><StitchSymbol name="currency_rupee" size={18}/> INR · EN</span><span className="phone-currency"><StitchSymbol name="payments" size={16}/> INR ₹</span></span>
          <Link className="concierge-tools-trips" href="/my-trips"><StitchSymbol name="luggage" size={20}/>My Trips</Link>
          <Link className="concierge-account" href="/account" aria-label="My account">{avatar}<span className="concierge-account-copy">{!priority && <small>{firstName ? `Hello, ${firstName}` : 'Hello, Guest'}</small>}<b>{isPending || priority || session ? 'Account' : 'Sign In'}</b></span></Link>
          {!dock && <button className="concierge-menu-button" type="button" aria-label={expanded ? 'Close navigation' : 'Open navigation'} aria-expanded={expanded} aria-controls={navId} onClick={()=>setExpanded(!expanded)}>{avatar}</button>}
        </div>
      </div>
    </header>
  </>;
}
