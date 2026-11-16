# Max AI

Max AI connects MaxTravel's existing travel services to the `apexv1` model through your OmniRoute gateway. The gateway is contacted only by the application server. Browser requests stay on MaxTravel's origin.

## What it can do

- Ask for missing travel details and resolve real airport, destination and nationality identifiers.
- Search live flights and hotels using the same application APIs, customer pricing rules, guest ownership and supplier limits as the booking screens.
- Show structured result cards with customer estimates and links into the exact owned search. A new supplier review checks the current fare or room price before checkout.
- Find published packages and open relevant guides, support, account, saved-traveller and operations pages.
- Show the signed-in customer's permitted trip cards. Private booking references and itinerary details stay out of model tool results.

Payment, reservation, cancellation, refund, account and operations changes remain in their existing authenticated review/confirmation screens. Max AI has no tools to execute those changes. Opening a result is not a reservation, and a payment is not supplier confirmation.

Flight prices can be per leg for return itineraries. Hotel prices are estimates for the full selected stay and all selected rooms. Search cards do not promise room-specific meals, cancellation conditions or remaining inventory.

## VPS configuration

Create an application key in OmniRoute's endpoint/API-key settings and allow it to use the configured `apexv1` model or combo. Keep that key on the VPS; do not put it in a `NEXT_PUBLIC_` variable, browser settings, chat message or Git commit.

Add these values to `/opt/max-travel-booking/booking-platform/.env.production`:

```dotenv
MAX_AI_ENABLED=true
MAX_AI_BASE_URL=http://host.docker.internal:8088/v1
MAX_AI_API_KEY=your-private-omniroute-application-key
MAX_AI_MODEL=apexv1
# Optional separate encryption secret, at least 32 characters.
# If omitted, the existing BETTER_AUTH_SECRET is used with purpose-separated derivation.
MAX_AI_CONVERSATION_SECRET=
```

The production Compose file already maps `host.docker.internal` to the host gateway. Port `8088` must be reachable from the booking container. A service bound only to the host's `127.0.0.1` cannot normally be reached through that gateway address. If both applications share a Docker network, use the actual OmniRoute service name and internal listening port instead. Confirm the deployed network and port mapping before changing it.

Use a private, local connection on this VPS, or an HTTPS gateway URL for a remote gateway. Do not send customer messages and the application key over the public `http://82.112.236.81:8088` address. There is no browser CSP or CORS change needed for OmniRoute.

The base URL ends at `/v1`; the server appends `/chat/completions`. `apexv1` must support function tools. A model's ordinary text response alone does not prove that it can execute this integration's tool protocol. OmniRoute may route a combo to providers with different capabilities, so every fallback used by the combo should support tools.

Deploy after setting the private environment values:

```bash
cd /opt/max-travel-booking/booking-platform
git pull --ff-only origin main
docker compose --env-file .env.production -f compose.production.yaml up -d --build --no-deps --force-recreate --wait app
docker compose --env-file .env.production -f compose.production.yaml ps app
```

These changes require no new database schema or worker configuration. Disabling `MAX_AI_ENABLED` and recreating the app container disables the integration.

Run the gateway diagnostic from the deployed app container:

```bash
docker exec max-travel-booking-app-1 node scripts/check-max-ai.mjs
```

It checks model discovery and makes a few small synthetic inference requests: a function call with exact search arguments, a matching tool-result follow-up and an incomplete flight request. It prints configuration presence and outcome metadata, never the gateway key or customer data. It does not call Tripjack, create a booking or start payment. These inference requests use the gateway's normal model quota. Keep any copied diagnostic output limited to these status fields.

If gateway access fails, check the container-to-gateway address, the OmniRoute application key, exact `apexv1` model/combo mapping and function-tool capability. An HTTP 200 from `/models` is only discovery; it is not proof that the search tool protocol works.

## Conversation and access boundaries

The chat request contains a user message, an optional opaque continuation token and a bounded page pathname. Client-supplied assistant roles, tool messages and URLs do not authorize application actions.

