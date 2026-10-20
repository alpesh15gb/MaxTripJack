# MaxTravel — live domain and crawlability audit

**Observed:** 2026-10-20, 22:11–22:14 UTC; owner-context update at 22:15 UTC. **Scope:** read-only public DNS, HTTP/HTTPS, rendered page, crawlability; narrow connected-email search for intended hosting target. No DNS, hosting, account, credential, or production changes.

## Executive finding

**The public domain currently serves a Hostinger parked-domain page, not the MaxTravel booking application.** This is verified in cloud Chrome for both HTTPS hostnames and by matching HTTP response bodies. Consequently, changes to a repository alone will not restore the public site unless its actual deployment and domain mapping are established.

The parking deployment also blocks compliant crawlers, declares `noindex`, returns HTML instead of an XML sitemap, and responds to nonexistent paths with HTTP 200. Establish the correct production app and domain mapping before optimizing its pages. Do **not** merely remove the parked page's crawler restrictions.

## Verified DNS

Google Public DNS over HTTPS responses were fetched at approximately 22:12 UTC. Cloudflare's public resolver independently agreed on A, NS, and www CNAME at 22:13 UTC.

| Name | Type | Observed answer |
|---|---|---|
| `maxtravel.in` | A | `2.57.91.91` |
| `maxtravel.in` | AAAA | NOERROR, no AAAA answer |
| `maxtravel.in` | CNAME | NOERROR, no CNAME answer |
| `maxtravel.in` | NS | `helios.dns-parking.com.`, `aster.dns-parking.com.` |
| `www.maxtravel.in` | CNAME | `maxtravel.in.` |
| `www.maxtravel.in` | A | CNAME to apex, then `2.57.91.91` |
| `www.maxtravel.in` | AAAA | CNAME to apex, no AAAA answer |

Google's negative-response SOA was `helios.dns-parking.com. dns.hostinger.com. 2026101902 10000 2400 604800 600`. DNS and the rendered branding support a Hostinger parking configuration; they do not establish which account owns the domain, the registrar, or where the real app is deployed.

