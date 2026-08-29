/**
 * Provisional payment-processing fee model.
 *
 * Stripe and Flutterwave both charge PadiHub a processing fee on every card
 * charge; per the product owner's decision, that fee is passed on to the
 * contributing member (added on top of their contribution amount) rather
 * than being deducted from the group pot — so every member in the rotation
 * still receives their full contribution amount when it's their turn.
 *
 * The exact rates below are PLACEHOLDERS pending final confirmed pricing
 * from Stripe and Flutterwave (real rates depend on card type, volume, and
 * the specific merchant agreement, which haven't been finalised yet). They
 * are deliberately simple and documented as provisional — see the
 * processing-fee disclosure in src/pages/terms.tsx, which members must
 * accept (payment_terms_accepted_at) before a payment method is saved.
 */
export type PaymentProviderName = 'stripe' | 'flutterwave';

interface FeeRate {
  /** e.g. 0.015 = 1.5% */
  percentage: number;
  /** Fixed fee in the smallest currency unit (pence for GBP, kobo for NGN). */
  fixedMinorUnits: number;
  /** Optional maximum fee cap, in the smallest currency unit. */
  capMinorUnits?: number;
}

// Indicative UK domestic card rate (Stripe) and Nigerian local card rate
// (Flutterwave), rounded to figures easy to disclose to members. Update once
// the real negotiated rates are confirmed.
const FEE_RATES: Record<PaymentProviderName, FeeRate> = {
  stripe:      { percentage: 0.015, fixedMinorUnits: 20 },                    // 1.5% + £0.20
  flutterwave: { percentage: 0.014, fixedMinorUnits: 0, capMinorUnits: 200000 }, // 1.4%, capped at ₦2,000
};

/**
 * Calculate the processing fee for a charge, in the same smallest-currency
 * unit as `amountInSmallestUnit` (pence/kobo). Always a non-negative integer.
 */
export function calculateProcessingFee(provider: PaymentProviderName, amountInSmallestUnit: number): number {
  const rate = FEE_RATES[provider];
  let fee = Math.round(amountInSmallestUnit * rate.percentage) + rate.fixedMinorUnits;
  if (rate.capMinorUnits !== undefined) fee = Math.min(fee, rate.capMinorUnits);
  return Math.max(0, fee);
}

/** Human-readable summary of a provider's fee structure, for T&C/disclosure copy. */
export function describeProcessingFee(provider: PaymentProviderName): string {
  const rate = FEE_RATES[provider];
  const pct = `${(rate.percentage * 100).toFixed(1)}%`;
  if (provider === 'stripe') {
    return `${pct} + £${(rate.fixedMinorUnits / 100).toFixed(2)} per charge`;
  }
  const cap = rate.capMinorUnits !== undefined ? `, capped at ₦${(rate.capMinorUnits / 100).toFixed(0)}` : '';
  return `${pct} per charge${cap}`;
}
