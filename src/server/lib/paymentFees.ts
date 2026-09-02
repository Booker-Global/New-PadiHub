/**
 * Contribution processing-fee surcharge model.
 *
 * Stripe and Flutterwave both charge PadiHub a processing fee on every card
 * charge and a payout fee when moving a cycle's pot to that cycle's
 * recipient. Per the product owner's decision, BOTH fees are passed on to
 * contributing members as a visible surcharge added on top of their
 * contribution amount — never deducted from the group pot — so every
 * member in the rotation still receives their full cycle pot when it's
 * their turn. Subscription/verification charges are NOT surcharged this
 * way — those provider fees are absorbed by PadiHub.
 *
 * Fee structure (confirmed rates, not placeholders):
 *  - Stripe (UK, GBP): card fee 1.5% + £0.20 per contribution charge, plus a
 *    payout fee of 0.25% of the cycle's total pot + £0.20, split equally
 *    across that cycle's contributing members.
 *  - Flutterwave (Nigeria, NGN): transaction fee 2% + 7.5% VAT on that 2%
 *    (i.e. contribution × 0.02 × 1.075), plus a payout fee tiered by the
 *    cycle's total pot (₦10 under ₦5,000; ₦25 for ₦5,001–₦50,000; ₦50 for
 *    anything over ₦50,000) plus 7.5% VAT on the tiered fee, split equally
 *    across that cycle's contributing members. Unlike Stripe, Flutterwave's
 *    fee is absorbed (not surcharged) on subscription charges but always
 *    surcharged and itemised — VAT shown separately — on contributions.
 *
 * Every member's payout-fee share is rounded UP to the next whole penny/kobo
 * (never down) so PadiHub never under-recovers the payout fee: e.g. a
 * share of £0.323 or £0.327 both become £0.33. This applies regardless of
 * contribution frequency (daily/weekly/monthly) — the calculation only
 * depends on the cycle's total pot and the number of members contributing
 * to that cycle, both of which are known before any charge is attempted.
 *
 * All amounts here are in the smallest currency unit (pence for GBP, kobo
 * for NGN), matching the convention used throughout paymentController.ts.
 */
export type PaymentProviderName = 'stripe' | 'flutterwave';

/** Itemised breakdown of the surcharge added on top of a single contribution. */
export interface ContributionFeeBreakdown {
  /** Net card/transaction-processing fee (excludes VAT), smallest currency unit. */
  cardFee: number;
  /** VAT charged on the card/transaction fee. Always 0 for Stripe (no VAT component). */
  cardFeeVat: number;
  /** This member's share of the cycle's consolidated payout fee (excludes VAT), rounded up. */
  payoutFeeShare: number;
  /** VAT portion of this member's payout-fee share. Always 0 for Stripe. */
  payoutFeeShareVat: number;
  /** Sum of all four components above — the total surcharge added to the contribution. */
  totalFee: number;
}

export interface ContributionFeeParams {
  provider: PaymentProviderName;
  /** This member's contribution amount for the cycle, in smallest currency unit. */
  contributionAmount: number;
  /** The cycle's total pot (contribution amount × contributing member count), in smallest currency unit. */
  cyclePotAmount: number;
  /** Number of members contributing to this cycle — the consolidated payout fee is split across all of them. */
  contributingMemberCount: number;
}

const STRIPE_CARD_FEE_PERCENTAGE = 0.015;   // 1.5%
const STRIPE_CARD_FEE_FIXED_PENCE = 20;     // £0.20
const STRIPE_PAYOUT_FEE_PERCENTAGE = 0.0025; // 0.25%
const STRIPE_PAYOUT_FEE_FIXED_PENCE = 20;    // £0.20

const FLUTTERWAVE_TXN_FEE_PERCENTAGE = 0.02;  // 2%
const FLUTTERWAVE_VAT_RATE = 0.075;           // 7.5%
// Tiered payout fee (kobo), keyed by cycle pot thresholds in Naira. A cycle
// pot of exactly ₦5,000 is treated as the lower tier ("under ₦5,000"); the
// next tier explicitly starts at ₦5,001, per the product spec.
const FLUTTERWAVE_PAYOUT_FEE_TIER_LOW_KOBO = 1000;  // ₦10
const FLUTTERWAVE_PAYOUT_FEE_TIER_MID_KOBO = 2500;  // ₦25
const FLUTTERWAVE_PAYOUT_FEE_TIER_HIGH_KOBO = 5000; // ₦50 (cap)
const FLUTTERWAVE_PAYOUT_FEE_LOW_THRESHOLD_KOBO = 500000;   // ₦5,000
const FLUTTERWAVE_PAYOUT_FEE_MID_THRESHOLD_KOBO = 5000000;  // ₦50,000

