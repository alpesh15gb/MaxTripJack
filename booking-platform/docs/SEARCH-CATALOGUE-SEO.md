# Search catalogues: hotel and flight SEO

The booking app now serves permanent hotel pages and flight route pages from its own database. Crawlers and page visitors do not trigger Tripjack searches. Hotel content comes from Tripjack's static content APIs; flight routes are discovered from successful Tripjack search results already stored by the booking app.

This adds the infrastructure to cover the available supplier catalogue over time. It does not immediately populate every hotel, manufacture every possible airport pair, or guarantee a Google ranking.

## Public pages and discovery

| URL | Purpose |
| --- | --- |
| `/hotels` | Searchable hotel directory with crawlable pagination |
| `/hotels/page/2` | Clean directory pagination |
| `/hotels/<hotel-name-city>-<supplier-id>` | Stable property page with real address, descriptions, amenities and available photos |
| `/flights/routes` | Directory of discovered flight routes |
| `/flights/routes/page/2` | Clean flight directory pagination |
| `/flights/<origin-city>-<iata>-to-<destination-city>-<iata>` | Route page backed by stored supplier evidence |
| `/flights/lucknow-to-hyderabad` | Authored Lucknow–Hyderabad travel guide |
| `/sitemap.xml` | Existing editorial/public-page sitemap |
| `/hotel-sitemap.xml` | Hotel sitemap index, with up to 10,000 property URLs per shard |
| `/flight-routes-sitemap.xml` | Flight route sitemap index |

Both indexes advertise root-level shard URLs (`/hotel-sitemap-0.xml` and `/flight-route-sitemap-0.xml`). Their directory scope therefore covers the actual hotel and flight pages without depending on a Search Console exception. Next.js internally rewrites these aliases to the existing handlers; the earlier nested endpoints remain compatible but are no longer advertised.

Property slugs are saved with the hotel record. A different name slug containing the same ID redirects to the saved canonical URL. Unknown or inactive properties return 404. Search query variants are not indexable. Structured data describes supplied facts; it does not invent prices, availability, reviews or ratings.

For a query such as “Seasons Hotel Mira Road”, the matching property must first arrive in the supplier catalogue with enough useful content. Its real name, location, address, canonical URL and structured data then give search engines a relevant page to evaluate. Duplicate supplier content alone is not a promise of a higher position.

Directory searches keep words in context: a coherent hotel name, city/locality/address phrase, or a hotel-name plus location combination. “Mira Road” will not match an unrelated hotel with “Mira” in its name and “Road” elsewhere in its address. Exact name/location matches rank first. Search ignores case, common punctuation and Latin accents while preserving non-Latin text. Counts and pagination use the same matching rules; searches do not trigger supplier API requests.

## Automatic collection and refresh

The opt-in Compose `catalogue` profile starts `catalogue-worker` using the same booking image. Each cycle:

1. Scans a bounded batch of persisted flight search responses. It records actual itinerary endpoints, evidence environment and verification date, without copying fares, passenger or contact details into the route catalogue. This step makes no supplier requests.
2. Advances the hotel import by up to two country-mapping pages, retrieving hotel content in bounded batches. Checkpoints allow interrupted imports to resume. Countries and properties depend on the access granted to the Tripjack account.
3. Waits five minutes after success, or fifteen minutes after a failed cycle. Once a complete hotel mapping run is older than seven days, it starts a refresh.

Hotel catalogue import uses the existing `TRIPJACK_HOTEL_API_KEY`. No route feed is required: route coverage grows from successful searches that the booking app actually sees. The discovery scan considers recent stored searches, not an unlimited historical archive. An optional local JSONL route-manifest importer exists for a future verified supplier feed; it is not part of the deployment below and is not permission to label test routes as production.

India is imported first when it is present in the supplier's country list. For an import already in progress, the worker finishes the loaded mapping page, saves the interrupted country's next-page cursor, then switches to India. Once India completes, it resumes that saved country before continuing the remaining list. Completed countries and previously imported hotel records are retained. If India is already complete, the worker continues normally; future refresh runs start with India again. This prioritises collection without promising that a particular hotel exists in the supplier feed.

The worker writes only booking-owned catalogue/checkpoint tables. It does not process bookings, payments, notifications, CRM events or enquiries. It does not connect to Safar CRM.

## Indexing and production boundaries

Keep these defaults during booking testing; missing catalogue settings also default to UAT:

```dotenv
HOTEL_CATALOGUE_ENVIRONMENT=uat
HOTEL_CATALOGUE_PRODUCTION_APPROVED=false
```

The existing site-wide gate remains unchanged: indexing requires `NODE_ENV=production`, `SEO_INDEXING_ENABLED=true` and `SEO_SITE_ORIGIN=https://maxtravel.in`. Do not turn it on just to test this release.

- UAT hotel and discovered flight records remain `noindex` even if the editorial site's global indexing gate is enabled.
- A hotel is eligible only with an active, complete production record and content refreshed within 90 days. Useful content requires identity/location/address plus a substantive description or enough supplied amenities. Thin or stale records are excluded from the hotel sitemap.
- A discovered flight route needs production provenance, complete airport identities and useful route content, and verification within 180 days. The current booking provider persists UAT provenance; changing a catalogue flag cannot convert those responses into production evidence.
- The independently authored flight guides follow the existing editorial SEO rules.
- Private checkout/account/admin URLs and search query variants stay outside the indexing surface.

