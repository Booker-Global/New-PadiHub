import { describe, it, expect } from 'vitest';
import { calculateContributionFees } from '../lib/paymentFees';

describe('calculateContributionFees', () => {
  describe('stripe', () => {
    it('matches the worked example: £10 contribution, 5-person group', () => {
      // £10 contribution × 5 members = £50 cycle pot.
      const result = calculateContributionFees({
        provider: 'stripe',
        contributionAmount: 1000, // £10.00 in pence
        cyclePotAmount: 5000,     // £50.00 in pence
        contributingMemberCount: 5,
      });

      // 1.5% × £10 + £0.20 = £0.35
      expect(result.cardFee).toBe(35);
      expect(result.cardFeeVat).toBe(0);
      // (0.25% × £50 + £0.20) / 5 = 32.5p / 5 = 6.5p → rounded up to £0.07
      expect(result.payoutFeeShare).toBe(7);
      expect(result.payoutFeeShareVat).toBe(0);
      // £0.35 + £0.07 = £0.42 surcharge → £10.42 total
      expect(result.totalFee).toBe(42);
    });

    it('rounds a payout-fee share up to the next penny (e.g. 32.3p -> 33p)', () => {
      // Construct a cycle pot/member-count combination whose per-member
      // payout-fee share lands on a fractional penny, mirroring the spec's
      // examples of £0.323 -> £0.33 and £0.327 -> £0.33.
      const result = calculateContributionFees({
        provider: 'stripe',
        contributionAmount: 100000,
        cyclePotAmount: 1292000, // (0.25% * 1292000 + 20) = 3250, /100 members = 32.5
        contributingMemberCount: 100,
      });
      expect(result.payoutFeeShare).toBe(33);
    });

    it('never divides the payout fee by zero contributing members', () => {
      expect(() => calculateContributionFees({
        provider: 'stripe',
        contributionAmount: 1000,
        cyclePotAmount: 1000,
        contributingMemberCount: 0,
      })).toThrow();
    });
  });

  describe('flutterwave', () => {
    it('applies 2% + 7.5% VAT transaction fee and itemises the VAT separately', () => {
      const result = calculateContributionFees({
        provider: 'flutterwave',
        contributionAmount: 1000000, // ₦10,000 in kobo
        cyclePotAmount: 5000000,     // ₦50,000 in kobo — mid tier
        contributingMemberCount: 5,
      });

      // 2% of ₦10,000 = ₦200 net; 7.5% VAT on that = ₦15
      expect(result.cardFee).toBe(20000);
      expect(result.cardFeeVat).toBe(1500);
    });

    it('tiers the payout fee by cycle pot and adds 7.5% VAT before splitting', () => {
      // Cycle pot of ₦4,000 (under ₦5,000) -> ₦10 tier
      const low = calculateContributionFees({
        provider: 'flutterwave',
        contributionAmount: 400000,
        cyclePotAmount: 400000,
        contributingMemberCount: 1,
      });
      // ₦10 net + 7.5% VAT (₦0.75) = ₦10.75 for the sole contributing member
      expect(low.payoutFeeShare + low.payoutFeeShareVat).toBe(1075);

      // Cycle pot of ₦60,000 (over ₦50,000) -> ₦50 tier
      const high = calculateContributionFees({
        provider: 'flutterwave',
        contributionAmount: 6000000,
        cyclePotAmount: 6000000,
        contributingMemberCount: 1,
      });
      // ₦50 net + 7.5% VAT (₦3.75) = ₦53.75 for the sole contributing member
      expect(high.payoutFeeShare + high.payoutFeeShareVat).toBe(5375);
    });
  });
});
