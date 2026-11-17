# Max AI enquiries — live CRM deployment on hold

**Do not run the earlier Safar setup, migration or deployment commands.** On 17 November 2026 the user confirmed that the owner is actively entering real transactions in Safar and that none of the latest integration setup/deployment commands had been run. Leave Safar on its existing running deployment.

The enquiry implementation is preserved on [codex/max-ai-enquiries-staging](https://github.com/alpesh15gb/SafarCrm/tree/codex/max-ai-enquiries-staging), commit `7982971`. Normal revert commit `97cab95` removes only this integration from Safar `main`; no history was rewritten. Its tracked source now matches pre-integration commit `a18d1b1`. No VPS command or database rollback was run. Do not deploy the review branch to the live CRM.

## Current operating arrangement

- Keep Safar's existing app, import worker and database running unchanged.
- Keep the legacy booking `crm-worker` stopped. Do not start `enquiry-worker` either.
- Do not point a booking sender at live Safar, run the cross-repository setup helper, or submit synthetic enquiries into the live CRM.
- Max AI can save confirmed enquiries in the **booking application's own database**, available at `/operations/enquiries`. Saving an enquiry does not contact Safar or require Safar credentials.
- Missing CRM configuration leaves delivery pending configuration; it does not invalidate the local save. Booking and payment processing are independent of CRM delivery.

The last VPS audit found no configured legacy CRM destination, no delivered events and no enquiry events. It showed 7 `booking.confirmed`, 1 `booking.failed` and 8 `payment.captured` events from booking tests. The user stopped `max-travel-booking-crm-worker-1`. Preserve those 16 records. No later live queue state has been independently inspected.

Compose profiles make senders opt-in, but do not stop an already running container. Leave the previously stopped sender stopped and do not start the new one. No booking deployment is required merely to keep CRM disconnected. If any commands are run after this hold, report which ones before planning further action.

## Enquiry workflow

The visitor reviews an editable visa, insurance, holiday or cruise draft, enters contact details outside model chat, and explicitly consents before saving. Contact details remain unverified. An enquiry does not reserve travel, apply for a visa, issue insurance or take payment.

The booking app atomically saves the enquiry, audit event and frozen delivery payload. Actor-scoped request IDs recover the same receipt after uncertain responses. Reusing an ID with changed details returns a conflict. Existing verified-email, MFA and permission requirements apply to booking-admin review. Do not retry CRM delivery during the hold.

The prepared Safar inbox has separate Live and Test views, staff assignment, notes, unverified contact labels and protected structured budgets. Its receiver writes only new enquiry-related tables. It cannot automatically create native customers, cases, tasks, bookings, invoices or payments. Historical destinations are not backfilled or redirected, and retries preserve the original mode.

**A Test view inside the live CRM is not an isolated test environment.** It shares the running app and database. Even an additive migration or app restart can affect active staff. The prepared integration is therefore not approved for live deployment.

## Required next stage

1. Create a separate staging Safar instance with its own database, containers, domain, application secrets and signing keys. Use synthetic records and disable jobs that send customer messages or perform transactions. Do not use live customer data or live credentials.
2. Deploy the preserved review branch only to staging. Exercise all four enquiry services, uncertain retries, replay conflicts, staff/MFA permissions, budgets and desktop/mobile use. Check existing case, booking, invoice and payment workflows there too.
3. Review the exact migration and deployment diff against the then-current live version. Verify backup and recovery in staging. A backup alone does not eliminate deployment risk; restoring an old database while new transactions are being entered could lose data.
4. Prepare the concrete rollout and app rollback plan, then obtain the owner's explicit approval for a maintenance window with staff data entry paused during the agreed change.
5. Only after acceptance, configure live delivery separately. Existing test events must not be replayed as real transactions or relabelled as live.

Until these steps are complete, this guide supplies no live setup/deployment commands. The earlier live rollout instructions are withdrawn.

## Existing validation and limits

The preserved Safar branch passed its build, 51 unit tests, 20 desktop/mobile UI cases and 11 isolated PostgreSQL/PGlite tests. The database tests execute all 50 migrations and verify that fingerprints of 25 existing synthetic business tables and numbering sequences remain unchanged through enquiry ingestion and follow-up.

Booking passed 736 tests, TypeScript, lint, production build, worker bundling and 48 selected desktop/mobile enquiry cases. Its queue tests execute all 25 booking migrations in isolated PostgreSQL and preserve ordinary test events and historical enquiries. Setup/diagnostic tests cover key preservation, rollback and secret-free output.

These results are evidence, not a guarantee of safe live deployment. They do not establish production Supabase/PostgREST behaviour, VPS concurrency, live data compatibility or zero downtime. No live CRM transaction records were modified during development. The existing booking Next.js security advisory remains a separate dependency-upgrade task.