Before importing production hotel content, obtain Tripjack approval and credentials/access appropriate to its production static-content API. Only then explicitly set `HOTEL_CATALOGUE_ENVIRONMENT=production` and `HOTEL_CATALOGUE_PRODUCTION_APPROVED=true`. Verify the site's public release and global SEO gate separately.

**Production catalogue content does not switch booking endpoints.** Booking still uses its existing UAT integration. A production property's action opens a named hotel email enquiry or the contact page, so its ID cannot be passed into UAT checkout. UAT preview properties can prefill the test hotel search. Direct production booking requires a separate certified booking-provider release; there is no hidden host switch in this work.

## Pull and deploy on the booking VPS

Run the following in Bash on the existing VPS. It uses the existing booking database container, keeps its password out of terminal output and shell history, and stops if an essential step fails. The temporary exported credentials exist only inside the subshell. Do not run with shell tracing or paste environment dumps into support messages.

```bash
(
  set +x
  set -e
  cd /opt/max-travel-booking/booking-platform
  git pull --ff-only origin main

  POSTGRES_PASSWORD="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_PASSWORD)"
  POSTGRES_USER="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_USER)"
  : "${POSTGRES_PASSWORD:?Existing booking database password is unavailable}"
  : "${POSTGRES_USER:?Existing booking database owner is unavailable}"
  export POSTGRES_PASSWORD POSTGRES_USER

  docker compose --env-file .env.production -f compose.production.yaml build app

  docker compose --env-file .env.production -f compose.production.yaml --profile catalogue \
    stop catalogue-worker

  docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
    -e POSTGRES_PASSWORD -e POSTGRES_USER \
    app node scripts/migrate-search-catalogues.mjs

  docker compose --env-file .env.production -f compose.production.yaml \
    up -d --no-deps --force-recreate --wait app

  docker compose --env-file .env.production -f compose.production.yaml --profile catalogue \
    up -d --no-deps --force-recreate catalogue-worker

  docker exec max-travel-booking-app-1 node --conditions=react-server \
    --import ./scripts/standalone-server.mjs dist/check-search-catalogues.mjs
)
```

Capturing the existing password also satisfies Compose's required `POSTGRES_PASSWORD` interpolation without adding it to `.env.production`. The migration helper retains the configured booking database target and uses the owner credentials only for the migration process. It runs pending booking migrations before the app restarts, including `028-hotel-catalogue-priority.sql` (saved import cursor) and `029-hotel-catalogue-search.sql` (normalised search projections and index). Migration 029 backfills existing records and may take longer for a large catalogue. It does not alter the application's runtime database credentials. Keep the catalogue worker stopped between migration and recreation so the old binary cannot overwrite the new resume state. If migration fails, resolve it before restarting the new app or worker.

These commands recreate only the booking `app` and `catalogue-worker`. They do not deploy Safar CRM, start the CRM/enquiry profiles, restart transaction workers, or recreate Postgres. Do not use a bare `docker compose up` for this release.

## Check progress and the public pages

The first check can legitimately show zero hotels while the initial import is starting. Use these read-only checks later:

```bash
docker logs --since 20m --tail 80 max-travel-booking-catalogue-worker-1

docker exec max-travel-booking-app-1 node --conditions=react-server \
  --import ./scripts/standalone-server.mjs dist/check-search-catalogues.mjs
```

The diagnostic prints aggregate availability, counts, progress and indexing eligibility. It makes no supplier or CRM requests and prints no API keys or customer records. `productionIndexableTotal: 0` is expected for a UAT hotel catalogue. A successful sync is not proof that Google has crawled or ranked anything.

Check `/hotels`, a populated property, `/flights/routes` and `/flights/lucknow-to-hyderabad` on desktop and mobile. Confirm real content, working pagination, appropriate test/enquiry actions, canonical tags and `noindex` where required. Test an actual flight search and allow the discovery worker to run; new routes may need time to appear. An empty directory is preferable to fabricated supplier coverage.

If imports pause, inspect the sanitized worker code/status and rerun the worker after resolving access or network problems; checkpoints are retained. The check script reporting unavailable tables indicates migration/configuration needs attention. To pause only catalogue collection:

```bash
docker stop max-travel-booking-catalogue-worker-1
```

After a separate approved production launch, inspect sample canonical URLs in Google Search Console and submit the three sitemap URLs listed above. Check that production pages are accessible, eligible and present in their sitemap shards first. Search Console submission and live indexing activation are manual follow-up steps; this implementation has not performed them.

## Isolated verification for developers

The HTTP checks use synthetic records in an in-memory database. The preload is test-only; production routes have no fixture flag or request-header bypass. It blocks outbound fetches and does not use VPS databases or credentials.

After `npm run build`, start this separate local process from `booking-platform`:

```bash
node --import tsx --import ./tests/catalogue-ssr-db.mts node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3112
```

In another terminal, run `node --test tests/catalogue-seo-http.mjs`. The verifier only connects to `127.0.0.1:3112`, even when checking production canonical URLs. It covers SSR metadata and structured data, pagination, canonical redirects, missing/inactive properties, indexing exclusions, both flight page types, and root-level sitemap rewrites. Stop the local process after testing. This does not test real supplier credentials, full catalogue access or booking transactions.

## Primary references

- [Tripjack API documentation](https://tripjack.com/page/api-doc): hotel country, mapping and static-content endpoints, and supplier environment documentation.
- [Google Search Essentials](https://developers.google.com/search/docs/essentials): technical and content requirements for appearing in Search.
- [Google: build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): canonical URL discovery and sitemap submission; submission does not guarantee indexing.
- [Google: request a recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl): Search Console follow-up after public release.
