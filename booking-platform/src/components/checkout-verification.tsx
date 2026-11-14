"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

type Stage = "email" | "code" | "mfa" | "check";
type Props = { onVerified: (email: string) => void | Promise<void>; initialEmail?: string };

/** Authentication stays in the mounted booking workspace; no return URLs or redirects. */
export default function CheckoutVerification({ onVerified, initialEmail = "" }: Props) {
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>("email");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const mounted = useRef(false), inFlight = useRef(false), complete = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const normalizedEmail = email.trim().toLowerCase();

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => { if (stage === "code" || stage === "mfa") codeInput.current?.focus(); }, [stage, recovery]);

  async function confirmSession() {
    const response = await authClient.getSession({ fetchOptions: { cache: "no-store" } });
    if (!mounted.current) return;
    if (response.error) throw Error("We couldn’t check your sign-in. Please check again; your selection is still here.");
    const user = response.data?.user;
    if (!user?.emailVerified || user.email.toLowerCase() !== normalizedEmail) {
      setStage("code");
      throw Error("Your email has not been verified for this sign-in. Enter your code or request a new one.");
    }
    if (complete.current) return;
    complete.current = true;
    setFinished(true);
    setCode("");
    await onVerified(user.email);
  }

  async function sendCode() {
    if (inFlight.current || cooldown > 0) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email: normalizedEmail, type: "sign-in" });
      if (!mounted.current) return;
      if (result.error) {
        if (result.error.status === 429) setCooldown(60);
        throw Error(result.error.status === 429
          ? "Please wait a minute before requesting another code."
          : "We couldn’t request a code right now. Please try again or contact support.");
      }
      setEmail(normalizedEmail); setCode(""); setStage("code"); setCooldown(60);
      setMessage("Code requested. Check your inbox and spam folder. Use the latest code within 5 minutes.");
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "We couldn’t request a code. Please try again.");
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function verify() {
    if (inFlight.current || complete.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (stage === "check") { await confirmSession(); return; }
      const result = stage === "mfa"
        ? recovery ? await authClient.twoFactor.verifyBackupCode({ code: code.trim() }) : await authClient.twoFactor.verifyTotp({ code: code.trim() })
        : await authClient.signIn.emailOtp({ email: normalizedEmail, otp: code.trim() });
      if (!mounted.current) return;
      if (result.error) throw Error(result.error.status === 429
        ? "Too many attempts. Please wait a minute before trying again."
        : stage === "mfa" ? "That security code could not be verified. Please try again."
        : "That code is invalid or has expired. Check the latest email or request a new code.");
      setCode("");
      if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
        setStage("mfa");
        setMessage("Your email is verified. Complete your account’s authenticator check to continue.");
        return;
      }
      setStage("check");
      await confirmSession();
    } catch (failure) {
      if (mounted.current) {
        // An interrupted response can follow a consumed code. Allow a read-only
        // session check without asking the customer to repeat the sign-in mutation.
        if (!(failure instanceof Error)) setStage("check");
        setError(failure instanceof Error ? failure.message : "We couldn’t confirm your sign-in. Check its status before trying again.");
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  function changeEmail() {
    if (busy) return;
    setStage("email"); setCode(""); setRecovery(false); setMessage(""); setError("");
  }

  return <section className="checkout-verification" aria-labelledby={`${id}-heading`} aria-busy={busy}>
    <header className="checkout-verification-heading">
      <h3 id={`${id}-heading`}>{stage === "email" ? "Continue with your email" : stage === "mfa" ? "Your account security check" : stage === "check" ? "Confirm your sign-in" : "Enter your email code"}</h3>
      <p>{stage === "email" ? "We’ll send a one-time code. No password needed." : stage === "mfa" ? "Your existing two-factor protection stays on." : `Continue securely as ${normalizedEmail}.`}</p>
    </header>
    <form className="checkout-verification-form" onSubmit={event => { event.preventDefault(); void (stage === "email" ? sendCode() : verify()); }}>
      {stage === "email" ? <label htmlFor={`${id}-email`}>Email address
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
      </label> : stage !== "check" ? <label htmlFor={`${id}-code`}>{stage === "mfa" ? recovery ? "One-time backup code" : "Authenticator code" : "Verification code"}
        <input ref={codeInput} className="checkout-verification-code" id={`${id}-code`} name="code" type="text" inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" pattern={recovery ? undefined : "[0-9]{6}"} maxLength={recovery ? 80 : 6} required value={code} onChange={event => setCode(recovery ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={Boolean(error)} />
      </label> : null}
      {stage === "mfa" && <label className="checkbox"><input type="checkbox" checked={recovery} onChange={event => { setRecovery(event.target.checked); setCode(""); setError(""); }} disabled={busy} />Use a saved recovery code</label>}
      <button className="primary" disabled={busy || finished || (stage === "email" && cooldown > 0)}>{busy ? "Please wait…" : stage === "email" ? cooldown > 0 ? `Send code in ${cooldown}s` : "Send verification code" : stage === "check" ? "Check sign-in status" : "Verify & continue"}</button>
    </form>
    {stage !== "email" && <div className="checkout-verification-actions">
      {stage === "code" && <button type="button" className="secondary" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button>}
      <button type="button" className="secondary" disabled={busy} onClick={changeEmail}>Use a different email</button>
      {stage === "code" && error && <button type="button" className="secondary" disabled={busy} onClick={() => { setStage("check"); setError(""); }}>Already verified? Check sign-in</button>}
    </div>}
    {message && <p className="info-message" role="status">{message}</p>}
    {error && <p id={`${id}-error`} className="info-message" role="alert">{error}</p>}
    <p className="checkout-verification-note">Your email gives you secure access to your trips. <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy policy</Link> · <Link href="/customer-support" target="_blank" rel="noopener noreferrer">Need help?</Link></p>
  </section>;
}
