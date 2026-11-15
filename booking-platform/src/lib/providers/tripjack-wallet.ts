type Fields = Record<string, unknown>;
const record = (value: unknown): Fields | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Fields : null;

// The deployed UAT response uses user.bs; the published User Detail contract
// also documents root balance fields. An explicit nested response must stand
// on its own: never rescue a malformed nested wallet with root/credit totals.
function accountFields(source: unknown): { user: Fields; balances: Fields } | null {
  const root = record(source);
  if (!root) return null;
  if (Object.hasOwn(root, 'user')) {
    const user = record(root.user), balances = record(user?.bs);
    return user && balances ? { user, balances } : null;
  }
  return { user: root, balances: root };
}

/** Convert a monetary primitive without JS's null/boolean/array coercion.
 * Truncate positive sub-paise funds; round negative values down. Available
 * funds must never be rounded UP before deciding whether checkout can start.
 */
export function tripjackMoney(value: unknown): { amount: number; minor: number } | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (text.length > 100 || !/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount)) return null;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const magnitude = BigInt(whole) * BigInt(100) + BigInt((fraction + '00').slice(0, 2));
  const minor = negative ? -magnitude - (/[1-9]/.test(fraction.slice(2)) ? BigInt(1) : BigInt(0)) : magnitude;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return { amount, minor: Number(minor) };
}

export function tripjackWallet(source: unknown) {
  const fields = accountFields(source);
  return fields ? tripjackMoney(fields.balances.walletBalance) : null;
}

export function tripjackWalletCovers(source: unknown, requiredMinor: unknown): boolean {
  if (typeof requiredMinor !== 'number' && (typeof requiredMinor !== 'string' || !/^\d+$/.test(requiredMinor))) return false;
  const required = Number(requiredMinor);
  if (!Number.isSafeInteger(required) || required < 0) return false;
  const wallet = tripjackWallet(source);
  return wallet !== null && wallet.minor >= required;
}

/** Finance UI projection. Missing optional balances stay unavailable. */
export function tripjackAccountBalances(source: unknown) {
  const fields = accountFields(source), wallet = tripjackWallet(source);
  if (!fields || !wallet || typeof fields.user.userId !== 'string' || !fields.user.userId.trim()) return null;
  const optional = (key: string) => tripjackMoney(fields.balances[key])?.amount;
  return {
    userId: fields.user.userId, walletBalance: wallet.amount,
    creditBalance: optional('creditBalance'), totalBalance: optional('totalBalance'),
    totalOutStanding: optional('totalOutStanding'),
  };
}
