export type ConditionLine = { label: string; text: string };
/** Only the two customer-condition fields returned by service-review are displayed. */
export function serviceConditions(review: unknown): { lines: ConditionLine[]; blocked: boolean } {
  const lines: ConditionLine[] = [];
  let blocked = false;
  const sensitive = /password|secret|token|api.?key|authorization|passport|pan(?:number|card)?$|email|phone|mobile|cardnumber|cvv|travell?er|passenger|address|dateofbirth|^dob$/i;
  function walk(value: unknown, label: string, depth: number) {
    if (depth > 8 || lines.length >= 150) { blocked = true; return; }
    if (value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (typeof value === 'number' && !Number.isFinite(value)) { blocked = true; return; }
      if (typeof value === 'string' && (value.length > 10000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))) { blocked = true; return; }
      lines.push({ label, text: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value) });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${label} · item ${index + 1}`, depth + 1));
    } else if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (sensitive.test(key)) { blocked = true; continue; }
        const field = key === 'st' && label === 'Conditions' ? 'Supplier quote validity (seconds)' : `Supplier field “${key}”`;
        walk(item, `${label} · ${field}`, depth + 1);
      }
    } else blocked = true;
  }
  if (review !== null && typeof review === 'object' && !Array.isArray(review)) {
    const value = review as Record<string, unknown>;
    walk(value.conditions, 'Conditions', 0);
    walk(value.alerts, 'Supplier notice', 0);
    // Unexpected fields may contain additional terms. Never silently accept them.
    if (Object.keys(value).some(key => !['conditions', 'alerts'].includes(key))) blocked = true;
  } else blocked = true;
  return { lines, blocked };
}
