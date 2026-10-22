/** Transactional INR presentation only. Amounts remain integer paise; this
 * formatter never calculates prices or changes the supplier/payment payload. */
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export function displayMoney(minor: number): string {
  return Number.isSafeInteger(minor) ? inr.format(minor / 100) : 'Price unavailable';
}
