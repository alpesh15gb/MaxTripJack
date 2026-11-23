'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useTransition} from 'react';
import {TravelFooter,TravelHeader} from './travel-shell';
import './public-refresh.css';

export default function PackageUnavailable({reset}: {reset?:()=>void}) {
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  return <div className="travel-app public-refresh">
    <TravelHeader active="packages"/>
    <main id="main-content" className="package-main">
      <section className="package-state" role="alert">
        <h1>Package information is temporarily unavailable</h1>
        <p>We couldn’t check the latest published details. This does not mean the package has been withdrawn.</p>
        <button type="button" disabled={pending} onClick={()=>startTransition(()=>{router.refresh();reset?.();})}>{pending?'Checking again…':'Try again'}</button>
        <Link href="/packages">Browse packages</Link>
        <Link href="/customer-support">Contact support</Link>
      </section>
    </main>
    <TravelFooter/>
  </div>;
}
