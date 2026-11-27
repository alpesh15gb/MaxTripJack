'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {clearCheckoutMarker,readCheckoutMarkers,parseCheckoutRecoveryStatus,isResolvedCheckout,isExpiredCheckoutWithoutPayment,type CheckoutMarker,type CheckoutRecoveryStatus} from '@/lib/checkout-recovery';

export default function useCheckoutRecovery(){
  const [checking,setChecking]=useState(true),[pending,setPending]=useState<CheckoutMarker|null>(null),[status,setStatus]=useState<CheckoutRecoveryStatus|null>(null),[message,setMessage]=useState('');
  const [pendingCount,setPendingCount]=useState(0);
  const active=useRef(true),generation=useRef(0);
  const selected=useRef<CheckoutMarker|null>(null);
  const readQueue=useCallback(()=>{
    try{const markers=readCheckoutMarkers();setPendingCount(markers.length);return markers;}catch{return null;}
  },[]);
  const reconcile=useCallback(async (marker:CheckoutMarker)=>{
    const request=++generation.current;
    selected.current=marker;readQueue();
    setChecking(true);setPending(marker);setStatus(null);setMessage('Checking your previous payment status.');
    try{
      const query=marker.bookingId?`bookingId=${encodeURIComponent(marker.bookingId)}`:`quoteId=${encodeURIComponent(marker.quoteId)}`;
      const response=await fetch(`/api/payments/status?${query}`,{cache:'no-store',signal:AbortSignal.timeout(20_000)});
      const data=await response.json();
      if(!active.current||request!==generation.current)return;
      if(response.status===404||response.status===401){setStatus(null);setMessage('We cannot verify the original checkout in this account. Sign in to the account that started it, then check its payment status. Do not start another payment for the same trip.');return;}
      if(!response.ok)throw Error(data.error||'We could not check your previous payment. Sign in and check My trips before paying again.');
      const verified=parseCheckoutRecoveryStatus(data);
      if(!verified||(marker.bookingId&&verified.bookingId&&verified.bookingId!==marker.bookingId)||(verified.quoteId&&verified.quoteId!==marker.quoteId))throw Error('Payment status could not be verified. Check My trips or contact operations before paying again.');
      const expired=isExpiredCheckoutWithoutPayment(verified,marker);
      if(verified.status==='EXPIRED_WITHOUT_PAYMENT'&&!expired)throw Error('Payment status could not be verified. Check My trips or contact operations before paying again.');
      if((expired||isResolvedCheckout(verified))&&!clearCheckoutMarker(marker,expired)){
        throw Error('The previous checkout changed or could not be cleared. Check its status again before paying.');
      }
      setStatus(verified);
      if(expired||isResolvedCheckout(verified)){readQueue();selected.current=null;setPending(null);setMessage(expired?'The previous quote expired before a payment order was created.':'Your previous checkout has a confirmed payment status. Open My trips for booking details.');}
      else setMessage(verified.message||'An earlier checkout needs attention. Check its status before creating another payment.');
    }catch(error){if(active.current&&request===generation.current)setMessage(error instanceof Error?error.message:'Check your previous payment in My trips.');}
    finally{if(active.current&&request===generation.current)setChecking(false);}
  },[readQueue]);
  useEffect(()=>{
    active.current=true;
    const timer=setTimeout(()=>{
      const marker=readQueue()?.[0];
      if(marker)void reconcile(marker);else setChecking(false);
    },0);
    return()=>{active.current=false;generation.current+=1;clearTimeout(timer);};
  },[readQueue,reconcile]);
  function clear(expected:Partial<CheckoutMarker>){
    if(!clearCheckoutMarker(expected))return;
    readQueue();
    const current=selected.current;
    if(current&&(expected.quoteId?current.quoteId!==expected.quoteId:current.bookingId!==expected.bookingId))return;
    generation.current+=1;selected.current=null;
    setChecking(false);setPending(null);setStatus(null);setMessage('');
  }
  function checkAnother(){
    const markers=readQueue();
    if(!markers?.length)return;
    const index=markers.findIndex(marker=>marker.quoteId===selected.current?.quoteId);
    void reconcile(markers[(index+1)%markers.length]);
  }
  function invalidate(){setStatus(null);}
  return {checking,pending,pendingCount,status,message,blocked:checking||Boolean(pending)||pendingCount>0,reconcile,checkAnother,clear,invalidate};
}