Public sources: [Google A lookup](https://dns.google/resolve?name=maxtravel.in&type=A), [Google NS lookup](https://dns.google/resolve?name=maxtravel.in&type=NS), [Google www CNAME lookup](https://dns.google/resolve?name=www.maxtravel.in&type=CNAME), [Cloudflare A lookup](https://cloudflare-dns.com/dns-query?name=maxtravel.in&type=A).

## HTTP, HTTPS, rendering and SEO evidence

| URL / test | Observed result | Priority / interpretation |
|---|---|---|
| `https://maxtravel.in/` | HTTP 200, `text/html`; Hostinger parking page | **P0:** booking platform absent from public hostname |
| `https://www.maxtravel.in/` | HTTP 200, same body; URL retains www | **P1:** no server-side www canonical redirect observed |
| `http://www.maxtravel.in/` | GET HTTP 200, full identical parked HTML, no `Location` header | **P1:** no server-side HTTP→HTTPS redirect observed |
| `http://maxtravel.in/` | GET HTTP 200, parked HTML, no `Location`; truncated transfer, curl exit 18, reproduced once | HTTP redirect not demonstrated; transport result is partially inconclusive |
| Both `/robots.txt` | HTTP 200, `text/plain`; `User-agent: *` followed by `Disallow: /` | **P0:** compliant search/AI crawlers are instructed not to crawl any paths |
| Both `/sitemap.xml` | HTTP 200, `text/html`; same parked page | **P1:** not an XML sitemap |
| `https://maxtravel.in/flights` | HTTP 200; same parked page | **P0:** no public flight page at the requested route |
| `https://maxtravel.in/maxtravel-seo-audit-nonexistent-20261020` | HTTP 200; same parked page | **P1:** invalid-path handling is soft-404-like rather than proper 404 |

The full parked HTML responses are 32,079 bytes, SHA-256 `b3036a68ba717a3a1f9b27f8cadca8788c5eec85d0372330284cd7370afc6b73`.

HTML and rendered DOM both show:

```html
<title>Parked Domain name on Hostinger DNS system</title>
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
```

No canonical link was found. Rendered H1 is empty. No `application/ld+json` structured-data blocks exist. The rendered content is Hostinger promotional material, not company, route, fare, policy, or booking content. JavaScript rendering does not reveal a hidden MaxTravel app.

The parking page's `robots.txt` is exactly:

```text
User-agent: *
Disallow: /
```

This is a robots policy finding, not a verified Google Search Console indexing report or a live request from a verified Googlebot address. A robots exclusion is not itself a guaranteed deindexing mechanism; the HTML independently declares noindex, though compliant crawlers may be unable to fetch it because robots blocks them.

### Redirect / TLS limitations

- Initial HTTP **HEAD** requests returned environment/proxy `503`. Subsequent HTTP **GET** requests returned the parking content above. GET evidence is more useful, but the apex HTTP body remained truncated.
- Chrome navigation to `http://maxtravel.in` ended at HTTPS. Browser auto-upgrade can explain this; it does **not** prove that a correct server-side 301/308 exists. Curl did not observe one.
- Both HTTPS pages rendered without a browser certificate warning. Curl's certificate verification succeeded through the environment's TLS-intercepting proxy, which presented an OpenAI-issued certificate. Its short validity period is **not** the public site's certificate validity.
- **Origin certificate issuer, SANs, expiration, and full public chain remain unverified.** No warning was bypassed. Do not report the proxy's certificate as MaxTravel's.
- `server: envoy` is also an environment-visible/proxied header and should not be used alone to identify the origin hosting stack.

## What is needed to fix this safely

1. **Identify the intended production deployment:** hosting provider, exact project/site/service identifier, production URL, domain-assignment screen or provider-prescribed A/AAAA/CNAME target, and deployment currently serving the working app. Do not guess a target from an arbitrary repository or staging supplier URL.
2. **Confirm source/deployment linkage:** authoritative repo and production branch, build/deploy command, relevant environment variable names (not secret values in chat), and current release. Verify existing booking flow and data before switching traffic.
3. **Obtain the appropriate authenticated access:** existing authorized session/connector or user-performed changes in the domain DNS manager and app-host dashboard. Need scope to inspect DNS records and configure the app's custom domain. Passwords, OTPs, and API keys should not be pasted into chat.
4. **Preserve the existing DNS zone:** export/read current MX/TXT/verification/subdomain records before proposing edits. Changing nameservers is not automatically necessary and could interrupt email or other services. No replacement DNS target is specified by the current brief.
5. **Approve a concrete production cutover:** provider-prescribed exact records, app domain assignment, TLS provisioning, redirect strategy, rollback values and verification. Preferred canonical suggested by the user's brief is `https://maxtravel.in/`, subject to their deployment's current requirements.
6. **Then verify:** correct app at both hosts; public TLS for both; one-hop 301/308 redirects; public landing pages with crawlable meaningful HTML; private booking/account/payment/search-result protections; robots policy; valid XML sitemap of canonical indexable pages; correct status codes; then Search Console live inspection and indexing evidence with authorized account access.

Public evidence cannot distinguish “DNS not switched to a working deployment,” “domain not assigned to the app host,” and “app not deployed yet.” All remain possible. The intended app must be located before DNS changes.

## Deployment target prerequisite

No verified production hosting project, server address or target DNS record has been established. Supplier staging endpoints are not website hosting destinations. Confirm the intended deployment before changing the domain.

## Reproduction and evidence files

The audit preserved timestamped public response headers, bodies, status codes and hashes; the observed results are summarized above. The following commands reproduce the public checks.

Representative read-only commands:

```sh
curl --max-time 30 -sS -D headers.txt -o body.html \
  -w '%{http_code} %{url_effective} %{ssl_verify_result}' https://maxtravel.in/
curl --max-time 30 -sS https://maxtravel.in/robots.txt
curl --max-time 30 -sS 'https://dns.google/resolve?name=maxtravel.in&type=A'
curl --max-time 30 -sS 'https://dns.google/resolve?name=maxtravel.in&type=NS'
curl --max-time 30 -sS 'https://dns.google/resolve?name=www.maxtravel.in&type=CNAME'
curl --max-time 25 -sS -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=maxtravel.in&type=A'
```

Local OS DNS resolution failed in this environment (`Temporary failure in name resolution`); public DNS-over-HTTPS succeeded. The web reading tool could not open Google resolver endpoints, but curl could. These are tool/environment limitations, not proof of a broken public DNS zone.

## Business verification and release status

The owner confirmed MaxTravel Secunderabad, the address G-10, Golden Hawk, Beside SBI, 1-8-208, Jogani, Ramgopalpet, Secunderabad 500003, India, phone/WhatsApp +91 7095-018-018, email max@maxtravel.us, and opening hours 09:00–21:00 every day (Asia/Kolkata). These are owner-confirmed details, not Google Business Profile verification. No coordinates, accreditation, ratings or office photos have been verified.

Public audit is complete. Production cutover is deferred. The intended app hosting target and authorized DNS configuration must be established before deployment. Origin TLS, Googlebot/Search Console indexing and live provider acceptance remain release checks. No customer data or production configuration was changed.
