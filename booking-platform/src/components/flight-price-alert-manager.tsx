'use client';

import {useEffect, useRef, useState} from 'react';
import {displayMoney} from '@/lib/display-money';
import {travelDateLabel} from '@/lib/travel-date';
import {alertStatusLabel, listFlightPriceAlerts, stopFlightPriceAlert, type FlightPriceAlert} from '@/lib/flight-price-alert-client';
import {TravelIcon} from './travel-icon';

export default function FlightPriceAlertManager() {
  const [visible,setVisible]=useState(false), [attempt,setAttempt]=useState(0);
  const [snapshot,setSnapshot]=useState<{available:boolean;alerts:FlightPriceAlert[]}|null>(null);
  const alerts=snapshot?.alerts;
  const [error,setError]=useState(''), [message,setMessage]=useState('');
  const heading=useRef<HTMLElement>(null);
  const stopped=useRef(new Set<string>());
  const mutation=useRef<AbortController|null>(null), [stopping,setStopping]=useState<string|null>(null);

  useEffect(()=>()=>mutation.current?.abort(),[]);
  useEffect(()=>{
    if(!visible)return;
    const controller=new AbortController();
    void listFlightPriceAlerts(controller.signal).then(result=>{
      if(!controller.signal.aborted)setSnapshot({...result,alerts:result.alerts.filter(alert=>!stopped.current.has(alert.id))});
    }).catch(failure=>{
      if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'We couldn’t load your price alerts.');
    });
    return ()=>controller.abort();
  },[visible,attempt]);

  async function stop(alert:FlightPriceAlert){
    if(mutation.current||!snapshot)return;
    const controller=new AbortController();mutation.current=controller;
    setStopping(alert.id);setError('');setMessage('');
    try{
      await stopFlightPriceAlert(alert.id,controller.signal);
      if(controller.signal.aborted)return;
      stopped.current.add(alert.id);
      setSnapshot(current=>current&&({...current,alerts:current.alerts.filter(item=>item.id!==alert.id)}));
      setMessage(`Stopped the price alert for ${alert.from} to ${alert.to}.`);
      heading.current?.focus();
    }catch(failure){
      if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'We couldn’t confirm whether the price alert stopped.');
    }finally{
      mutation.current=null;
      if(!controller.signal.aborted)setStopping(null);
    }
  }

  return <details id="flight-price-alerts" className="private-account-panel flight-price-alert-manager" ref={element=>{
    if(element && window.location.hash==='#flight-price-alerts' && !element.dataset.anchorOpened){element.dataset.anchorOpened='true';element.open=true;}
  }} onToggle={event=>{
    if(event.currentTarget.open){setSnapshot(null);setError('');setAttempt(value=>value+1);}
    setVisible(event.currentTarget.open);
  }}>
    <summary ref={heading}><TravelIcon name="bell" size={20}/>Flight price alerts</summary>
    {visible&&<>
      {error&&<><p role="alert">{error}</p><button type="button" className="secondary" disabled={Boolean(stopping)} onClick={()=>{
        setSnapshot(null);setError('');setAttempt(value=>value+1);
      }}>Check price alerts</button></>}
      {message&&<p role="status">{message}</p>}
      {!alerts&&!error&&<p role="status">Checking your price alerts…</p>}
      {snapshot&&!snapshot.available&&<p className="private-alert-paused" role="status">Fare monitoring is temporarily unavailable. You can still remove saved alerts.</p>}
      {alerts?.length===0&&<p>You have no saved price alerts.</p>}
      {alerts&&alerts.length>0&&<ul className="flight-price-alert-list">
        {alerts.map(alert=><li key={alert.id}>
          <div><strong>{alert.from} → {alert.to}</strong><span>{travelDateLabel(alert.date)} · {alert.cabin.replaceAll('_',' ').toLowerCase()}</span>
            <span className="private-alert-status">{alertStatusLabel[alert.status]}</span>
            {alert.baselineMinor!==null&&<span>Starting fare {displayMoney(alert.baselineMinor)}</span>}
            {alert.status==='notified'&&alert.notifiedMinor!==null&&<span>Lower fare observed at {displayMoney(alert.notifiedMinor)}</span>}
          </div>
          <button type="button" className="secondary" disabled={Boolean(stopping)} aria-label={`Stop price alert for ${alert.from} to ${alert.to} on ${travelDateLabel(alert.date)}`} onClick={()=>void stop(alert)}>
            {stopping===alert.id?'Stopping…':'Stop alert'}
          </button>
        </li>)}
      </ul>}
    </>}
  </details>;
}
