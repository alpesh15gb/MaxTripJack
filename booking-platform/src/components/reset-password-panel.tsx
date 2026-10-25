"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AccountExperienceShell from "./account-experience-shell";
import { authClient } from "@/lib/auth-client";
import { AccountActionRejected, confirmAccountAction } from "@/lib/account-action";
import { accountHref } from "@/lib/account-return";
export default function ResetPasswordPanel({token,returnTo}:{token:string;returnTo:string}) {
 const inFlight=useRef(false);const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 function retireResetLink(){
  const url=new URL(window.location.href);url.searchParams.delete("token");
  // Next's patched history method copies the old router tree, which may contain
  // token-bearing page segments. Retire the entire history state, not just the URL.
  // An empty native state makes Back/Forward reload this tokenless recovery page.
  History.prototype.replaceState.call(window.history,{},"",url.pathname+url.search);
 }
 const [uncertain,setUncertain]=useState(false);
 const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const [complete,setComplete]=useState(false);
 return <AccountExperienceShell><div className="page-shell reset-experience"><p className="eyebrow">ACCOUNT RECOVERY</p><Link className="back" href={accountHref(returnTo)}>← Account</Link><h1>A fresh start.<br/>A secure account.</h1>{!token?<section className="white-card"><h2>Request a fresh reset link</h2><p role="alert">Reset link is missing or invalid. Open your latest reset email, or request a new link from your account page.</p><Link className="primary" href={`${accountHref(returnTo)}&mode=reset`}>Back to account recovery</Link></section>:complete?<section className="white-card"><h2>Password updated</h2><p role="status">Sign in with your new password to continue.</p><Link className="primary" href={accountHref(returnTo)}>Sign in and continue</Link></section>:<><p className="muted">Choose a unique password with at least 12 characters.</p><form className="white-card account-card" onSubmit={async e=>{e.preventDefault();if(inFlight.current||uncertain)return;const data=new FormData(e.currentTarget);if(data.get("password")!==data.get("confirmPassword")){setMessage("Passwords do not match.");return;}try{retireResetLink();}catch{setMessage("We couldn’t prepare secure recovery in this browser. No reset request was sent. Request a fresh link or contact support.");return;}inFlight.current=true;setBusy(true);setMessage("");try{await confirmAccountAction(authClient.resetPassword({token,newPassword:String(data.get("password"))}));if(mounted.current)setComplete(true);}catch(error){if(!mounted.current)return;if(error instanceof AccountActionRejected)setMessage(error.message);else{setUncertain(true);setMessage("We could not confirm whether your password changed. Do not submit this link again. Try signing in with the new password you chose, or request a fresh reset link if needed.");}}finally{inFlight.current=false;if(mounted.current)setBusy(false);}}}><label>New password<input name="password" required type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={busy||uncertain}/></label><label>Confirm new password<input name="confirmPassword" required type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={busy||uncertain}/></label><button className="primary" disabled={busy||uncertain}>{busy?"Updating…":"Update password"}</button>{uncertain&&<div className="account-links"><Link className="primary" href={accountHref(returnTo)}>Try signing in</Link><Link className="secondary" href={`${accountHref(returnTo)}&mode=reset`}>Request a fresh reset link</Link></div>}{message&&<p className="info-message" role="alert">{message}</p>}</form></>}</div></AccountExperienceShell>;
}
