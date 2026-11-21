"use client";
import Link from 'next/link';
import {TravelHeader, TravelFooter} from '@/components/travel-shell';
import '@/components/public-refresh.css';
export default function GlobalRouteError({reset}:{reset:()=>void}){
 return <><TravelHeader/><main id="main-content" className="state-page public-refresh" role="alert"><h1>Something went wrong</h1><p>We couldn’t load this page. Try again, or check My trips for your latest booking status.</p><div className="state-actions"><button type="button" className="state-primary" onClick={reset}>Try again</button><Link href="/my-trips">My trips</Link><Link href="/customer-support">Contact support</Link></div></main><TravelFooter/></>;
}
