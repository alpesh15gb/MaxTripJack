"use client";

import Link from 'next/link';
import {useId, useState} from 'react';
import {authClient} from '@/lib/auth-client';
import {BrandLogo} from './brand-logo';
import {useCompanyProfile} from './company-profile-context';
import {StitchSymbol} from './stitch-symbol';

export type HeaderProps = {
  active?: 'flights' | 'hotels' | 'trips' | 'account' | 'packages' | 'visas' | 'insurance';
  onProductChange?: (product: 'FLIGHT' | 'HOTEL') => void;
  hotelHref?: '/hotels' | '/book?product=HOTEL';
  mobileTitle?: string;
  mobileSubtitle?: string;
  onMobileEdit?: () => void;
  onMobileBack?: () => void;
  tripTools?: boolean;
};

export function ConciergeHeader({active, onProductChange, hotelHref, mobileTitle, mobileSubtitle, onMobileEdit, onMobileBack, tripTools, dock, isHome, showTesting}: HeaderProps & {dock: boolean; isHome: boolean; showTesting: boolean}) {
  const company = useCompanyProfile();
  const {data: session, isPending} = authClient.useSession();
  const navId = useId();
  const [expanded, setExpanded] = useState(false);
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];
  const avatar = <span className="concierge-account-symbol"><StitchSymbol name="person" size={18}/></span>;
  return <>
    <a className="travel-skip" href="#main-content">Skip to main content</a>
    {showTesting && <div className="concierge-testing"><strong>In Testing</strong><span>No live bookings or payments</span></div>}
    <header className={`concierge-header ${dock ? 'has-dock' : 'has-menu'}${isHome ? ' home-desk' : ''}${!dock && mobileTitle ? ' contextual-header' : ''}`}>
      <div className="concierge-bar">
        <Link href="/" aria-label="Max Travel home" className="concierge-brand-link"><BrandLogo/></Link>
        {!dock && mobileTitle && (onMobileBack ?
          <button className="concierge-mobile-back" type="button" aria-label="Go back" onClick={onMobileBack}><StitchSymbol name="arrow_back" size={22}/></button> :
          <Link className="concierge-mobile-back" href={active === 'trips' ? '/my-trips' : '/'} aria-label={active === 'trips' ? 'Back to My trips' : 'Back to home'}><StitchSymbol name="arrow_back" size={22}/></Link>)}
        {mobileTitle && <div className="concierge-page-name">
          <Link href="/" aria-label="Max Travel home" className="concierge-context-brand"><BrandLogo variant="compact"/></Link>
          <strong>{mobileTitle}</strong>{mobileSubtitle && <small>{mobileSubtitle}</small>}
        </div>}
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
          <Link href="/packages" aria-label="Packages" aria-current={active==='packages'?'page':undefined}><StitchSymbol name="beach_access" size={21}/><span className="concierge-desk-only">Holiday&nbsp;</span>Packages</Link>
          <Link className="concierge-desk-only" href="/visa-guide" aria-current={active==='visas'?'page':undefined}>Visas</Link>
          <Link className="concierge-desk-only" href="/travel-insurance-guide" aria-current={active==='insurance'?'page':undefined}>Travel Insurance</Link>
          <Link className="concierge-nav-trips" href="/my-trips" aria-current={active==='trips'?'page':undefined}><StitchSymbol name="luggage" size={21}/>My Trips</Link>
          <Link className="concierge-phone-only" href="/account" aria-current={active==='account'?'page':undefined}><StitchSymbol name="manage_accounts" size={21}/>Account</Link>
        </nav>
        <div className="concierge-tools">
          {tripTools && <><a href="#trip-search" className="concierge-action-mobile" aria-label="Search bookings"><StitchSymbol name="search" size={22}/></a><a href="#trip-updates" className="concierge-action-mobile" aria-label="Booking updates"><StitchSymbol name="notifications" size={22}/></a></>}
          {onMobileEdit && <button className="concierge-action-mobile" type="button" aria-label="Edit search" onClick={onMobileEdit}><StitchSymbol name="edit" size={20}/></button>}
          <a className={`concierge-hub${onMobileEdit || tripTools ? ' desktop-hub' : ''}`} href={company.phoneHref} aria-label={`Call the ${company.address.addressLocality} desk`}><span>{company.address.addressLocality} Hub<strong>{company.phone}</strong></span><i><StitchSymbol name="call" size={18}/><span className="phone-support-symbol"><StitchSymbol name="support_agent" size={20}/></span></i></a>
          <span className="concierge-currency">INR · EN</span>
          <Link className="concierge-support" href="/customer-support"><StitchSymbol name="support_agent" size={18}/>Help</Link>
          <Link className="concierge-tools-trips" href="/my-trips" aria-current={active==='trips'?'page':undefined}><StitchSymbol name="luggage" size={20}/>My Trips</Link>
          <Link className="concierge-account" href="/account" aria-label="My account" aria-current={active==='account'?'page':undefined}>{avatar}<span className="concierge-account-copy"><small>{firstName ? `Hello, ${firstName}` : 'Hello, Guest'}</small><b>{isPending || session ? 'Account' : 'Sign in'}</b></span></Link>
          {!dock && <button className="concierge-menu-button" type="button" aria-label={expanded ? 'Close navigation' : 'Open navigation'} aria-expanded={expanded} aria-controls={navId} onClick={()=>setExpanded(!expanded)}>{mobileTitle ? avatar : <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}</button>}
        </div>
      </div>
    </header>
  </>;
}
