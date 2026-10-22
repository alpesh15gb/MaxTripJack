/** Display-only ordering. Never merge opaque supplier offers or mutate them. */
type EstimatedOffer = { customerEstimateMinor?: number | null; currency?: string };
export function comparableFareEstimate(offer: EstimatedOffer, expectedCurrency: string): number | null {
  if (offer.currency !== undefined && offer.currency !== expectedCurrency) return null;
  const amount = offer.customerEstimateMinor;
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
export function haveComparableCurrency(offers: readonly EstimatedOffer[], expectedCurrency: string): boolean {
  return Boolean(expectedCurrency) && offers.every(offer => offer.currency === undefined || offer.currency === expectedCurrency);
}
/** Callers must establish the response currency contract, not infer it from the
 * size of a number. A mixed/unknown explicit currency preserves supplier order. */
export function orderFareOffers<T extends EstimatedOffer>(offers: readonly T[], expectedCurrency: string): T[] {
  if (!haveComparableCurrency(offers, expectedCurrency)) return [...offers];
  return offers.map((offer, index) => ({offer, index, price: comparableFareEstimate(offer, expectedCurrency)}))
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.index - b.index)
    .map(({offer}) => offer);
}
