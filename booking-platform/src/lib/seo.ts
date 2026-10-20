import type { Metadata, MetadataRoute } from "next";
import { isPublicSeoPath, PUBLIC_SEO_PAGES } from "./seo-registry";

export const SITE_ORIGIN = "https://maxtravel.in";
export const SITE_NAME = "MaxTravel";
export type SeoEnvironment = Readonly<Record<string, string | undefined>>;
export type JsonLdData = Record<string, unknown> | readonly Record<string, unknown>[];

/** Canonicals are authored internal paths, never request hosts or customer URLs. */
export function canonicalUrl(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020]/.test(path)) {
    throw new Error("Canonical URL requires a safe internal path.");
  }
  const url = new URL(path, SITE_ORIGIN);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  return url.toString();
}

/** A production build is still UAT unless the owner explicitly approves indexing. */
export function indexingEnabled(environment: SeoEnvironment = process.env) {
  return environment.NODE_ENV === "production"
    && environment.SEO_INDEXING_ENABLED === "true"
    && environment.SEO_SITE_ORIGIN === SITE_ORIGIN;
}

export function siteRobots(environment: SeoEnvironment = process.env): Metadata["robots"] {
  return indexingEnabled(environment) ? { index: true, follow: true } : { index: false, follow: false };
}

export function pageMetadata(path: string, title: string, description: string): Metadata {
  const canonical = canonicalUrl(path);
  const publicPage = isPublicSeoPath(new URL(canonical).pathname);
  return {
    title,
    description,
    alternates: { canonical },
    robots: publicPage ? siteRobots() : { index: false, follow: false },
    openGraph: { type: "website", siteName: SITE_NAME, title, description, url: canonical, locale: "en_IN" },
    twitter: { card: "summary", title, description },
  };
}

export function privatePageMetadata(title: string, follow = false): Metadata {
  return { title, robots: { index: false, follow } };
}

/** Request-origin guard prevents a preview host inheriting production SEO settings. */
export function requestMayBeIndexed(url: URL, environment: SeoEnvironment = process.env) {
  return indexingEnabled(environment) && url.origin === SITE_ORIGIN && !url.search && isPublicSeoPath(url.pathname);
}

export function buildRobots(environment: SeoEnvironment = process.env): MetadataRoute.Robots {
  if (!indexingEnabled(environment)) return { rules: { userAgent: "*", disallow: "/" } };
  const rules: MetadataRoute.Robots["rules"] = [
    // Private HTML is crawlable so noindex is readable. Authentication, not robots,
    // protects data. Do not add bot-specific Allow groups that bypass exclusions.
    { userAgent: "*", allow: "/", disallow: "/api/" },
  ];
  if (environment.SEO_AI_TRAINING_ENABLED !== "true") {
    // Named documented product controls, not a universal training-crawler ban.
    // Google-Extended also controls some Gemini grounding uses, not Google Search.
    rules.push({ userAgent: ["GPTBot", "Google-Extended"], disallow: "/" });
  }
  return { rules, sitemap: canonicalUrl("/sitemap.xml") };
}

export function buildSitemap(environment: SeoEnvironment = process.env): MetadataRoute.Sitemap {
  if (!indexingEnabled(environment)) return [];
  return PUBLIC_SEO_PAGES.map(page => ({ url: canonicalUrl(page.path), lastModified: page.lastModified }));
}

export function serializeJsonLd(data: JsonLdData) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
