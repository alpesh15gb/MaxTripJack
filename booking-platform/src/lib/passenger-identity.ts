type Identity = { fN?: unknown; lN?: unknown; pt?: unknown };
function identity(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const person = value as Identity;
  if (typeof person.fN !== "string" || typeof person.lN !== "string" || typeof person.pt !== "string") return null;
  const name = (part: string) => part.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
  const first = name(person.fN), last = name(person.lN), type = person.pt.trim().toUpperCase();
  return first && last && ["ADULT", "CHILD", "INFANT"].includes(type) ? JSON.stringify([first, last, type]) : null;
}

/** Equal-length membership is insufficient: every original passenger is used once. */
export function passengerIdentitiesMatch(expected: unknown, supplied: unknown): boolean {
  if (!Array.isArray(expected) || !Array.isArray(supplied) || expected.length !== supplied.length || !expected.length) return false;
  const remaining = new Map<string, number>();
  for (const person of expected) {
    const key = identity(person); if (!key) return false;
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  for (const person of supplied) {
    const key = identity(person); if (!key || !remaining.get(key)) return false;
    remaining.set(key, remaining.get(key)! - 1);
  }
  return [...remaining.values()].every(count => count === 0);
}
