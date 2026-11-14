export type BookingSessionBoundary = { userId: string | null; revision: number };

/** A guest may bring public search choices into their newly verified account.
 * Signing out or changing an existing account always discards private drafts. */
export function nextBookingSessionBoundary(previous: BookingSessionBoundary | null, userId: string | null): BookingSessionBoundary {
  if (!previous) return { userId, revision: 0 };
  if (previous.userId === userId) return previous;
  return { userId, revision: previous.revision + (previous.userId === null && userId !== null ? 0 : 1) };
}
