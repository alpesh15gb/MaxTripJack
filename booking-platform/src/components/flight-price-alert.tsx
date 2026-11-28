'use client';

import {useEffect, useId, useRef, useState, type MouseEventHandler} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {accountHref} from '@/lib/account-return';
import {displayMoney} from '@/lib/display-money';
import {travelDateLabel} from '@/lib/travel-date';
import {alertStatusLabel, listFlightPriceAlerts, priceAlertsAccountPath, PriceAlertRequestError, samePriceWatch, subscribeFlightPriceAlert, type FlightPriceAlert, type PriceAlertWatch} from '@/lib/flight-price-alert-client';
import CheckoutVerification from './checkout-verification';
import {TravelIcon} from './travel-icon';

export function FlightPriceAlertButton({onClick,disabled,compact=false}:{onClick:MouseEventHandler<HTMLButtonElement>;disabled:boolean;compact?:boolean}) {
  return <button type="button" className={compact?'flight-price-alert-button flight-price-alert-mobile':'flight-price-alert-button'} aria-haspopup="dialog" disabled={disabled} onClick={onClick}>
    <TravelIcon name="bell" size={17}/>Get price alerts
  </button>;
}

export function FlightPriceAlertBanner({route,onClick,disabled}:{route:string;onClick:MouseEventHandler<HTMLButtonElement>;disabled:boolean}) {
  return <section className="flight-price-alert-banner" aria-label="Flight price alert">
    <span className="flight-price-alert-bell"><TravelIcon name="bell" size={22}/></span>
    <div><h2>Track the lowest fare for {route}</h2><p>Get an email if a verified fare drops for your dates.</p></div>
    <button type="button" className="primary" aria-haspopup="dialog" onClick={onClick} disabled={disabled}>Set price alert</button>
  </section>;
}

type PriceAlertDialogProps={
  watch:PriceAlertWatch; route:string; searchEstimate:number; initialEmail?:string;
  opener:HTMLButtonElement; onDismiss:()=>void;
};
type AlertAvailability = {phase:'checking'} | {phase:'unavailable'} | {phase:'error';message:string} | {phase:'ready';alert:FlightPriceAlert|null};

export function FlightPriceAlertDialog({watch,route,searchEstimate,initialEmail='',opener,onDismiss}:PriceAlertDialogProps) {
  const title=useId(), dialog=useRef<HTMLDialogElement>(null), request=useRef<AbortController|null>(null);
  const inFlight=useRef(false), [saving,setSaving]=useState(false);
  const [email,setEmail]=useState(initialEmail), [attempt,reload]=useState(0);
  const [availability,setAvailability]=useState<AlertAvailability>({phase:'checking'});
  const [message,setMessage]=useState('');
  const {from,to,date,cabin}=watch;

  useEffect(()=>{
    const element=dialog.current;
    if(element&&!element.open)element.showModal();
    return ()=>{
      request.current?.abort();
      if(!element?.isConnected&&opener.isConnected)opener.focus({preventScroll:true});
    };
  },[opener]);

  useEffect(()=>{
    const controller=new AbortController();
    void listFlightPriceAlerts(controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      setAvailability(result.available
        ? {phase:'ready',alert:result.alerts.find(item=>samePriceWatch(item,{from,to,date,cabin}))??null}
        : {phase:'unavailable'});
    }).catch(error=>{
      if(!controller.signal.aborted)setAvailability({phase:'error',message:error instanceof Error?error.message:'We couldn’t check price alerts.'});
    });
    return ()=>controller.abort();
  },[attempt,from,to,date,cabin]);

  function checkAvailability(){setMessage('');setAvailability({phase:'checking'});reload(value=>value+1);}

  async function subscribe(){
    if(!email || inFlight.current || availability.phase!=='ready' || availability.alert)return;
    inFlight.current=true;setSaving(true);setMessage('');
    const controller=new AbortController();request.current=controller;
    try{
      const alert=await subscribeFlightPriceAlert(watch,controller.signal);
      if(!controller.signal.aborted)setAvailability({phase:'ready',alert});
    }catch(error){
      if(controller.signal.aborted)return;
      if(error instanceof PriceAlertRequestError && (error.status===401||error.status===403))setEmail('');
      if(error instanceof PriceAlertRequestError && error.status===503)setAvailability({phase:'unavailable'});
      setMessage(error instanceof Error?error.message:'We couldn’t confirm the alert. Check your alerts before trying again.');
    }finally{
      request.current=null;inFlight.current=false;
      if(!controller.signal.aborted)setSaving(false);
    }
  }

  const alert=availability.phase==='ready'?availability.alert:null;
  return <dialog ref={dialog} className="flight-price-alert-dialog" aria-labelledby={title} onClose={onDismiss}>
    <button type="button" className="flight-price-alert-close" aria-label="Close price alert" onClick={()=>dialog.current?.close()} autoFocus><TravelIcon name="close" size={18}/></button>
    <div className="flight-price-alert-content">
      <Image src="/brand/maxtravel-logo.jpg" alt="Max Travel" width={105} height={39} className="flight-price-alert-logo"/>
      <h2 id={title}>Track the cheapest fare for your dates</h2>
      {availability.phase==='checking'&&<p role="status">Checking price alert availability…</p>}
      {availability.phase==='unavailable'&&<><p role="status">Price alerts are currently unavailable.</p><Link className="secondary" href={email?priceAlertsAccountPath:accountHref(priceAlertsAccountPath)+'#flight-price-alerts'}>Manage saved alerts</Link></>}
      {availability.phase==='error'&&<><p role="alert">{availability.message}</p><button type="button" className="secondary" onClick={checkAvailability}>Check again</button></>}
      {availability.phase==='ready'&&(alert?<>
        <p className="flight-price-alert-status" role="status"><TravelIcon name="check" size={18}/>{alertStatusLabel[alert.status]}</p>
        {alert.status==='waiting'&&<p>We’ll set your starting fare after the first verified check.</p>}
        {alert.status==='watching'&&alert.baselineMinor!==null&&<p>Tracking fares below {displayMoney(alert.baselineMinor)}.</p>}
        {alert.status==='notified'&&alert.notifiedMinor!==null&&<p>Lower fare observed at {displayMoney(alert.notifiedMinor)}.</p>}
        <Link className="secondary" href={priceAlertsAccountPath}>Manage price alerts</Link>
      </>:email?<>
        <p>Get an email at <strong>{email}</strong> if the verified one-way fare drops for this date and cabin.</p>
        <button type="button" className="primary" disabled={saving} onClick={()=>void subscribe()}>{saving?'Saving price alert…':'Set price alert'}</button>
      </>:<>
        <p>Sign in or create an account to set this price alert. We’ll email you when a lower fare is found.</p>
        <CheckoutVerification emailOnly initialEmail={initialEmail} context="price-alert" onVerified={contact=>{setEmail(contact.email);checkAvailability();}}/>
      </>)}
      {message&&<p role="alert">{message}</p>}
    </div>
    <aside className="flight-price-alert-preview" aria-label="Search being tracked">
      <Image src="/travel/destina-hero.jpg" alt="" fill sizes="(max-width: 700px) 100vw, 420px"/>
      <div className="flight-price-alert-summary">
        <span><TravelIcon name="bell" size={15}/>Price alert</span>
        <strong>{route}</strong>
        <p>{travelDateLabel(date)} · 1 traveller</p>
        <p>Current search estimate <b>{displayMoney(searchEstimate)}</b></p>
      </div>
    </aside>
  </dialog>;
}
