/**
 * Authored public pages only. Add a path only alongside its reviewed content.
 * Update a date when that page changes meaningfully, not on every request/build.
 * Search results, user data and supplier quotes must never enter this registry.
 */
export const PUBLIC_SEO_PAGES = [
  { path: "/", lastModified: "2026-10-20" },
  { path: "/flights", lastModified: "2026-10-20" },
  { path: "/domestic-flights", lastModified: "2026-10-20" },
  { path: "/international-flights", lastModified: "2026-10-20" },
  { path: "/cheap-flight-tickets", lastModified: "2026-10-20" },
  { path: "/last-minute-flights", lastModified: "2026-10-20" },
  { path: "/flight-booking-guide", lastModified: "2026-10-20" },
  { path: "/flights/hyderabad-to-delhi", lastModified: "2026-10-20" },
  { path: "/flights/delhi-to-mumbai", lastModified: "2026-10-20" },
  { path: "/flights/hyderabad-to-dubai", lastModified: "2026-10-20" },
  { path: "/flights/mumbai-to-goa", lastModified: "2026-10-20" },
  { path: "/flights/delhi-to-bengaluru", lastModified: "2026-10-20" },
  { path: "/about", lastModified: "2026-10-20" },
  { path: "/contact", lastModified: "2026-10-20" },
  { path: "/office", lastModified: "2026-10-20" },
  { path: "/services", lastModified: "2026-10-20" },
  { path: "/customer-support", lastModified: "2026-10-20" },
  { path: "/pricing-transparency", lastModified: "2026-10-20" },
] as const;

const publicPaths = new Set<string>(PUBLIC_SEO_PAGES.map(page => page.path));

export function isPublicSeoPath(path: string) {
  return publicPaths.has(path);
}
