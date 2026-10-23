import {supplierInstant} from './supplier-time';

/** Format the supplier's local calendar date, never the viewer/server timezone.
 * UTC is used only to validate/render the calendar fields, not to infer an
 * airport offset or elapsed travel time. Malformed dates fail closed. */
function localDateParts(value: unknown): {date: number; time?: string} | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(value);
  if (!match) return null;
  const date = supplierInstant(`${match[1]}T00:00:00Z`);
  const validTime = !match[2] || supplierInstant(match[3] ? value : `${value}Z`) !== null;
  return date !== null && validTime ? {date, time: match[2]} : null;
}
const calendar = new Intl.DateTimeFormat('en-GB', {timeZone:'UTC', day:'numeric', month:'short', year:'numeric'});
export function travelDateLabel(value: unknown): string {
  const parts = localDateParts(value);
  return parts ? calendar.format(parts.date) : 'Date unavailable';
}
export function travelTimeLabel(value: unknown): string {
  return localDateParts(value)?.time ?? 'Time unavailable';
}
export function travelDateTimeLabel(value: unknown): string {
  const parts = localDateParts(value);
  return parts?.time ? `${calendar.format(parts.date)} · ${parts.time}` : 'Date and time unavailable';
}
