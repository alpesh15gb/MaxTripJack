"use client";
import {TravelHeader, TravelFooter} from '@/components/travel-shell';
import RouteRecovery from '@/components/route-recovery';

export default function RouteError({retry}:{retry:()=>void}){
 return <><TravelHeader/><RouteRecovery retry={retry}/><TravelFooter/></>;
}
