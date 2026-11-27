# Max Travel native app



Expo / React Native Android and iOS source sharing the booking-platform APIs. Supports SecureStore-backed auth, MFA sign-in, domestic/international flight and hotel checkout, return fare selection, children/infants, shared-occupancy rooms, destinations/nationalities, GST/emergency/document fields, saved traveller use, trips and cancellation-offer acceptance.



Run `npm ci`, `npm run lint` and `npm run typecheck`. Install a native development build before starting Metro with `npx expo start --dev-client`. The development profile includes `expo-dev-client` and supports the native Razorpay module. Build with `npx expo run:android`, or use the EAS development profile for Android and iOS.



Set `EXPO_PUBLIC_API_URL` to the reachable API origin used by backend `BETTER_AUTH_URL`. Set it separately in the Expo development, preview and production environments. The preview and production build hook requires an HTTPS origin without credentials, a path or query parameters. Device localhost refers to the device itself. Keep provider credentials on the backend.



JavaScript checks: npx expo export --platform android --output-dir dist-android and npx expo export --platform ios --output-dir dist-ios. Exports are not installable APK/IPA files. Final signing accounts, physical-device payment/auth/deep-link tests and store submission remain release work.



Native authenticator enrolment, recovery-code sign-in and saved traveller management use the shared account service. Email verification and reset links use the web account flow. Destination lookup requires the backend catalogue. Check dependency compatibility with `npx expo install --check` and review the current dependency report with `npm audit`.



Max Travel icons, adaptive icons and splash assets are supplied. `npm run brand:assets` regenerates them from the vector master (run from this sibling project layout). Airport autocomplete, refund progress and paginated trip history are included.



## Advanced flight services

Book supports two to six multi-city legs. My Trips supports selected-passenger/flight cancellations and linked post-ticket seats, meals, baggage and one-time replacement-flight purchases using native Razorpay. Zero-cost additions skip gateway payment. Supplier rules and ambiguous/unknown outcomes are shown as operations cases. Actual device/provider acceptance remains pending.
