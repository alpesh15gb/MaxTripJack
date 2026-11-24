import {hotelObject} from './hotel-presentation';
import {minor} from './providers/contracts';

export type BookingPriceBreakdown = {
  baseMinor: number;
  taxMinor: number;
  managementFeeMinor: number;
  managementTaxMinor: number;
};

/** Reconcile the supplier's disclosed components before publishing any split.
 * The customer base includes any markup. Supplier costs stay server-side. */
export function bookingPriceBreakdown(product: string, review: unknown, customerMinor: number): BookingPriceBreakdown | null {
  if (!Number.isSafeInteger(customerMinor) || customerMinor <= 0) return null;
  const reviewed = hotelObject(review);
  const flightPrice = hotelObject(reviewed.totalPriceInfo);
  const hotel = product === 'HOTEL';
  const source = hotel
    ? hotelObject(hotelObject(reviewed.option).pricing)
    : hotelObject(hotelObject(flightPrice.totalFareDetail).fC ?? flightPrice.fc);
  if (hotel && source.currency !== 'INR') return null;
  try {
    const total = minor(hotel ? source.totalPrice : source.TF);
    const base = minor(hotel ? source.basePrice : source.BF);
    const taxMinor = minor(hotel ? source.taxes : source.TAF);
    const managementFeeMinor = hotel ? minor(source.mf ?? 0) : 0;
    const managementTaxMinor = hotel ? minor(source.mft ?? 0) : 0;
    const disclosedCharges = taxMinor + managementFeeMinor + managementTaxMinor;
    if (total <= 0 || base + disclosedCharges !== total || customerMinor < total) return null;
    return {baseMinor:customerMinor-disclosedCharges,taxMinor,managementFeeMinor,managementTaxMinor};
  } catch {
    return null;
  }
}

export function bookingPriceLines(product: string, value: BookingPriceBreakdown, includesExtras = false): [string, number][] {
  const rows: [string, number][] = [
    [product === 'HOTEL' ? 'Room rate' : includesExtras ? 'Base fare and selected extras' : 'Base fare', value.baseMinor],
    ['Supplier taxes and fees', value.taxMinor],
  ];
  if (value.managementFeeMinor) rows.push(['Hotel management fee',value.managementFeeMinor]);
  if (value.managementTaxMinor) rows.push(['Management fee tax',value.managementTaxMinor]);
  return rows;
}

export function bookingReceiptPrice(
  product: string, review: unknown, totalMinor: unknown, promo: unknown, includesExtras: boolean,
): [string, number][] {
  const total = Number(totalMinor);
  const discount = hotelObject(promo).discountMinor;
  const discountMinor = typeof discount === 'number' && Number.isSafeInteger(discount) && discount > 0 ? discount : 0;
  const breakdown = bookingPriceBreakdown(product,review,total+discountMinor);
  if (!breakdown) return [];
  const lines = bookingPriceLines(product,breakdown,includesExtras);
  if (discountMinor) lines.push(['Promo discount',-discountMinor]);
  return lines;
}
