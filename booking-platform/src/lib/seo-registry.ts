/**
 * Authored public pages only. Add a path only alongside its reviewed content.
 * Update a date when that page changes meaningfully, not on every request/build.
 * Search results, user data and supplier quotes must never enter this registry.
 */
export const PUBLIC_SEO_PAGES = [
  { path: "/privacy-policy", lastModified: "2026-11-24" },
  { path: "/terms-of-use", lastModified: "2026-11-24" },
  { path: "/cancellations-payment-policy", lastModified: "2026-11-01" },
  { path: "/disclaimer", lastModified: "2026-11-01" },

  { path: "/", lastModified: "2026-11-04" },
  { path: "/flights", lastModified: "2026-10-20" },
  { path: "/domestic-flights", lastModified: "2026-10-20" },
  { path: "/international-flights", lastModified: "2026-10-20" },
  { path: "/cheap-flight-tickets", lastModified: "2026-11-17" },
  { path: "/last-minute-flights", lastModified: "2026-10-20" },
  { path: "/flight-booking-guide", lastModified: "2026-10-20" },
  { path: "/flights/hyderabad-to-delhi", lastModified: "2026-10-20" },
  { path: "/flights/delhi-to-mumbai", lastModified: "2026-10-20" },
  { path: "/flights/hyderabad-to-dubai", lastModified: "2026-10-20" },
  { path: "/flights/mumbai-to-goa", lastModified: "2026-10-20" },
  { path: "/flights/delhi-to-bengaluru", lastModified: "2026-10-20" },
  { path: "/flights/hyderabad-to-bengaluru", lastModified: "2026-10-20" },
  { path: "/flights/bengaluru-to-hyderabad", lastModified: "2026-10-20" },
  { path: "/flights/hyderabad-to-mumbai", lastModified: "2026-10-20" },
  { path: "/flights/mumbai-to-hyderabad", lastModified: "2026-10-20" },
  { path: "/flights/hyderabad-to-goa", lastModified: "2026-10-20" },
  { path: "/flights/delhi-to-hyderabad", lastModified: "2026-10-20" },
  { path: "/flights/lucknow-to-hyderabad", lastModified: "2026-11-17" },
  { path: "/about", lastModified: "2026-11-17" },
  { path: "/contact", lastModified: "2026-11-17" },
  { path: "/office", lastModified: "2026-11-04" },
  { path: "/services", lastModified: "2026-11-17" },
  { path: "/customer-support", lastModified: "2026-10-20" },
  { path: "/pricing-transparency", lastModified: "2026-11-17" },
  { path: "/passport-renewal-guide", lastModified: "2026-11-04" },
  { path: "/visa-guide", lastModified: "2026-11-17" },
  { path: "/travel-insurance-guide", lastModified: "2026-11-17" },
  { path: "/cruise-holidays-guide", lastModified: "2026-11-17" },
  { path: "/holiday-packages-guide", lastModified: "2026-11-17" },
] as const;

const publicPaths = new Set<string>(PUBLIC_SEO_PAGES.map(page => page.path));

export function isPublicSeoPath(path: string) {
  return publicPaths.has(path);
}
