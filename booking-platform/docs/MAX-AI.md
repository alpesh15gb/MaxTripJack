# Max AI

Max AI connects MaxTravel's existing travel services to the configured model through your OmniRoute gateway. The deployed gateway accepted `APEXV1` in the 17 November 2026 diagnostic. The gateway is contacted only by the application server. Browser requests stay on MaxTravel's origin.

## What it can do

- Ask for missing travel details and resolve real airport, destination and nationality identifiers.
- Search live flights and hotels using the same application APIs, customer pricing rules, guest ownership and supplier limits as the booking screens.
- Show structured result cards with customer estimates and links into the exact owned search. A new supplier review checks the current fare or room price before checkout.
- Find published packages and open relevant guides, support, account, saved-traveller and operations pages.
- Show the signed-in customer's permitted trip cards. Private booking references and itinerary details stay out of model tool results.
- Prepare editable visa, travel-insurance, holiday-package and cruise enquiries. The visitor reviews travel details, enters contact information outside chat and explicitly submits before anything is saved. Confirmed enquiries appear in Operations → Enquiries and are queued for the integrated CRM.
- Distinguish new enquiries from existing visa applications, insurance claims, booking changes and urgent travel problems. Broader travel questions use authored guidance or the appropriate provider/team process, without inventing current eligibility, prices or guarantees.

The research and intent checklist are in [Max AI travel research](MAX-AI-TRAVEL-RESEARCH.md). These are enquiry workflows, not visa application, insurance issuance or cruise booking APIs. Contact information in the review form is not sent to the model. Customer contact preferences do not automatically send an email or WhatsApp message.

Payment, reservation, cancellation, refund, account and operations changes remain in their existing authenticated review/confirmation screens. Max AI has no tools to execute those changes. Opening a result is not a reservation, and a payment is not supplier confirmation.

Flight prices can be per leg for return itineraries. Hotel prices are estimates for the full selected stay and all selected rooms. Search cards do not promise room-specific meals, cancellation conditions or remaining inventory.

## VPS configuration

Create an application key in OmniRoute's endpoint/API-key settings and allow it to use the configured model or combo (`APEXV1` on the deployed gateway). Keep that key on the VPS; do not put it in a `NEXT_PUBLIC_` variable, browser settings, chat message or Git commit.

Add these values to `/opt/max-travel-booking/booking-platform/.env.production`:

```dotenv
MAX_AI_ENABLED=true
MAX_AI_BASE_URL=http://host.docker.internal:8088/v1
MAX_AI_API_KEY=your-private-omniroute-application-key
MAX_AI_MODEL=APEXV1
# Optional separate encryption secret, at least 32 characters.
# If omitted, the existing BETTER_AUTH_SECRET is used with purpose-separated derivation.
MAX_AI_CONVERSATION_SECRET=
```

The production Compose file already maps `host.docker.internal` to the host gateway. Port `8088` must be reachable from the booking container. A service bound only to the host's `127.0.0.1` cannot normally be reached through that gateway address. If both applications share a Docker network, use the actual OmniRoute service name and internal listening port instead. Confirm the deployed network and port mapping before changing it.

Use a private, local connection on this VPS, or an HTTPS gateway URL for a remote gateway. Do not send customer messages and the application key over the public `http://82.112.236.81:8088` address. There is no browser CSP or CORS change needed for OmniRoute.

The base URL ends at `/v1`; the server appends `/chat/completions`. Preserve the exact model/combo identifier accepted by your gateway, including its case. That target must support function tools. A model's ordinary text response alone does not prove that it can execute this integration's tool protocol. OmniRoute may route a combo to providers with different capabilities, so every fallback used by the combo should support tools.

For enquiries, follow [the Safar enquiry deployment guide](MAX-AI-ENQUIRIES.md) first. Booking is still in testing while Safar contains real transactions. The dedicated enquiry worker uses test-labelled records in a separate inbox, with no writes to existing business records. Keep the legacy CRM worker stopped. Deploy Safar before the booking app and dedicated enquiry worker. The following app-only command is for subsequent configuration changes after those migrations:

```bash
(
  set +x
  set -e
  cd /opt/max-travel-booking/booking-platform
  git pull --ff-only origin main
  POSTGRES_PASSWORD="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_PASSWORD)"
  test -n "$POSTGRES_PASSWORD"
  export POSTGRES_PASSWORD
  docker compose --env-file .env.production -f compose.production.yaml up -d --build --no-deps --force-recreate --wait app
  docker compose --env-file .env.production -f compose.production.yaml ps app
  docker exec max-travel-booking-app-1 node scripts/check-max-ai.mjs
)
```