Continuation tokens use AES-256-GCM with a fresh random nonce. A purpose-separated key encrypts and authenticates the bounded server history. Associated data binds it to the current user or guest identity and company context. Tokens expire after 30 minutes. Invalid, altered, expired and differently owned tokens require a new chat. Rotating the conversation secret invalidates existing chat continuations.

History retains at most 24 messages and 24 KiB by removing whole completed turns. Tool-call/result pairs remain intact. The browser token is capped at 50 KiB; server-only system instructions are regenerated for every turn. Conversation history is not an authority to bypass current authentication or search ownership checks.

The endpoint lives beneath `/api/travel` so the existing HTTP-only shopping cookie reaches it. Search responses preserve that cookie between tools and browser turns. The existing guest-search claim and authenticated repricing still run at checkout. An expired search requires a fresh search.

Searches are read-only supplier lookups. Tools use fixed dispatch targets, strict schemas and existing application access checks. They do not accept arbitrary HTTP endpoints, database queries, user IDs, company IDs, prices or payment instructions from the model. Model prose is rendered as text; application-built cards and validated internal actions carry the links.

Same-origin checks, shared request limits, bounded tool loops, response sizes and timeouts apply. Logs must not contain chat bodies, cookies, API keys, raw provider responses or private booking records.

The app does not save a chat transcript to its database or browser local storage. Messages are still processed by OmniRoute and its selected upstream provider; review their logging and retention configuration. Users should keep passwords, OTPs, authenticator codes, card details, passports and PAN information out of chat.

## Validation checklist

Local validation on 17 November 2026 passed: production build and TypeScript,
ESLint, 692 unit tests, and 150 selected desktop/mobile browser cases. Browser
cases use synthetic API/payment responses against the production UI. Screenshots
were reviewed at 1440px, 390px and 320px. Coverage includes chat recovery and
account changes, owned flight handoff, hotel browsing, checkout, and history.

These checks do not establish live `apexv1` tool-calling or supplier availability.
The unauthenticated gateway discovery request returned HTTP 401; the private VPS
key is still required for the diagnostic and live acceptance checks below.
The existing Next.js dependency security advisory remains outside this change.

1. Verify gateway authentication, the exact `apexv1` target and an actual function-tool response from inside the app container. Use the deployment diagnostic supplied with this change; a `/models` response alone is insufficient.
2. Start a signed-out chat with “I want a flight ticket”. It should ask for missing route/date details instead of inventing a fare.
3. Provide an exact future route and passenger count. Open a returned card and confirm the original route, dates, party and customer estimates appear in the results screen.
4. Request a hotel stay with destination, dates, rooms, guests, child ages where needed, and nationality. Confirm full-stay price basis and room review handoff. Check a destination with no results and a supplier outage.
5. Ask for return flights, ambiguous Mumbai airports and incomplete dates. Verify that it clarifies ambiguity and does not combine incompatible fares or silently substitute NMI for BOM.
6. Ask for your trips signed out, then signed in. Switch accounts and sign out again. Old private cards and conversation state must be cleared and unavailable to the new session.
7. Ask it to book, pay, cancel, refund or change pricing. It should open the correct app screen and never claim it performed the change.
8. Test stop, close/reopen, new chat, network failure and expired conversation recovery on desktop and mobile. Complete a normal flight/hotel checkout separately to verify the assistant does not obstruct those controls.

Use test supplier/payment environments for checkout validation. Do not test a live payment or supplier reservation merely to check whether the assistant renders results.

## Reference

OmniRoute documents its OpenAI-shaped `/v1/chat/completions` protocol, bearer authentication and tool-result exchange in the [compatibility reference](https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.54/docs/reference/OPENAI_COMPATIBILITY.md). Provider support varies; structured outputs and parallel tools are not guaranteed for every model. Its [setup guide](https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.54/docs/guides/SETUP_GUIDE.md) describes creating endpoint keys and model/combo configuration. Verify the installed VPS version before relying on gateway-specific settings.
