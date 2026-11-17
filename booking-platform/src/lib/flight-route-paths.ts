/** Edge-safe candidate paths only. Database provenance and freshness decide indexing. */
export function isFlightRouteSeoPath(path: string) {
  return /^\/flights\/routes(?:\/page\/[1-9]\d{0,5})?$/.test(path)
    || /^\/flights\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-z]{3}-to-[a-z0-9]+(?:-[a-z0-9]+)*-[a-z]{3}$/.test(path);
}

export const FLIGHT_ROUTE_SITEMAP_SIZE = 10000;
