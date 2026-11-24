/** Transactional INR presentation only. Amounts remain integer paise; this
 * formatter never calculates prices or changes the supplier/payment payload. */
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
// Whole-rupee amounts read cleaner without ".00" (as on the major OTAs); any
// paise are still shown exactly.
const wholeInr = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
export function displayMoney(minor: number, alwaysShowPaise = false): string {
  if (!Number.isSafeInteger(minor)) return 'Price unavailable';
  return !alwaysShowPaise && minor % 100 === 0 ? wholeInr.format(minor / 100) : inr.format(minor / 100);
}
