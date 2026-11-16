# Airline display assets

96px PNGs generated from Soaring Symbols 0.4.1 colour icon/logo SVGs:
https://github.com/soaring-symbols/soaring-symbols
https://www.npmjs.com/package/soaring-symbols/v/0.4.1
The included SOARING-SYMBOLS-LICENSE.txt retains the MIT license notice.
Airline trademarks belong to their respective owners and are displayed to
identify the carrier in flight results, without implying endorsement.

IX.png is converted from Air India Express's official website favicon:
https://www.airindiaexpress.com/etc.clientlibs/air-asia/clientlibs/clientlib-react/resources/favicon.ico

Retrieved 2026-11-16. The catalogue in src/lib/airline-logos.json lists included
carriers and files. No remote logo service or API key is used at runtime.
Shared IATA codes require an exact normalized airline name match; otherwise the
UI shows a code fallback. Missing or failed images also fall back to the code.
The supplier's airline name and flight number remain the source of itinerary
identity; this catalogue must not be used to infer an operating carrier.
