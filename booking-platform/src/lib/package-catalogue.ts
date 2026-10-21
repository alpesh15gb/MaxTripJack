import { currentPackage, currentPackageSummary, packageSlug, type TravelPackageSummary } from './travel-packages';
export class PackageCatalogueError extends Error {
  constructor(public readonly status: 404 | 503) { super(status === 404 ? 'This package is not available.' : 'Package information is temporarily unavailable. Please try again.'); }
}
const CRM = 'https://crm.maxtravel.in/api/public/travel-packages';
const MAX_BYTES = 8 * 1024 * 1024;
/** Fixed public origin only. No credentials, redirects, arbitrary URL proxy or booking calls. */
export async function fetchPackageCatalogue(slug?: string, fetcher: typeof fetch = fetch): Promise<{packages:TravelPackageSummary[];truncated:boolean;unavailableCount:number}> {
  if (slug !== undefined && !packageSlug.safeParse(slug).success) throw new PackageCatalogueError(404);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(CRM + (slug ? `/${slug}` : ''), {signal:controller.signal,redirect:'error',cache:'no-store',headers:{Accept:'application/json'}});
    const rejectResponse = async (error:Error):Promise<never> => { await response.body?.cancel().catch(() => {}); throw error; };
    if (response.status === 404 && slug) return await rejectResponse(new PackageCatalogueError(404));
    if (!response.ok || !response.body || Number(response.headers.get('content-length') || 0) > MAX_BYTES) return await rejectResponse(new Error('upstream'));
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > MAX_BYTES) throw new Error('body limit'); chunks.push(part.value); } }
    finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
    const joined = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    const data = JSON.parse(new TextDecoder().decode(joined));
    const items = slug ? [data.package] : data.packages;
    if (!Array.isArray(items) || items.length > 250) throw new Error('shape');
    const packages = items.map(item => slug ? currentPackage(item) : currentPackageSummary(item));
    if (slug && packages[0]?.slug !== slug || new Set(packages.map(p => p.slug)).size !== packages.length) throw new Error('identity');
    const truncated = slug ? false : data.truncated; const unavailableCount = slug ? 0 : data.unavailableCount;
    if (typeof truncated !== 'boolean' || !Number.isSafeInteger(unavailableCount) || unavailableCount < 0) throw new Error('flags');
    return {packages,truncated,unavailableCount};
  } catch (error) { if (error instanceof PackageCatalogueError) throw error; throw new PackageCatalogueError(503); }
  finally { clearTimeout(timer); controller.abort(); }
}
