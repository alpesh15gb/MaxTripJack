import 'server-only';
import { hotelRoomIdentity } from './hotel-room-identity';
import { HttpError } from './http';

// TripJack Review requires the selected option and hash from the SAME pricing
// response. A later pricing response may issue entirely different option IDs.
// Keep this context on the owned search row, never in a browser-supplied token.
// Contract: https://tripjack.com/page/api-doc (Hotel API v3, Review request).
export const HOTEL_REVIEW_SNAPSHOT_KEY = '_maxtravelHotelReview';
export const HOTEL_REVIEW_SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const MAX_OPTIONS = 2000;
const MAX_OPTION_ID_LENGTH = 200;
const MAX_REVIEW_HASH_LENGTH = 8192;

type HotelReviewSnapshot = {
  version: 1;
  fetchedAt: number;
  reviewHash: string;
  options: { optionId: string; available: boolean; roomIdentity: string | null }[];
};
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const identifier = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);

export const SAVE_HOTEL_REVIEW_SNAPSHOT_SQL = `UPDATE supplier_searches
SET results=jsonb_set(results,'{_maxtravelHotelReview}',
  (CASE WHEN jsonb_typeof(results->'_maxtravelHotelReview')='object'
    THEN results->'_maxtravelHotelReview' ELSE '{}'::jsonb END)
  || jsonb_build_object($4::text,$5::jsonb),true)
WHERE id=$1 AND user_id=$2 AND company_id IS NOT DISTINCT FROM $3::uuid
  AND product='HOTEL' AND service_kind IS NULL AND expires_at>now()
  AND criteria->'hotelIds' ? $4::text`;

export function createHotelReviewSnapshot(source: unknown, fetchedAt = Date.now()): HotelReviewSnapshot {
  const data = object(source);
  if (!identifier(data.reviewHash, MAX_REVIEW_HASH_LENGTH) || !Array.isArray(data.options) || data.options.length > MAX_OPTIONS || !Number.isFinite(fetchedAt) || fetchedAt <= 0) {
    throw new HttpError(502, 'Room availability could not be verified. Refresh room options to try again.');
  }
  const seen = new Set<string>();
  const options = data.options.map(raw => {
    const option = object(raw);
    if (!identifier(option.optionId, MAX_OPTION_ID_LENGTH) || seen.has(option.optionId)) {
      throw new HttpError(502, 'Room availability could not be verified. Refresh room options to try again.');
    }
    seen.add(option.optionId);
    return { optionId: option.optionId, available: object(option.inventory).available !== false, roomIdentity: hotelRoomIdentity(option) };
  });
  return { version: 1, fetchedAt, reviewHash: data.reviewHash, options };
}

export function hotelReviewContext(results: unknown, hid: string, optionId: string, now = Date.now()) {
  const snapshot = object(object(object(results)[HOTEL_REVIEW_SNAPSHOT_KEY])[hid]);
  const options = snapshot.options;
  if (snapshot.version !== 1 || typeof snapshot.fetchedAt !== 'number' || !Number.isFinite(snapshot.fetchedAt) || snapshot.fetchedAt <= 0 || !Number.isFinite(now) || snapshot.fetchedAt > now || now - snapshot.fetchedAt >= HOTEL_REVIEW_SNAPSHOT_TTL_MS ||
    !identifier(snapshot.reviewHash, MAX_REVIEW_HASH_LENGTH) || !Array.isArray(options) || options.length > MAX_OPTIONS) {
    throw new HttpError(409, 'Your room options changed or expired. Go back to stays and reopen this hotel to choose a room again.');
  }
  const selected = options.map(object).find(option => identifier(option.optionId, MAX_OPTION_ID_LENGTH) && option.optionId === optionId && option.available === true);
  if (!selected) {
    throw new HttpError(409, 'Your room options changed or expired. Go back to stays and reopen this hotel to choose a room again.');
  }
  const roomIdentity = typeof selected.roomIdentity === 'string' && /^[0-9a-f]{64}$/.test(selected.roomIdentity) ? selected.roomIdentity : null;
  return { reviewHash: snapshot.reviewHash, roomIdentity };
}
