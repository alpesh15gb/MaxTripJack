"use client";
import Link from 'next/link';
export default function GlobalRouteError({reset}:{reset:()=>void}){
 return <main id="main-content" className="state-page" role="alert"><span className="state-code" aria-hidden="true">Oops</span><h1>Something went wrong</h1><p>We couldn’t load this page. No booking or payment has been submitted. Please try again.</p><div className="state-actions"><button type="button" className="state-primary" onClick={reset}>Try again</button><Link href="/">Back to home</Link><Link href="/customer-support">Contact support</Link></div></main>;
}
