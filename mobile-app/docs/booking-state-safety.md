# Native booking-state safety

## Invariants

- `AccountSession` keys the complete native screen tree by authenticated user ID. A logout or account change disposes all in-memory trips, saved travellers, guest/contact/GST/emergency details, quotes and messages. Traveller/contact/GST/emergency/payment payloads are never persisted. Only an opaque pending quote ID is stored in an account-scoped Expo SecureStore key before payment creation, allowing safe restart recovery.
- Search criteria produce one validated payload/guest snapshot. Hotel guest room indices and child ages are preserved per room; flight and hotel party drafts do not contaminate one another. Dates use the backend's Asia/Kolkata calendar.
- A changed search invalidates old results, quote, selection and consent. Destination and nationality labels are controlled alongside their selected IDs, including when returning from a quote or another tab.
- Request generations plus abort signals prevent superseded/unmounted search, review, hotel-detail, saved-traveller and service-payment responses from being applied. The main action lock also prevents duplicate taps before React rerenders.
- Trip polling is non-overlapping, stops on leaving My trips, and refreshes every loaded page. The complete loaded window is replaced rather than appended indefinitely. Poll spacing grows with the page count to avoid increasing the request rate as older trips are loaded.
- Recovery hydration blocks new checkouts until the stored marker is known. Owned read-only payment status is checked without opening Razorpay; unresolved/no-order/401/404 outcomes retain the lock. Only an explicit server `checkoutResolved` result or successful verification clears it.
- Review expiry is checked before creation and again after the asynchronous create response, before Razorpay opens, not only displayed. Payment submission locks editing/navigation; an uncertain payment attempt is not offered a blind repeat. Verified payment is explicitly distinct from supplier booking confirmation.

## Offline verification

```sh
npm ci
npm test
npm run typecheck
EXPO_NO_TELEMETRY=1 npm run lint
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_URL=https://booking.example.com npx expo export --platform android --output-dir /tmp/maxtripjack-android
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_URL=https://booking.example.com npx expo export --platform ios --output-dir /tmp/maxtripjack-ios
```

Tests use synthetic data and deferred promises, not provider requests. Coverage includes response reordering, account/navigation teardown, pagination replacement, per-room occupancy, independent product drafts, date/count validation, multi-city and return criteria, IST midnight and quote expiry.

Native exports verify Metro/Hermes compilation, not device UI interaction. Before release, run signed-in account switching, keyboard/screen-reader, expired-review and sandbox payment return/verification flows on Android/iOS devices. No live payment or supplier booking is needed for this code-level check.

SDK references checked before native changes: https://docs.expo.dev/versions/v57.0.0/ and https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
