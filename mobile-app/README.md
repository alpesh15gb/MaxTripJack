# Max Travel native app



Expo / React Native Android and iOS source sharing the booking-platform APIs. Supports SecureStore-backed auth, MFA sign-in, domestic/international flight and hotel checkout, return fare selection, children/infants, shared-occupancy rooms, destinations/nationalities, GST/emergency/document fields, saved traveller use, trips and cancellation-offer acceptance.



Run npm ci, npm run typecheck, then npx expo start --dev-client. Native Razorpay requires a development/release native build; Expo Go cannot execute checkout. Build with npx expo run:android or configure EAS using eas.json. iOS binaries require macOS/Xcode or EAS and signing credentials.



Set EXPO_PUBLIC_API_URL to the reachable HTTPS API origin used by backend BETTER_AUTH_URL. Device localhost means the device, not the computer. Release builds reject non-HTTPS URLs. Never include provider secrets in native environment variables.



JavaScript checks: npx expo export --platform android --output-dir dist-android and npx expo export --platform ios --output-dir dist-ios. Exports are not installable APK/IPA files. Final signing accounts, physical-device payment/auth/deep-link tests and store submission remain release work.



Native authenticator enrolment, recovery-code sign-in and saved-traveller create/edit/delete are implemented. Email verification/reset links use the web account flow. Destination lookup needs backend catalogue sync. Existing Expo/Metro dependency advisories need resolution/assessment before release; compatible audit fixes were applied without forcing a broken SDK downgrade.



Max Travel icons, adaptive icons and splash assets are supplied. `npm run brand:assets` regenerates them from the vector master (run from this sibling project layout). Airport autocomplete, refund progress and paginated trip history are included.



## Advanced flight services

Book supports two to six multi-city legs. My Trips supports selected-passenger/flight cancellations and linked post-ticket seats, meals, baggage and one-time replacement-flight purchases using native Razorpay. Zero-cost additions skip gateway payment. Supplier rules and ambiguous/unknown outcomes are shown as operations cases. Actual device/provider acceptance remains pending.
