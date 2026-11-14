# Checkout email verification

Flight and hotel checkout request a six-digit email code without leaving the selected journey. Code sign-in is also available on `/account`. Existing password sign-in remains available.

## Customer journey

Both products now use three stages: **Choose → Travellers / Guests → Review & pay**. A guest verifies their email inside the second stage, with their selected fare or room still visible. Successful verification checks the selected inventory again and prefills the contact email. Existing verified sessions continue directly.

Search controls stay out of checkout. Change selection returns to the loaded comparisons or room options. Browser Back and Forward retain traveller entries in memory for the same account; changing those entries requires another explicit review before payment. Signing out or switching accounts clears private drafts. Browser storage and history never hold traveller names, contacts or document fields.

Successful Razorpay verification opens `/my-trips/{bookingId}`. This page reads the owned booking and distinguishes payment receipt, supplier confirmation and the ticket or stay confirmation. Pending status refreshes automatically. **Track booking** in My trips returns to it. Uncertain payments keep the existing order and duplicate-payment protections.

## Production configuration

This uses the existing account email transport: `SMTP_HOST`, `MAIL_FROM`, and the existing `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASSWORD` settings where required by the mail provider. Keep `BETTER_AUTH_URL` set to the public HTTPS origin and retain the existing strong `BETTER_AUTH_SECRET`. No new environment variables or database migrations are introduced. Existing Better Auth verification/rate-limit tables and the application `request_buckets` table must already be deployed.

Rebuild and recreate the application container after pulling the change. SMTP must be configured before customers request codes. The request is rejected when email configuration is missing. Delivery is scheduled after the HTTP response, so a successful request means queued work, not confirmed inbox delivery. SMTP failure logs contain only a fixed outcome; codes and recipients are never logged. Use an authorised test inbox for a real delivery smoke test after deployment.

## Security and behavior

- Codes expire after five minutes, allow five incorrect attempts, are single-use, and are stored as keyed hashes. A resend rotates the code.
- The existing database-backed limiter permits one send per email per minute, using an HMAC identifier instead of storing the email in the rate-limit key. Additional request/IP limits apply. The screen waits 60 seconds before offering resend.
- The email OTP plugin exposes only its send-code and sign-in endpoints. The application retains verified-principal and company/admin authorization checks. Signing up does not grant a role or company access.
- Existing authenticator accounts still complete Better Auth's native MFA challenge before a usable session is issued. `checkoutTwoFactor` deliberately extends the native hook to `/sign-in/email-otp`, because the installed plugin's default matcher covers password sign-in only. Retest this integration when upgrading Better Auth.
- New code-only accounts can continue using codes. Their account page offers the existing email password-reset flow to set an optional password; it does not ask for a nonexistent current password. Authenticator enrollment retains the existing password requirement.
- Checkout resumes only after a fresh session check confirms the same verified email. Verification alone does not create a booking, reserve inventory, or take payment.

## Checks

Run `node --import tsx --test tests/checkout-auth.test.ts tests/checkout-code-mail.test.ts tests/account-mail-gate.test.ts tests/account-mail-privacy.test.ts tests/account-return.test.ts`. The OTP integration suite exercises the installed Better Auth handler with an in-memory adapter and synthetic email delivery, including attempts, expiry, replay, resend, restricted endpoints, and native MFA enforcement. It does not contact SMTP or travel/payment providers.

Reference: [Better Auth email OTP](https://better-auth.com/docs/plugins/email-otp) and [two-factor authentication](https://better-auth.com/docs/plugins/2fa).
