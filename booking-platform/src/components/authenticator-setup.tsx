"use client";

import { QRCodeSVG } from "qrcode.react";

export default function AuthenticatorSetup({ uri }: { uri: string }) {
  let secret = "";
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "otpauth:" && parsed.hostname === "totp") {
      secret = parsed.searchParams.get("secret") || "";
    }
  } catch { /* Keep invalid enrollment data out of the QR renderer. */ }
  if (!secret) return <p role="alert">The authenticator setup details are unavailable. Contact support before starting setup again.</p>;

  return <section aria-label="Scan authenticator QR code">
    <h3>Scan with your authenticator</h3>
    <p>In Google Authenticator or your preferred app, choose Add account, then Scan a QR code.</p>
    <QRCodeSVG value={uri} size={240} marginSize={4} level="M"
      title="Authenticator setup QR code" role="img"
      style={{ display: "block", maxWidth: "100%", height: "auto", background: "white", margin: "16px auto" }} />
    <details>
      <summary>Can’t scan? Enter a setup key manually</summary>
      <p>Choose Enter a setup key in your app. Name the account MaxTravel and select Time based.</p>
      <label>Manual setup key<input readOnly value={secret} autoComplete="off" spellCheck={false} /></label>
      <label>Authenticator setup URI<textarea readOnly value={uri} spellCheck={false} /></label>
    </details>
    <p className="muted">Keep this QR code, setup key and backup codes private. Save your backup codes securely before continuing.</p>
  </section>;
}
