import { createHash } from 'node:crypto';
import { hotelObject } from './hotel-presentation';

function identityText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.length > maxLength || /[\x00-\x1f\x7f]/.test(value)) return null;
  return value.trim().normalize('NFC') || null;
}

function roomCount(value: unknown, min: number, max: number): number | null {
  const count = typeof value === 'string' && /^[0-4]$/.test(value) ? Number(value) : value;
  return typeof count === 'number' && Number.isInteger(count) && count >= min && count <= max ? count : null;
}

/** Review issues a fresh option ID. Bind it to the ordered room and meal
 * selection using the stable fields shared by Pricing and Review. */
export function hotelRoomIdentity(value: unknown): string | null {
  const { roomInfo, optionType, mealBasis } = hotelObject(value);
  const type = identityText(optionType, 100);
  const meal = identityText(mealBasis, 100);
  if (!type || !meal || !Array.isArray(roomInfo) || roomInfo.length < 1 || roomInfo.length > 4) return null;
  const rooms = [];
  for (const entry of roomInfo) {
    const { id, name, adults, children } = hotelObject(entry);
    const roomId = typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? String(id) : identityText(id, 200);
    const roomName = identityText(name, 400);
    const adultCount = roomCount(adults, 1, 4);
    const childCount = roomCount(children, 0, 3);
    if ((id != null && !roomId) || (name != null && !roomName) ||
        (adults != null && adultCount === null) || (children != null && childCount === null) ||
        (!roomId && (!roomName || adultCount === null))) return null;
    rooms.push({ roomId, roomName, adults: adultCount, children: childCount });
  }
  return createHash('sha256').update(JSON.stringify({ type, meal, rooms })).digest('hex');
}
