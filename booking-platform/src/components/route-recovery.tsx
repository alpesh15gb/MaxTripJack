"use client";
import {useTransition} from 'react';
import Link from 'next/link';
import './public-refresh.css';

export default function RouteRecovery({retry}:{retry:()=>void}){
 const [pending, startTransition] = useTransition();
 return (
   <main id="main-content" className="state-page public-refresh" aria-labelledby="route-recovery-title">
     <h1 id="route-recovery-title">We couldn’t load this page</h1>
     <p role="alert">Try again, or check My trips for your latest booking status.</p>
     <div className="state-actions">
       <button type="button" className="state-primary" disabled={pending} onClick={()=>startTransition(retry)}>{pending?'Trying again…':'Try again'}</button>
       <Link href="/my-trips" prefetch={false}>My trips</Link>
       <Link href="/customer-support" prefetch={false}>Contact support</Link>
     </div>
   </main>
 );
}
