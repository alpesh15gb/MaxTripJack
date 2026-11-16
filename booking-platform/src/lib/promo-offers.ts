import { promoDiscount, type PromoRule } from './promo-calculation';

export type DiscoverablePromoRule = PromoRule & { code: string; discoverable: boolean };
export type CheckoutPromoOffer = { code: string; discountMinor: number; minimumMinor: number; expiresAt: string };

export function checkoutPromoOffers(rules: readonly DiscoverablePromoRule[], product: string, originalMinor: number, supplierMinor: number, now = Date.now()): CheckoutPromoOffer[] {
  const offers: CheckoutPromoOffer[] = [];
  for (const rule of rules) {
    if (rule.discoverable !== true) continue;
    try {
      const discountMinor = promoDiscount(rule, product, originalMinor, supplierMinor, now);
      offers.push({ code: rule.code, discountMinor, minimumMinor: Number(rule.minimum_minor), expiresAt: new Date(rule.expires_at).toISOString() });
    } catch {
      // Discovery omits promotions that cannot currently change the quote.
    }
  }
  return offers.sort((a, b) => b.discountMinor - a.discountMinor || a.expiresAt.localeCompare(b.expiresAt) || a.code.localeCompare(b.code)).slice(0, 8);
}
