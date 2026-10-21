import 'server-only';
import { createHotelContentCache } from './hotel-content-cache';

// Fixed supplier host/path; no external image fetching, URL proxy or client-controlled endpoint.
// Optional property content has a short deadline independent of dynamic rate lookup.
export const hotelContentForSearch = createHotelContentCache(async hotelIds => {
  const key = process.env.TRIPJACK_HOTEL_API_KEY;
  if (!key) throw new Error('Hotel content unavailable.');
  const response = await fetch('https://apitest-hms.tripjack.com/hms/v3/content/fetch-hotel-content', {
    method: 'POST', headers: {apikey: key, 'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({hotelIds}), signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store',
  });
  if (!response.ok) throw new Error('Hotel content unavailable.');
  // Cap response bytes before JSON parsing; supplier content can include large galleries.
  const limit = 2 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('Hotel content unavailable.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Hotel content unavailable.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Hotel content unavailable.');
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (data?.status?.success !== true) throw new Error('Hotel content unavailable.');
  return data;
});
