// Mirror of the public v1 parser in booking-platform/src/lib/service-conditions.ts.
// Keep parity through tests/service-conditions.test.mjs; supplier raw review is never accepted.
export type ConditionLine = { label: string; text: string };
export type ServiceDisclosure = { version: 1; lines: ConditionLine[]; blocked: boolean };
const labels = ['Supplier quote validity (seconds)', 'Service restriction', 'Supplier notice'];
const blocked = (): ServiceDisclosure => ({ version: 1, lines: [], blocked: true });
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 2000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}
/** Strict public wire contract. Reject old/raw, partial or future schemas, including
 * blocked responses with data attached. Never display a partially understood rule. */
export function serviceConditions(value: unknown): ServiceDisclosure {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'blocked,lines,version' || value.version !== 1 || typeof value.blocked !== 'boolean' || !Array.isArray(value.lines) || value.lines.length > 50) return blocked();
  if (value.blocked) return blocked();
  if (value.lines.some(line => !record(line) || Object.keys(line).sort().join(',') !== 'label,text' || (typeof line.label !== 'string' || !labels.includes(line.label)) || !text(line.text))) return blocked();
  return { version: 1, blocked: false, lines: value.lines.map(line => ({ label: line.label as string, text: line.text as string })) };
}
