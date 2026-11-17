/** Only clean catalogue document routes are potential public SEO pages.
 * Existence, supplier environment and content quality are checked by each page.
 * Search, prices, dates, account data and API routes never enter this allowlist.
 */
export function hotelIdFromSlug(slug: string): string | undefined {
  if (slug.length > 240) return undefined;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*-([1-9]\d{0,29})$/i.exec(slug)?.[1];
}

export function isHotelPublicPath(path: string): boolean {
  if (path === '/hotels') return true;
  if (/^\/hotels\/page\/[1-9]\d{0,6}$/.test(path)) return true;
  const slug = /^\/hotels\/([^/]+)$/.exec(path)?.[1];
  return Boolean(slug && slug === slug.toLowerCase() && hotelIdFromSlug(slug));
}

export function hotelDirectoryPath(page = 1): string {
  if (!Number.isSafeInteger(page) || page < 1 || page > 9_999_999) throw new Error('Invalid hotel directory page.');
  return page === 1 ? '/hotels' : `/hotels/page/${page}`;
}

export function hotelPropertyPath(slug: string): string {
  if (slug !== slug.toLowerCase() || !hotelIdFromSlug(slug)) throw new Error('Invalid hotel catalogue slug.');
  return `/hotels/${slug}`;
}
