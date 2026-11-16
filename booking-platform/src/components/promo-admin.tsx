"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import '@/app/operations-experience.css';
type Row={id:string;version:number;code:string;product:string;discount_minor:string;discount_basis_points:number;minimum_minor:string;maximum_discount_minor:string|null;expires_at:string;active:boolean;discoverable:boolean};
function amount(value:FormDataEntryValue|null){const s=String(value||'0');if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Use positive amounts with up to two decimal places.');return Math.round(Number(s)*100);}
export default function PromoAdmin(){
 const [rows,setRows]=useState<Row[]>([]),[editing,setEditing]=useState<Row|null|undefined>(undefined),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[allowed,setAllowed]=useState(false);
 const load=useCallback(async()=>{try{const response=await fetch('/api/admin/promo-codes',{signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error);setRows(data.rows);setAllowed(true);}catch(e){setMessage(e instanceof Error?e.message:'Unable to load promo codes.');}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 if(!allowed)return <main className="page-shell"><h1>Promo codes</h1><p role="status">{message||"Checking pricing access…"}</p><Link href="/account">Account & security</Link><button className="secondary" onClick={()=>void load()}>Check access</button></main>;
 return <main className="page-shell"><Link href="/operations?desk=pricing">← Pricing rules</Link><h1>Promo codes</h1><p>Configure discounts for new bookings. Discounts are capped so the total never falls below supplier cost. No usage limit is applied.</p><button className="primary" disabled={busy} onClick={()=>{setEditing(null);setMessage('');}}>Create promo code</button><button className="secondary" disabled={busy} onClick={()=>void load()}>Refresh list</button>
 {message&&<p role="status">{message}</p>}
 {editing!==undefined&&<form key={editing?.id??'new'} className="white-card" onSubmit={async e=>{e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);setBusy(true);setMessage('');try{
  const payload={id:editing?.id??crypto.randomUUID(),version:editing?.version??0,code:String(f.get('code')).trim().toUpperCase(),product:String(f.get('product')),discountMinor:f.get('mode')==='FIXED'?amount(f.get('discount')):0,discountBasisPoints:f.get('mode')==='PERCENT'?amount(f.get('discount')):0,minimumMinor:amount(f.get('minimum')),maximumDiscountMinor:f.get('maximum')?amount(f.get('maximum')):null,expiresAt:new Date(String(f.get('expiry'))).toISOString(),active:f.get('active')==='on',discoverable:f.get('discoverable')==='on'};
  const response=await fetch('/api/admin/promo-codes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to save promo code.');setEditing(undefined);setMessage('Promo code saved.');await load();
 }catch(e){setMessage((e instanceof Error?e.message:'Save failed.')+' Refresh the list before retrying if the outcome is uncertain.');}finally{setBusy(false);}}}>
 <h2>{editing?'Edit promo code':'New promo code'}</h2><fieldset disabled={busy} style={{border:0,padding:0,display:'grid',gap:16}}>
 <label>Code<input name="code" required pattern="[A-Za-z0-9_-]{3,32}" maxLength={32} defaultValue={editing?.code} readOnly={Boolean(editing)}/></label>
 <label>Service<select aria-label="Service" name="product" defaultValue={editing?.product??'ALL'}><option value="ALL">Flights and hotels</option><option value="FLIGHT">Flights</option><option value="HOTEL">Hotels</option></select></label>
 <label>Discount type<select aria-label="Discount type" name="mode" defaultValue={editing?.discount_basis_points?'PERCENT':'FIXED'}><option value="FIXED">Fixed amount (INR)</option><option value="PERCENT">Percentage of selling price</option></select></label>
 <label>Discount value<input name="discount" type="number" min="0.01" step="0.01" required defaultValue={editing?Number(editing.discount_basis_points||editing.discount_minor)/100:undefined}/></label>
 <label>Minimum booking value (INR)<input name="minimum" type="number" min="0" step="0.01" required defaultValue={Number(editing?.minimum_minor??0)/100}/></label>
 <label>Maximum discount (INR, optional)<input name="maximum" type="number" min="0.01" step="0.01" defaultValue={editing?.maximum_discount_minor?Number(editing.maximum_discount_minor)/100:''}/></label>
 <label>Expiry (your local time)<input name="expiry" type="datetime-local" required defaultValue={editing?new Date(new Date(editing.expires_at).getTime()-new Date(editing.expires_at).getTimezoneOffset()*60000).toISOString().slice(0,16):''}/></label>
 <label><input name="active" type="checkbox" defaultChecked={editing?.active??true}/> Enabled</label>
 <label><input name="discoverable" type="checkbox" defaultChecked={editing?.discoverable??false} aria-describedby="promo-visibility-help"/> Show in checkout offers</label>
 <small id="promo-visibility-help">Eligible customers can see and apply this code at checkout. Leave unchecked to share it privately.</small>
 <button className="primary">Save promo code</button><button type="button" className="secondary" onClick={()=>setEditing(undefined)}>Cancel</button></fieldset></form>}
 <div style={{display:'grid',gap:16,marginTop:24}}>{rows.length===0&&<section className="white-card"><h2>No promo codes yet</h2><p>Create your first code to offer a discount on flights, hotels or both.</p></section>}{rows.map(row=><article className="white-card" key={row.id}><h2>{row.code}</h2><p>{row.product==='ALL'?'Flights and hotels':row.product} · {row.active?'Enabled':'Disabled'} · {row.discount_basis_points?`${row.discount_basis_points/100}%`:`₹${Number(row.discount_minor)/100}`} discount</p><p>{row.discoverable?'Shown in checkout offers when eligible':'Private code'}</p><p>Minimum ₹{Number(row.minimum_minor)/100}{row.maximum_discount_minor?` · Maximum discount ₹${Number(row.maximum_discount_minor)/100}`:''}</p><p>Expires {new Date(row.expires_at).toLocaleString()}</p><button className="secondary" disabled={busy} onClick={()=>{setEditing(row);setMessage('');window.scrollTo({top:0,behavior:'smooth'});}}>Edit / disable</button></article>)}</div>
 </main>;
}
