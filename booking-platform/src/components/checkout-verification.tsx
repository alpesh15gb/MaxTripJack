"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { customerEmail, hasVerifiedCustomerIdentity, normalizeWhatsAppPhone } from "@/lib/customer-identity";

type Stage = "contact" | "code" | "mfa" | "check";
type Channel = "email" | "whatsapp";
export type VerifiedContact = { email: string; phoneNumber?: string };
type Props = { onVerified: (contact: VerifiedContact) => void | Promise<void>; initialEmail?: string; initialPhoneNumber?: string; expectedUserId?: string; mode?: "signin" | "link-phone"; emailOnly?: boolean; context?: "price-alert" };

async function verificationRequest<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Authentication stays in the mounted workspace; contact ownership is checked server-side. */
export default function CheckoutVerification({ onVerified, initialEmail = "", initialPhoneNumber = "", expectedUserId, mode = "signin", emailOnly = false, context }: Props) {
  const id = useId(), linking = mode === "link-phone";
  const [channel, setChannel] = useState<Channel>(linking ? "whatsapp" : "email");
  const [email, setEmail] = useState(initialEmail), [phone, setPhone] = useState(initialPhoneNumber);
  const [channels, setChannels] = useState<{ whatsapp: boolean; email: boolean } | null>(null);
  const [code, setCode] = useState(""), [stage, setStage] = useState<Stage>("contact");
  const [recovery, setRecovery] = useState(false), [busy, setBusy] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({}), [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [finished, setFinished] = useState(false);
  const mounted = useRef(false), inFlight = useRef(false), complete = useRef(false), linkUserId = useRef<string | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const lastVerificationStage = useRef<"code" | "mfa">("code");
  const normalizedEmail = email.trim().toLowerCase(), normalizedPhone = normalizeWhatsAppPhone(phone);
  const destination = channel === "email" ? normalizedEmail : normalizedPhone || phone.trim();
  const cooldownKey = `${channel}:${destination}`;
  const cooldown = Math.max(0, Math.ceil(((cooldowns[cooldownKey] || 0) - now) / 1000));
  const channelUnavailable = channel === "whatsapp" ? channels?.whatsapp !== true : channels?.email === false;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void fetch("/api/auth/channels", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => { if (!response.ok) throw Error(); const value = await response.json(); if (mounted.current) setChannels({ whatsapp: value.whatsapp === true, email: value.email !== false }); })
      .catch(() => { if (mounted.current && !controller.signal.aborted) setChannels({ whatsapp: false, email: true }); });
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  useEffect(() => {
    if (!Object.values(cooldowns).some(until => until > now)) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [cooldowns, now]);
  useEffect(() => {
    if (busy || finished) return;
    if (stage === "check") submitButton.current?.focus();
    if (stage === "code" || stage === "mfa") codeInput.current?.focus();
  }, [stage, recovery, busy, finished]);
  function startCooldown() { const current = Date.now(); setNow(current); setCooldowns(previous => ({ ...previous, [cooldownKey]: current + 60000 })); }

  function readSession() {
    return verificationRequest(signal => authClient.getSession({ fetchOptions: { cache: "no-store", signal } }));
  }

  async function confirmSession() {
    const response = await readSession().catch(() => null);
    if (!mounted.current) return;
    if (!response || response.error) {
      setError(linking ? "We couldn’t check your number. Try checking its status again." : "We couldn’t check your sign-in. Check again to continue with this selection.");
      return;
    }
    const user = response.data?.user;
    const matchingContact = user && hasVerifiedCustomerIdentity(user) && (channel === "email"
      ? user.emailVerified && customerEmail(user).toLowerCase() === normalizedEmail
      : user.phoneNumberVerified === true && user.phoneNumber === normalizedPhone);
    if (!matchingContact || (linking && (!linkUserId.current || user?.id !== linkUserId.current || (expectedUserId && user?.id !== expectedUserId)))) {
      setStage(lastVerificationStage.current);
      setError(lastVerificationStage.current === "mfa" ? "Your security check is still needed. Enter a current authenticator code or use a saved recovery code."
        : linking ? "We couldn’t confirm this number for your account. Check your sign-in and request a new code."
        : `Your ${channel === "email" ? "email" : "WhatsApp number"} has not been verified for this sign-in. Enter your code or request a new one.`);
      return;
    }
    if (complete.current) return;
    complete.current = true; setFinished(true); setCode("");
    await onVerified({ email: customerEmail(user), ...(user.phoneNumberVerified && user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}) });
  }

  async function sendCode() {
    if (inFlight.current || cooldown > 0 || channelUnavailable) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (channel === "whatsapp" && !normalizedPhone) throw Error("Enter a 10-digit Indian mobile number, or include + and the country code for another country.");
      if (linking) {
        const current = await readSession().catch(() => null);
        if (!mounted.current) return;
        const user = current?.data?.user;
        if (!current || current.error || !user?.emailVerified || !customerEmail(user) || (expectedUserId && user.id !== expectedUserId) || (initialEmail && customerEmail(user).toLowerCase() !== initialEmail.trim().toLowerCase()) || (linkUserId.current && linkUserId.current !== user.id))
          throw Error("Sign in to your verified email account again before connecting WhatsApp.");
        linkUserId.current = user.id;
      }
      const result = await (channel === "email"
        ? verificationRequest(signal => authClient.emailOtp.sendVerificationOtp({ email: normalizedEmail, type: "sign-in", fetchOptions: { signal } }))
        : verificationRequest(signal => authClient.$fetch("/phone-number/send-otp", { method: "POST", body: { phoneNumber: normalizedPhone!, purpose: linking ? "link" : "signin" }, signal }))).catch(() => null);
      if (!mounted.current) return;
      if (result?.error) {
        if (result.error.status === 429) startCooldown();
        throw Error(result.error.status === 429 ? "Please wait a minute before requesting another code."
          : channel === "whatsapp" ? linking ? "We couldn’t request a WhatsApp code right now. Please try again later." : "We couldn’t request a WhatsApp code right now. Try again or choose Email."
          : "We couldn’t request a code right now. Please try again or contact support.");
      }
      if (channel === "email") setEmail(normalizedEmail); else setPhone(normalizedPhone!);
      lastVerificationStage.current = "code";
      setCode(""); setStage("code"); startCooldown();
      setMessage(!result ? "We couldn’t confirm delivery. If your code arrives, enter it below. You can resend after the countdown."
        : channel === "email" ? "Code requested. Check your inbox and spam folder. Use the latest code within 5 minutes."
        : "Code requested. Check WhatsApp on this number. Use the latest code within 5 minutes.");
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "We couldn’t request a code. Please try again."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function verify() {
    if (inFlight.current || complete.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (stage === "check") { await confirmSession(); return; }
      if (stage === "contact") return;
      lastVerificationStage.current = stage;
      const result = await (stage === "mfa"
        ? recovery ? verificationRequest(signal => authClient.twoFactor.verifyBackupCode({ code: code.trim(), fetchOptions: { signal } }))
          : verificationRequest(signal => authClient.twoFactor.verifyTotp({ code: code.trim(), fetchOptions: { signal } }))
        : channel === "email" ? verificationRequest(signal => authClient.signIn.emailOtp({ email: normalizedEmail, otp: code.trim(), fetchOptions: { signal } }))
        : verificationRequest(signal => authClient.phoneNumber.verify({ phoneNumber: normalizedPhone!, code: code.trim(), ...(linking ? { updatePhoneNumber: true } : {}), fetchOptions: { signal } }))).catch(() => null);
      if (!mounted.current) return;
      if (!result || (result.error && result.error.status >= 500)) {
        setStage("check"); setCode("");
        setError(linking ? "We couldn’t confirm the code check. Check whether your number was verified." : "We couldn’t confirm the code check. Check your sign-in to continue with this selection.");
        return;
      }
      if (result.error) throw Error(result.error.status === 429 ? "Too many attempts. Please wait a minute before trying again."
        : stage === "mfa" ? "That security code could not be verified. Please try again."
        : `That code is invalid or has expired. Check the latest ${channel === "email" ? "email" : "WhatsApp message"} or request a new code.`);
      setCode("");
      if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
        setStage("mfa"); setMessage("Your code is verified. Complete your account’s authenticator check to continue."); return;
      }
      setStage("check"); await confirmSession();
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : "We couldn’t confirm your sign-in. Check its status before trying again.");
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  function changeContact(nextChannel = channel) {
    if (busy || finished) return;
    lastVerificationStage.current = "code";
    setChannel(nextChannel); setStage("contact"); setCode(""); setRecovery(false); setMessage(""); setError("");
  }

  return <section className="checkout-verification" aria-labelledby={`${id}-heading`} aria-busy={busy}>
    {!linking && !emailOnly && channels?.whatsapp && <div className="checkout-verification-channels" role="group" aria-label="Verification method">
      <button type="button" aria-pressed={channel === "email"} disabled={busy || finished} onClick={() => changeContact("email")}>Email</button>
      <button type="button" aria-pressed={channel === "whatsapp"} disabled={busy || finished} onClick={() => changeContact("whatsapp")}>WhatsApp</button>
    </div>}
    <header className={context==="price-alert"&&stage==="contact"?"sr-only":"checkout-verification-heading"}>
      <h3 id={`${id}-heading`}>{stage === "contact" ? linking ? "Connect WhatsApp to your account" : channel === "email" ? "Continue with your email" : "Continue with WhatsApp"
        : stage === "mfa" ? "Your account security check" : stage === "check" ? linking ? "Confirm your WhatsApp number" : "Confirm your sign-in" : channel === "email" ? "Enter your email code" : "Enter your WhatsApp code"}</h3>
      <p>{stage === "contact" ? linking ? "Verify your number to use WhatsApp codes for this same account and its trips." : "We’ll send a one-time code. No password needed."
        : stage === "mfa" ? "Your existing two-factor protection stays on." : `Continue securely as ${destination}.`}</p>
    </header>
    {channelUnavailable && <p role="status">{channel === "whatsapp" ? channels === null ? "Checking WhatsApp availability…" : "WhatsApp verification is unavailable right now. Please try again later."
      : emailOnly ? "Email verification is unavailable right now. Please try again later." : "Email verification is unavailable right now. Choose WhatsApp or try again later."}</p>}
    {message && <p className="info-message" role="status">{message}</p>}
    {error && <p id={`${id}-error`} className="info-message" role="alert">{error}</p>}
    <form className="checkout-verification-form" onSubmit={event => { event.preventDefault(); void (stage === "contact" ? sendCode() : verify()); }}>
      {stage === "contact" ? channel === "email" ? <label htmlFor={`${id}-email`}>Email address
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} placeholder={context==="price-alert"?"Enter your email":undefined} />
      </label> : <label htmlFor={`${id}-phone`}>WhatsApp number
        <input id={`${id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} required value={phone} placeholder="98765 43210 or +country code" onChange={event => setPhone(event.target.value)} disabled={busy} aria-label="WhatsApp number" aria-describedby={`${id}-phone-hint`} />
        <small id={`${id}-phone-hint`}>India (+91) for 10-digit numbers. For another country, include + and its country code.</small>
      </label> : stage !== "check" ? <label htmlFor={`${id}-code`}>{stage === "mfa" ? recovery ? "One-time backup code" : "Authenticator code" : "Verification code"}
        <input ref={codeInput} className="checkout-verification-code" id={`${id}-code`} name="code" type="text" inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" pattern={recovery ? undefined : "[0-9]{6}"} maxLength={recovery ? 80 : 6} required value={code} onChange={event => setCode(recovery ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={Boolean(error)} />
      </label> : null}
      {stage === "mfa" && <label className="checkbox"><input type="checkbox" checked={recovery} onChange={event => { setRecovery(event.target.checked); setCode(""); setError(""); }} disabled={busy} />Use a saved recovery code</label>}
      <button ref={submitButton} className="primary" disabled={busy || finished || (stage === "contact" && (cooldown > 0 || channelUnavailable))}>{busy ? stage === "contact" ? "Requesting code…" : stage === "check" ? "Checking sign-in…" : "Checking code…" : stage === "contact" ? cooldown > 0 ? `Send code in ${cooldown}s` : channel === "email" ? context==="price-alert" ? "Continue" : "Send verification code" : "Send WhatsApp code" : stage === "check" ? linking ? "Check number status" : "Check sign-in status" : "Verify & continue"}</button>
    </form>
    {stage !== "contact" && <div className="checkout-verification-actions">
      {stage === "code" && <button type="button" className="secondary" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button>}
      <button type="button" className="secondary" disabled={busy} onClick={() => changeContact()}>{channel === "email" ? "Use a different email" : "Use a different number"}</button>
      {stage === "code" && error && <button type="button" className="secondary" disabled={busy} onClick={() => { setStage("check"); setError(""); }}>Already verified? Check sign-in</button>}
    </div>}
    <p className="checkout-verification-note">{context==="price-alert"?"We’ll send a one-time code to verify your email.":linking ? "Your trips stay in this account." : channel === "whatsapp" ? "Use this verified number to return to your trips." : "Your email gives you secure access to your trips."} <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy policy</Link> · <Link href="/customer-support" target="_blank" rel="noopener noreferrer">Need help?</Link></p>
  </section>;
}
