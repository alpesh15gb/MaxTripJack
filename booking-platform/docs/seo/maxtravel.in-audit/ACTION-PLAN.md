# maxtravel.in SEO audit and action plan — 18 November 2026

Audited live with the claude-seo plugin (v2.6.2) checks plus code review at commit 02a31bc.
Business type: travel agency (OTA + Secunderabad office, local service hybrid).

## Verdict

The code is SEO-ready: unique titles/descriptions, clean canonicals, server-rendered pages with
550–930 words of real content, alt text on every image, BreadcrumbList / WebPage / Organization /
LodgingBusiness / CreativeWork JSON-LD, sharded hotel and flight-route sitemaps, and an llms.txt.

**The live site is deliberately hidden from every search engine and AI assistant**, because the
indexing gate is still off (correct while the site is UAT):

| Live check | Result |
| --- | --- |
| `/robots.txt` | `User-Agent: * / Disallow: /` |
| Every page | `X-Robots-Tag: noindex, nofollow` + `<meta name="robots" content="noindex, nofollow">` |
| `/sitemap.xml` | empty `<urlset>` |
| `/llms.txt` | 404 (gated by the same flag) |
| `https://www.maxtravel.in` | TLS error — certificate does not cover `www` |

No amount of on-page work ranks a noindexed site. Nothing below matters until Phase 1 is done.

## Phase 1 — go-live (when UAT ends; owner/server action)

1. On the VPS `.env`: `SEO_INDEXING_ENABLED=true`, `SEO_SITE_ORIGIN=https://maxtravel.in`,
   `SEO_AI_TRAINING_ENABLED=true` (owner decision 2026-11-18: allow GPTBot/Google-Extended for
   ChatGPT/Gemini visibility). Restart the app.
2. For hotel pages to be indexable: production catalogue (`HOTEL_CATALOGUE_ENVIRONMENT=production`,
   `HOTEL_CATALOGUE_PRODUCTION_APPROVED=true`) once the supplier's production content access exists.
   UAT hotel/route records stay noindex by design.
3. Re-issue the certificate to include `www.maxtravel.in` and 301 `www` → apex in nginx.
4. Verify: `curl -sI https://maxtravel.in/ | grep -i robots` shows no noindex; robots.txt lists the
   three sitemaps; `/sitemap.xml` has URLs; `/llms.txt` returns 200.
5. Google Search Console + Bing Webmaster Tools: verify the domain, submit `/sitemap.xml`,
   `/hotel-sitemap.xml`, `/flight-routes-sitemap.xml`. Bing feeds ChatGPT search and Copilot.
6. Google Business Profile: link the website, fix Sunday hours (see docs/seo/README.md).

## Phase 2 — done in code (this change)

- Hotel property titles capped to ~60 chars with the brand suffix (were up to 106) and
  descriptions to 158 chars at a word boundary (were 177, cut mid-word).
- Hotel directory title now names what the page offers.
- Flight route directory: Open Graph/Twitter metadata, plus CollectionPage, BreadcrumbList and
  ItemList JSON-LD (it previously had none).

## Phase 3 — content and authority (month 1–2)

- Home H1 "Find your next escape." carries no search terms; consider a keyword-bearing H1 such as
  "Flights, hotels and holidays from Secunderabad" (copy decision).
- `/packages` is thin (187 words) while the CRM catalogue outage persists; fix the feed or noindex it.
- More authored route guides for high-demand routes from Hyderabad (12 are published today).
- Real reviews (Google), office photos, and accreditation (IATA/TAAI) evidence for E-E-A-T.
- Earn local citations/links: JustDial, Sulekha, TripAdvisor, local news.

## Phase 4 — monitoring

- GSC coverage and Core Web Vitals field data once traffic exists (`/seo google` after setup).
- `/seo drift baseline https://maxtravel.in` after go-live to catch SEO regressions per deploy.
