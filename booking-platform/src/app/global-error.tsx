"use client";
import RouteRecovery from '@/components/route-recovery';

export default function GlobalError({retry}:{retry:()=>void}){
 return (
   <html lang="en">
     <body className="global-error-document"><RouteRecovery retry={retry}/></body>
   </html>
 );
}
