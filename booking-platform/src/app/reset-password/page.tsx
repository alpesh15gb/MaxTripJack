"use client";
import { useState } from "react";
import Link from "next/link";
import AccountExperienceShell from "@/components/account-experience-shell";
import { authClient } from "@/lib/auth-client";
export default function ResetPage() {
 const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 return <AccountExperienceShell><div className="page-shell reset-experience"><p className="eyebrow">ACCOUNT RECOVERY</p><Link className="back" href="/account">← Account</Link><h1>A fresh start.<br/>A secure account.</h1><p className="muted">Choose a new password with at least 12 characters. Use something unique to your MaxTravel account.</p><form className="white-card account-card" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const token=new URL(window.location.href).searchParams.get("token");if(!token)throw Error("Reset link is missing or invalid.");const result=await authClient.resetPassword({token,newPassword:String(new FormData(e.currentTarget).get("password"))});if(result.error)throw Error(result.error.message);setMessage("Password updated. Sign in with your new password.");}catch(error){setMessage(error instanceof Error?error.message:"Reset failed.");}finally{setBusy(false);}}}><label>New password<input name="password" required type="password" minLength={12} maxLength={128} autoComplete="new-password"/></label><button className="primary" disabled={busy}>{busy?"Updating…":"Update password"}</button>{message&&<p className="info-message" role="status">{message}</p>}</form></div></AccountExperienceShell>;
}
