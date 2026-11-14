"use client";

import { useEffect, useState } from "react";
import CheckoutVerification from "./checkout-verification";
import { customerEmail } from "@/lib/customer-identity";

type User = { id: string; email: string; emailVerified: boolean; phoneNumber?: string | null; phoneNumberVerified?: boolean | null };

export default function AccountWhatsApp({ user, refresh }: { user: User; refresh: () => Promise<unknown> }) {
  const [available, setAvailable] = useState(false);
  const [linking, setLinking] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/channels", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setAvailable(data?.whatsapp === true); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!available && !user.phoneNumberVerified) return null;
  return <section className="account-whatsapp" aria-label="WhatsApp sign-in">
    <h3>WhatsApp sign-in</h3>
    {user.phoneNumberVerified && user.phoneNumber ? <><p><strong>{user.phoneNumber}</strong> is verified for this account.</p><p>Use this number when signing in to find your trips.</p></> : user.emailVerified && customerEmail(user) ? <>
      <p>Connect your WhatsApp number to use email or WhatsApp codes for the same account and trips.</p>
      {linking ? <CheckoutVerification mode="link-phone" initialEmail={customerEmail(user)} expectedUserId={user.id} onVerified={async () => { setMessage("WhatsApp number verified. Your existing trips stay in this account."); await refresh(); setLinking(false); }} /> : <button type="button" className="secondary" onClick={() => setLinking(true)}>Connect WhatsApp number</button>}
    </> : <p>Verify your account email before connecting a WhatsApp number.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