Compose validates the required `POSTGRES_PASSWORD` interpolation even for an app-only deployment. This block reads the existing database container's configured value into a temporary subshell without printing it. It does not change the database password, recreate Postgres or write owner credentials into `.env.production`. Keep the assignment and `export` separate so a failed lookup stops deployment. Shell environment values take precedence for [Compose interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

The original search integration required no migration; the enquiry release does. Disabling `MAX_AI_ENABLED` and recreating the app container hides the assistant; existing saved enquiries and queued CRM events remain available for follow-up. If deployment fails, the diagnostic must wait: `Cannot find module '/app/scripts/check-max-ai.mjs'` can mean the old container is still running.

To repeat the gateway diagnostic after successful deployment:

```bash
docker exec max-travel-booking-app-1 node scripts/check-max-ai.mjs
```

It checks model discovery and makes a few small synthetic inference requests: a function call with exact search arguments, a matching tool-result follow-up and an incomplete flight request. It prints configuration presence and outcome metadata, never the gateway key or customer data. It does not call Tripjack, create a booking or start payment. These inference requests use the gateway's normal model quota. Keep any copied diagnostic output limited to these status fields.

If gateway access fails, check the container-to-gateway address, the OmniRoute application key, exact configured model/combo mapping and function-tool capability. An HTTP 200 from `/models` is only discovery; it is not proof that the search tool protocol works.

## Conversation and access boundaries

The chat request contains a user message, an optional opaque continuation token and a bounded page pathname. Client-supplied assistant roles, tool messages and URLs do not authorize application actions.

Continuation tokens use AES-256-GCM with a fresh random nonce. A purpose-separated key encrypts and authenticates the bounded server history. Associated data binds it to the current user or guest identity and company context. Tokens expire after 30 minutes. Invalid, altered, expired and differently owned tokens require a new chat. Rotating the conversation secret invalidates existing chat continuations.

History retains at most 24 messages and 24 KiB by removing whole completed turns. Tool-call/result pairs remain intact. The browser token is capped at 50 KiB; server-only system instructions are regenerated for every turn. Conversation history is not an authority to bypass current authentication or search ownership checks.

The endpoint lives beneath `/api/travel` so the existing HTTP-only shopping cookie reaches it. Search responses preserve that cookie between tools and browser turns. The existing guest-search claim and authenticated repricing still run at checkout. An expired search requires a fresh search.

Searches are read-only supplier lookups. Tools use fixed dispatch targets, strict schemas and existing application access checks. They do not accept arbitrary HTTP endpoints, database queries, user IDs, company IDs, prices or payment instructions from the model. Model prose is rendered as text; application-built cards and validated internal actions carry the links.

Same-origin checks, shared request limits, bounded tool loops, response sizes and timeouts apply. Logs must not contain chat bodies, cookies, API keys, raw provider responses or private booking records.

The app does not save a chat transcript to its database or browser local storage. Messages are still processed by OmniRoute and its selected upstream provider; review their logging and retention configuration. Users should keep passwords, OTPs, authenticator codes, card details, passports and PAN information out of chat.

Explicitly submitted enquiries are separate persisted records containing the reviewed travel details, contact details and consent time. Guest contact details remain unverified. Signed delivery creates an isolated Safar website-enquiry record; it does not create a customer, sales case, task or financial transaction. The original test/live mode is immutable across retries. Submission retries use the original request ID and payload, including after an uncertain response. Admin follow-up changes require operations permissions; Safar delivery retries require integration permissions.

## Response speed

A live first-turn “I want a visa” request took approximately 13.8 seconds before this update. Narrow generic opening requests now return an application-authored qualification question without a model call. Exact own-trip requests use the existing permission-checked tool directly. Complete flight/hotel tool results and valid enquiry drafts can render without a second model request just to paraphrase the result. Lookups, missing details and sequential planning still use the model when needed.

The API emits `Server-Timing` and sanitized `Max AI timing` logs with model/tool call counts and elapsed durations. It does not log chat text, contact values or model responses. The local tests verify removed network round trips; they are not a promise of a particular live latency. Supplier searches and detailed model requests still depend on Tripjack and OmniRoute response times. Measure these paths again after deployment before adjusting gateway routing or timeouts.