function ceilToUnit(amount: number): number {
  return Math.ceil(amount - 1e-9); // guard against floating-point noise just under an integer
}

function flutterwaveTieredPayoutFee(cyclePotAmountKobo: number): number {
  if (cyclePotAmountKobo <= FLUTTERWAVE_PAYOUT_FEE_LOW_THRESHOLD_KOBO) return FLUTTERWAVE_PAYOUT_FEE_TIER_LOW_KOBO;
  if (cyclePotAmountKobo <= FLUTTERWAVE_PAYOUT_FEE_MID_THRESHOLD_KOBO) return FLUTTERWAVE_PAYOUT_FEE_TIER_MID_KOBO;
  return FLUTTERWAVE_PAYOUT_FEE_TIER_HIGH_KOBO;
}

/**
 * Calculate the full itemised fee surcharge for a single member's
 * contribution charge. Safe to call for any contribution frequency — only
 * the cycle pot amount and contributing member count matter.
 */
export function calculateContributionFees(params: ContributionFeeParams): ContributionFeeBreakdown {
  const { provider, contributionAmount, cyclePotAmount, contributingMemberCount } = params;
  if (contributingMemberCount <= 0) {
    throw new Error('contributingMemberCount must be at least 1 to split the payout fee.');
  }

  if (provider === 'stripe') {
    const cardFee = Math.round(contributionAmount * STRIPE_CARD_FEE_PERCENTAGE) + STRIPE_CARD_FEE_FIXED_PENCE;

    // Payout fee is computed on the exact (unrounded) cycle-pot fee, then
    // divided across members and rounded up — matches the worked example:
    // £10 contribution, 5-person group → (0.25% × £50 + £0.20) / 5 = 6.5p → £0.07.
    const payoutFeeTotalExact = cyclePotAmount * STRIPE_PAYOUT_FEE_PERCENTAGE + STRIPE_PAYOUT_FEE_FIXED_PENCE;
    const payoutFeeShare = ceilToUnit(payoutFeeTotalExact / contributingMemberCount);

    return {
      cardFee,
      cardFeeVat: 0,
      payoutFeeShare,
      payoutFeeShareVat: 0,
      totalFee: cardFee + payoutFeeShare,
    };
  }

  // Flutterwave — every fee component carries 7.5% VAT, itemised separately.
  const txnFeeNet = Math.round(contributionAmount * FLUTTERWAVE_TXN_FEE_PERCENTAGE);
  const txnFeeVat = Math.round(txnFeeNet * FLUTTERWAVE_VAT_RATE);

  const tieredPayoutFeeNet = flutterwaveTieredPayoutFee(cyclePotAmount);
  const tieredPayoutFeeVat = Math.round(tieredPayoutFeeNet * FLUTTERWAVE_VAT_RATE);
  const tieredPayoutFeeGross = tieredPayoutFeeNet + tieredPayoutFeeVat;

  // Split the consolidated (fee + VAT) payout charge equally, rounded up per
  // member — identical rule to Stripe's payout-fee-share rounding.
  const payoutFeeShareGross = ceilToUnit(tieredPayoutFeeGross / contributingMemberCount);
  // Break the per-member gross share back into net/VAT components
  // proportionally, purely for itemised display — the two parts always sum
  // back to payoutFeeShareGross exactly.
  const payoutFeeShareVat = Math.round(payoutFeeShareGross * (tieredPayoutFeeVat / tieredPayoutFeeGross));
  const payoutFeeShare = payoutFeeShareGross - payoutFeeShareVat;

  return {
    cardFee: txnFeeNet,
    cardFeeVat: txnFeeVat,
    payoutFeeShare,
    payoutFeeShareVat,
    totalFee: txnFeeNet + txnFeeVat + payoutFeeShare + payoutFeeShareVat,
  };
}

/** Human-readable summary of a provider's fee structure, for T&C/disclosure copy. */
export function describeProcessingFee(provider: PaymentProviderName): string {
  if (provider === 'stripe') {
    return '1.5% + £0.20 card fee per contribution, plus an equal share of a 0.25% + £0.20 payout fee on the cycle\'s total pot';
  }
  return '2% + 7.5% VAT transaction fee per contribution, plus an equal share of a tiered payout fee (₦10/₦25/₦50 depending on the cycle\'s total pot) + 7.5% VAT';
}
