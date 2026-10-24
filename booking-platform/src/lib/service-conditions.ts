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
/** Service consent only, not the initial-booking requirements contract.
 * Evidence: flight-services-flow.mts st; trips-experience.spec.ts restriction and
 * text alerts. Metadata (travellers, supplier accounting, IDs) stays server-side.
 * Unknown condition keys are material until proved otherwise: block, don't omit.
 */
export function serviceDisclosure(raw: unknown): ServiceDisclosure {
  if (!record(raw) || !record(raw.conditions)) return blocked();
  const conditions = raw.conditions;
  if (Object.keys(conditions).some(key => !['st', 'restriction'].includes(key))) return blocked();
  const lines: ConditionLine[] = [];
  if ('st' in conditions) {
    if (typeof conditions.st !== 'number' || !Number.isSafeInteger(conditions.st) || conditions.st < 30) return blocked();
    lines.push({ label: labels[0], text: String(conditions.st) });
  }
  if ('restriction' in conditions) {
    if (!text(conditions.restriction)) return blocked();
    lines.push({ label: labels[1], text: conditions.restriction });
  }
  if ('alerts' in raw) {
    const alerts = Array.isArray(raw.alerts) ? raw.alerts : [raw.alerts];
    if (alerts.length > 20 || !alerts.every(text)) return blocked();
    for (const alert of alerts) lines.push({ label: labels[2], text: alert });
  }
  return { version: 1, lines, blocked: false };
}
