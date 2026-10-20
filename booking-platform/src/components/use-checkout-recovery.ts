'use client';
import {useEffect,useRef,useState} from 'react';
import {CHECKOUT_RECOVERY_KEY,clearCheckoutMarker,parseCheckoutMarker,parseCheckoutRecoveryStatus,isResolvedCheckout,type CheckoutMarker,type CheckoutRecoveryStatus} from '@/lib/checkout-recovery';

export default function useCheckoutRecovery(){
  const [checking,setChecking]=useState(true),[pending,setPending]=useState<CheckoutMarker|null>(null),[status,setStatus]=useState<CheckoutRecoveryStatus|null>(null),[message,setMessage]=useState('');
  const active=useRef(true),generation=useRef(0);
  async function reconcile(marker:CheckoutMarker){
    const request=++generation.current;
    setChecking(true);setPending(marker);setStatus(null);setMessage('Checking your previous checkout before starting another.');
    try{
      const query=marker.bookingId?`bookingId=${encodeURIComponent(marker.bookingId)}`:`quoteId=${encodeURIComponent(marker.quoteId)}`;
      const response=await fetch(`/api/payments/status?${query}`,{cache:'no-store'});
      const data=await response.json();
      if(!active.current||request!==generation.current)return;
      if(response.status===404||response.status===401){setStatus(null);setMessage('We cannot verify the original checkout in this account. Sign in to the account that started it, then check its payment status. Do not start another payment for the same trip.');return;}
      if(!response.ok)throw Error(data.error||'We could not check your previous payment. Sign in and check My trips before paying again.');
      const verified=parseCheckoutRecoveryStatus(data);
      if(!verified)throw Error('Payment status could not be verified. Check My trips or contact operations before paying again.');
      setStatus(verified);
      if(isResolvedCheckout(verified)){clearCheckoutMarker(marker);setPending(null);setMessage('Your previous checkout has a confirmed payment status. Open My trips for booking details.');}
      else setMessage(verified.message||'An earlier checkout needs attention. Check its status before creating another payment.');
    }catch(error){if(active.current&&request===generation.current)setMessage(error instanceof Error?error.message:'Check your previous payment in My trips.');}
    finally{if(active.current&&request===generation.current)setChecking(false);}
  }
  useEffect(()=>{
    active.current=true;
    const timer=setTimeout(()=>{
      let marker:CheckoutMarker|null=null;
      try{marker=parseCheckoutMarker(sessionStorage.getItem(CHECKOUT_RECOVERY_KEY));}catch{/* A new checkout will verify storage before any mutation. */}
      if(marker)void reconcile(marker);else setChecking(false);
    },0);
    return()=>{active.current=false;generation.current+=1;clearTimeout(timer);};
  },[]);
  function clear(){if(pending)clearCheckoutMarker(pending);setPending(null);setStatus(null);setMessage('');}
  function invalidate(){setStatus(null);}
  return {checking,pending,status,message,blocked:checking||Boolean(pending),reconcile,clear,invalidate};
}
