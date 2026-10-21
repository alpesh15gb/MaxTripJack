"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { accountHref, safeAccountReturn } from "@/lib/account-return";
import AccountExperienceShell from "./account-experience-shell";
import { TravelIcon } from "./travel-shell";
import SessionSecurity from "./session-security";
import { authClient } from "@/lib/auth-client";

export default function AccountPanel({returnTo="/my-trips",verificationError=false}:{returnTo?:string;verificationError?:boolean}) {
 const router=useRouter(); const destination=safeAccountReturn(returnTo); const callbackURL=accountHref(destination);
 const [verificationEmail,setVerificationEmail]=useState(""); const [cooldown,setCooldown]=useState(0);
 useEffect(()=>{if(cooldown<=0)return;const timer=setTimeout(()=>setCooldown(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[cooldown]);
 async function completeSignIn(){await refetch();router.replace(destination);router.refresh();}
 async function resendVerification(){if(busy||cooldown>0)return;setBusy(true);setMessage("");setCooldown(60);try{const result=await authClient.sendVerificationEmail({email:verificationEmail,callbackURL});if(result.error)throw Error();setMessage("If this email has an unverified account, a fresh verification link will be sent. Check your inbox and spam folder.");}catch{setMessage("We couldn’t request a verification email right now. Please wait a moment and try again, or contact support. Your account status has not been changed.");}finally{setBusy(false);}}
 const { data: session, isPending, refetch } = authClient.useSession();
 const [mode, setMode] = useState<"signin" | "signup" | "reset" | "challenge" | "verify">("signin");
 const [recovery,setRecovery]=useState(false);
 const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
 const [totpURI, setTotpURI] = useState(""); const [backupCodes, setBackupCodes] = useState<string[]>([]);
 const [enrolling, setEnrolling] = useState(false);
 async function submit(form: FormData) {
  setBusy(true); setMessage("");
  try {
   const email = String(form.get("email") || ""); const password = String(form.get("password") || "");
   if (mode === "challenge") {
    const result = recovery?await authClient.twoFactor.verifyBackupCode({code:String(form.get("code"))}):await authClient.twoFactor.verifyTotp({ code: String(form.get("code")) });
    if (result.error) throw new Error(result.error.message); await completeSignIn(); setMode("signin");
   } else if (mode === "reset") {
    const result = await authClient.requestPasswordReset({ email, redirectTo: `/reset-password?${new URLSearchParams({returnTo:destination})}` });
    if (result.error) throw new Error(result.error.message); setMessage("If the account exists, a reset link will be sent. Check your inbox for the next step.");
   } else if (mode === "signup") {
    const result = await authClient.signUp.email({ email, password, name: String(form.get("name")), callbackURL });
    if (result.error) throw new Error(result.error.message); setVerificationEmail(email);setCooldown(60);setMode("verify");setMessage("");
   } else {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) throw new Error(result.error.message);
    if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) setMode("challenge"); else await completeSignIn();
   }
  } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to complete authentication."); }
  finally { setBusy(false); }
 }
 return <AccountExperienceShell><div className="page-shell account-shell"><Link className="back" href="/">← Max Travel home</Link><div className="page-heading"><div><div className="eyebrow">YOUR MAX TRAVEL ACCOUNT</div><h1>Every journey starts with you.</h1><p>Secure account access for your trips, travellers, and company bookings.</p></div></div><div className="account-experience-grid"><aside className="account-benefits"><span className="account-benefits-icon"><TravelIcon name="shield" size={28}/></span><p className="eyebrow">YOUR JOURNEY, TOGETHER</p><h2>One place for every next step.</h2><p>Keep your trip details close and your account protected.</p><ul><li><TravelIcon name="bag"/><div><strong>Trips at a glance</strong><span>Follow supplier confirmation and manage your bookings.</span></div></li><li><TravelIcon name="user"/><div><strong>Less typing next time</strong><span>Save traveller profiles securely for future checkouts.</span></div></li><li><TravelIcon name="shield"/><div><strong>You’re in control</strong><span>Manage passwords, authenticators and signed-in devices.</span></div></li></ul><Link href="/customer-support">Need a hand? Contact support →</Link></aside><div className="white-card account-card">
 {isPending ? <p role="status">Checking your session…</p> : session ? <><h2>Hello, {session.user.name}</h2><p className="muted">{session.user.email}</p><div className="account-links"><Link className="primary" href="/my-trips">My trips</Link><Link className="secondary" href="/travellers">Saved travellers</Link><Link className="secondary" href="/operations">Admin workspace</Link></div><hr/><h2>Account security</h2><p className="muted">Two-factor authentication is required for corporate and admin access.</p>{session.user.twoFactorEnabled ? <p className="green">Authenticator protection enabled.</p> : <form onSubmit={async e => {
 e.preventDefault(); setBusy(true); setMessage("");
 try { const values = new FormData(e.currentTarget);
  if (!enrolling) { const result = await authClient.twoFactor.enable({ password: String(values.get("password")) }); if (result.error) throw new Error(result.error.message); if (result.data && "totpURI" in result.data) { setTotpURI(result.data.totpURI); setBackupCodes(result.data.backupCodes); setEnrolling(true); } }
  else { const result = await authClient.twoFactor.verifyTotp({ code: String(values.get("code")) }); if (result.error) throw new Error(result.error.message); setTotpURI(""); setBackupCodes([]); setEnrolling(false); await refetch(); }
 } catch(error) { setMessage(error instanceof Error ? error.message : "Unable to enable authenticator."); } finally { setBusy(false); }
 }}>
 {!enrolling ? <label>Current password<input type="password" name="password" required autoComplete="current-password"/></label> : <><p className="muted">Import this setup URI into your authenticator. Treat it and the backup codes as secrets; save the codes securely before continuing.</p><label>Authenticator setup URI<textarea readOnly value={totpURI}/></label><label>Backup codes<textarea readOnly value={backupCodes.join("\n")}/></label><label>Authenticator code<input name="code" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code"/></label></>}
 <button className="primary" disabled={busy}>{busy ? "Please wait…" : enrolling ? "Verify and enable" : "Set up authenticator"}</button></form>}
 <SessionSecurity key={session.user.id}/><button className="secondary" disabled={busy} onClick={async () => {setBusy(true);setTotpURI("");setBackupCodes([]);setEnrolling(false);setRecovery(false); const result = await authClient.signOut(); if(result.error) setMessage(result.error.message || "Sign out failed."); await refetch(); setBusy(false);}}>Sign out</button>
 </> : <>{verificationError&&<p role="alert" className="info-message">This verification link is invalid or has expired. Request a fresh verification email below.</p>}<div className="account-tabs">{(["signin", "signup", "reset"] as const).map(m => <button key={m} disabled={busy} onClick={() => {setMode(m);setMessage("");}} aria-pressed={mode===m}>{m === "signin" ? "Sign in" : m === "signup" ? "Create account" : "Reset password"}</button>)}</div>{mode === "verify" ? <section className="verification-step" aria-labelledby="verification-heading"><h2 id="verification-heading">Check your email</h2><p>If an account needs verification, follow the email link, then return to sign in. Check spam too.</p><label>Email for verification<input type="email" autoComplete="email" value={verificationEmail} onChange={e=>setVerificationEmail(e.target.value)} disabled={busy}/></label><button type="button" className="primary" disabled={busy||cooldown>0||!verificationEmail.includes("@")} onClick={()=>void resendVerification()}>{busy?"Requesting…":cooldown>0?`Resend available in ${cooldown}s`:"Resend verification email"}</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setMode("signin");setMessage("");}}>Back to sign in</button><p className="muted">Changing this email does not change an existing account’s email address.</p></section> : <form onSubmit={e => {e.preventDefault();void submit(new FormData(e.currentTarget));}}>
 {mode === "challenge" ? <><label>{recovery?"One-time backup code":"Authenticator code"}<input name="code" inputMode={recovery?"text":"numeric"} pattern={recovery?undefined:"[0-9]{6}"} required autoComplete="one-time-code"/></label><label className="checkbox"><input type="checkbox" checked={recovery} onChange={e=>setRecovery(e.target.checked)}/>Use a saved recovery code</label></> : <>{mode === "signup" && <label>Your name<input name="name" required minLength={2} maxLength={100} autoComplete="name"/></label>}<label>Email<input name="email" required type="email" autoComplete="email"/></label>{mode !== "reset" && <label>Password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"}/></label>}</>}
 <button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : mode === "challenge" ? "Verify code" : "Sign in"}</button></form>}{mode!=="verify"&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setMode("verify");setMessage("");}}>Need a verification email?</button>}<p className="muted">Corporate accounts are linked and approved by Max Travel. Registration does not grant company or admin access.</p></>}
 {message && <p role="status" className="info-message">{message}</p>}</div></div><p className="account-environment-note">Test environment · No live travel bookings or payments are enabled.</p></div></AccountExperienceShell>;
}
