import { businessProfile, businessStructuredData } from "./business-profile";
import { canonicalUrl, SITE_NAME } from "./seo";
import { isPublicSeoPath } from "./seo-registry";

export type Breadcrumb = { label: string; href: string };
type EditorialPage = { path: string; title: string; description: string; reviewedAt?: string };

/** Only authored public content belongs in discovery markup, never a quote or account. */
function publicUrl(path: string) {
  if (!isPublicSeoPath(path)) throw new Error("Discovery graph requires an authored public path.");
  return canonicalUrl(path);
}

export function websiteStructuredData() {
  return {
    "@context": "https://schema.org", "@type": "WebSite",
    "@id": `${canonicalUrl("/")}#website`, url: canonicalUrl("/"), name: SITE_NAME,
    inLanguage: "en-IN", publisher: { "@id": `${canonicalUrl("/")}#organization` },
    // No SearchAction: the booking form is not a public site-search endpoint.
  };
}

export function breadcrumbStructuredData(items: readonly Breadcrumb[], path: string) {
  if (items.length < 2 || items[0].href !== "/" || items.at(-1)?.href !== path) {
    throw new Error("Breadcrumbs must match the visible home-to-page trail.");
  }
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList", "@id": `${publicUrl(path)}#breadcrumb`,
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.label, item: publicUrl(item.href) })),
  };
}

/** Rendered from the same title, review date, breadcrumbs and references as the article. */
export function editorialDiscoveryGraph(page: EditorialPage, breadcrumbs: readonly Breadcrumb[], options: {
  fullBusinessProfile?: boolean; sources?: readonly { label: string; href: string }[];
} = {}) {
  const url = publicUrl(page.path);
  const references = options.sources?.map(source => {
    const href = new URL(source.href);
    if (href.protocol !== "https:" || href.username || href.password) throw new Error("Editorial references require public HTTPS URLs.");
    return { "@type": "CreativeWork", name: source.label, url: href.href };
  });
  const publisher = options.fullBusinessProfile ? businessStructuredData() : {
    "@context": "https://schema.org", "@type": "Organization", "@id": `${canonicalUrl("/")}#organization`,
    name: businessProfile.name, url: businessProfile.website,
    telephone: businessProfile.phoneE164, email: businessProfile.email,
  };
  return [
    {
      "@context": "https://schema.org", "@type": "WebPage", "@id": `${url}#webpage`,
      url, name: page.title, description: page.description, dateModified: page.reviewedAt,
      inLanguage: "en-IN", publisher: { "@id": publisher["@id"] },
      isPartOf: { "@id": `${canonicalUrl("/")}#website` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
      ...(references?.length ? { citation: references } : {}),
    },
    breadcrumbStructuredData(breadcrumbs, page.path), websiteStructuredData(), publisher,
  ] as const;
}

export function homeDiscoveryGraph() {
  return [websiteStructuredData(), businessStructuredData()] as const;
}
