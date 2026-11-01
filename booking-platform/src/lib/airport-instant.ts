import zones from "@/data/airport-timezones.json";
import { supplierInstant } from "./supplier-time";

/** Convert airport-local supplier times with ICU's date-specific IANA rules.
 * Never append Z to a naive timestamp. Ambiguous DST folds/gaps fail closed. */
export function airportInstant(value: unknown, airportCode: string, country?: string): string | null {
  const explicit = supplierInstant(value);
  if (explicit !== null) return new Date(explicit).toISOString().replace(".000Z", "Z");
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null;
  const wall = supplierInstant(value + "Z");
  if (wall === null) return null;
  const zone = (zones as Record<string, string>)[airportCode] ?? (country === "IN" ? "Asia/Kolkata" : undefined);
  if (!zone) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const local = (instant: number) => {
      const p = Object.fromEntries(formatter.formatToParts(instant).map(x => [x.type, x.value]));
      return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    };
    const offsets = new Set<number>();
    for (let hours = -36; hours <= 36; hours += 6) {
      const instant = wall + hours * 3600000;
      offsets.add(local(instant) - instant);
    }
    const candidates = [...offsets].map(offset => wall - offset).filter(instant => local(instant) === wall);
    return candidates.length === 1 ? new Date(candidates[0]).toISOString().replace(".000Z", "Z") : null;
  } catch { return null; }
}
