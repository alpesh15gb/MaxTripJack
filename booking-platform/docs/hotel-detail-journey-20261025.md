# Hotel property journey — local implementation

Base: `06615409f45c5ac9ef3b01b2538b26838ac0c69f` (verified GitHub main).
Branch: `feat/hotel-detail-journey-20261025`. No unrelated arrow branch merged.

## Customer journey

Hotel name and photo are genuine same-property links. Normal clicks open the property overview immediately; a new-tab/direct link restores an owned search snapshot. The overview includes retained dates/rooms/guests, property category/address, safe supplier photo mosaic and keyboard-accessible gallery, supplied amenities and room availability independently. Loading, unavailable metadata, failed photos, room errors/retry and no inventory are explicit.

Room combinations are grouped by the complete ordered room ID/name sequence. Rate plans remain distinct original option IDs, with meal/inclusion/cancellation differences and full-stay totals for all requested rooms. Unknown room compositions are not merged. Selecting a rate retains the existing authenticated supplier review, reprice and checkout safety flow. Mobile gets a persistent room CTA without covering the gallery or footer.

## Navigation and privacy

Next 16.4.1 installed documentation (`01-app/01-getting-started/04-linking-and-navigating.md`, Native History API) explicitly supports native `pushState`/`replaceState` integration without a page reload. This preserves the mounted results/filter state rather than remounting the existing `/book` workspace keyed by server prefill.

Public URL steps use `browseSearch`, `stay`, `gallery`, `stayStep`. Only validated public search criteria are copied; unknown/auth fields are removed. URLs over 2,000 characters retain only the validated owned search/property pointer, never truncated room occupancy. The snapshot endpoint restores authoritative search criteria and the Modify search controls. Browser Back/Forward returns between property/gallery/results; returning from review restores the selected rate. Pending review and stale snapshot responses cannot resurrect abandoned state.

Only bounded filters/sort/scroll are stored per tab: 20 entries maximum, 30-minute expiry. No rates, raw results, travellers, payment fields, credentials or tokens are stored by browsing recovery.

`POST /api/travel/hotel-search-snapshot` validates origin, shopping access, UUID input, rate limit, user/company ownership, product and expiry. It projects the existing database search through customer pricing/static-content allowlists without calling the supplier. Cross-browser/foreign/expired searches fail safely. Guest ownership claiming remains only in the established review flow.

## Truthful-data limits

No invented property description, reviews, map, room beds/size/capacity, nightly tax split or property-wide free-cancellation promise. Static projection provides category/type/address/amenities/photos plus optional bounded supplier description as documented below. Prices remain estimates until existing review; property-payable charges are not independently verified. Photos remain on exact allowlisted supplier hosts with no referrer/proxy.

## Verification

Final local production build, TypeScript and full lint passed; the full unit suite passed 405/405. Playwright discovery found 28 desktop/mobile cases in the new journey spec. Focused tests cover snapshot boundaries, URL/storage privacy and grouped UI contracts.

`tests/browser/hotel-detail-journey.spec.ts` covers name/photo entry, gallery keyboard/history, room/review, Back/Forward/reload, filters, pointer-only authoritative criteria, expired/foreign searches, missing photos/content, empty/error rates, multi-room option IDs and interrupted request races on desktop 1440 and mobile 390. Existing affected browser scenarios were updated rather than bypassed.

**Browser execution and visual screenshots are NOT locally verified.** Playwright browser download returned invalid/empty archives; a system-browser smoke launch was denied by sandbox and escalation startup failed. Further attempts were stopped. Existing `browser-ui` CI runs the full synthetic-provider suite and uploads `booking-ui-synthetic-provider-evidence`; successful CI and inspection of its screenshots are required before claiming user-flow/visual acceptance. No live supplier, payment, VPS, remote push or deployment was performed by this local work.

## Optional supplier About content follow-up

Official rendered [TripJack bulk Hotel Content documentation](https://tripjack.com/page/api-doc#hotel-content) documents `hotels[].descriptions.headline` and `descriptions.default` as a JSON string. Its illustrative optional `Overview`/`Snippet` fields are not guaranteed. The separate static-detail response is a different schema and is not used.

The existing bulk payload now projects a 200-character headline and at most 4,000 characters of Overview (otherwise Snippet), parsed once only from bounded 32KB input. Unknown structures, arrays, prototype keys and nonstring values are rejected. Conservative plain-text conversion removes markup, scripts/styles/comments and controls; consumers render React text only, never HTML. Missing descriptions remain explicitly unavailable rather than substituting an address or generated prose. Long descriptions have a 600-character preview with an explicit full-description disclosure. No new supplier request, credentials, static-room schema or property-policy/cancellation inference was added.