## Validation checklist

Local enquiry-release validation on 17 November 2026 passed: production build
and TypeScript, ESLint, worker bundling, and **724 unit tests**. Selected browser
coverage passed **214 desktop/mobile cases**: 40 enquiry/admin cases and 174
existing assistant, flight/hotel handoff, checkout, promo, operations and public
page cases. The new cases include 320px layout, child-only enquiries, consent,
contact isolation, uncertain retries, corrected drafts and account changes.

Browser tests use synthetic API/payment responses against the production UI;
they do not create live enquiries or bookings. Desktop/mobile screenshots were
inspected. Initial runs exposed ambiguous control labels and a delayed focus
callback that could redirect typing to the destination field. Both were fixed;
the final affected suite includes a deterministic delayed-frame regression and
passes against the rebuilt application.

The corrected receiver targets **Safar CRM**, not the old MaxTravel CRM repository.
Safar passed production build, TypeScript, 51 unit tests and 20 desktop/mobile
inbox cases. Its 11 PostgreSQL tests execute all 50 migrations in isolated PGlite,
verify test/live and staff permissions, and prove 25 existing business tables and
numbering sequences remain unchanged. Booking queue tests also use isolated
PostgreSQL. See [the enquiry deployment guide](MAX-AI-ENQUIRIES.md) for the current
dedicated sender, strict receipts, deployment and verification limits.

Earlier live acceptance verified flight/hotel search and handoffs, and the VPS
diagnostic accepted `APEXV1` function calling and tool-result follow-up.
`apexModelListed: null` only means discovery could not establish the model list;
it does not justify changing the model's case. The current enquiry release and
latency improvements still require deployment and live acceptance. The measured
pre-update visa opening request took about 13.8 seconds; no post-deployment
latency or live enquiry-to-CRM delivery is claimed by the local tests.

Authenticated own-trip lookup has not yet been verified live. Flight budget
preferences remain per-leg estimates in chat and are not carried to the booking
screen's combined return-budget control.

The existing Next.js dependency security advisory remains outside this change.

1. Verify gateway authentication, the exact configured target and an actual function-tool response from inside the app container. Use the deployment diagnostic supplied with this change; a `/models` response alone is insufficient.
2. Start a signed-out chat with “I want a flight ticket”. It should ask for missing route/date details instead of inventing a fare.
3. Provide an exact future route and passenger count. Open a returned card and confirm the original route, dates, party and customer estimates appear in the results screen.
4. Request a hotel stay with destination, dates, rooms, guests, child ages where needed, and nationality. Confirm full-stay price basis and room review handoff. Check a destination with no results and a supplier outage.
5. Ask for return flights, ambiguous Mumbai airports and incomplete dates. Verify that it clarifies ambiguity and does not combine incompatible fares or silently substitute NMI for BOM.
6. Ask for your trips signed out, then signed in. Switch accounts and sign out again. Old private cards and conversation state must be cleared and unavailable to the new session.
7. Ask it to book, pay, cancel, refund or change pricing. It should open the correct app screen and never claim it performed the change.
8. Test stop, close/reopen, new chat, network failure and expired conversation recovery on desktop and mobile. Complete a normal flight/hotel checkout separately to verify the assistant does not obstruct those controls.
9. Review each service enquiry, edit its details, explicitly submit and confirm one matching reference in Operations and Safar's **Test enquiries** view. Verify pending and delivered statuses separately, and that the Live inbox is unchanged. Use identified test details, not a real customer's information.
10. Compare generic starters with detailed searches using `Max AI timing` logs. Generic first-turn questions should report zero model calls; complete search/draft tools should omit an unnecessary summary call. Confirm sequential package planning and hotel pagination still work.

Use test supplier/payment environments for checkout validation. Do not test a live payment or supplier reservation merely to check whether the assistant renders results.

## Reference

OmniRoute documents its OpenAI-shaped `/v1/chat/completions` protocol, bearer authentication and tool-result exchange in the [compatibility reference](https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.54/docs/reference/OPENAI_COMPATIBILITY.md). Provider support varies; structured outputs and parallel tools are not guaranteed for every model. Its [setup guide](https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.54/docs/guides/SETUP_GUIDE.md) describes creating endpoint keys and model/combo configuration. Verify the installed VPS version before relying on gateway-specific settings.
