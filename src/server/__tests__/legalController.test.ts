import { describe, it } from 'vitest';

describe('legalController', () => {
  describe('GET /api/legal/terms', () => {
    it('should return sections array with at least 4 items', async () => {
      // TODO: call handler, assert sections.length >= 4
    });
    it('should include Identity & Bank Account Verification section', async () => {
      // TODO: assert section with title "Identity & Bank Account Verification" present
    });
    it('should include Identity Verification Fee (UK Users) section mentioning the first-50-free threshold and £1 fee', async () => {
      // TODO: assert section content contains "50" and "£1"
    });
    it('should include Bank Account Validation (Nigerian Users) section stating no charge', async () => {
      // TODO: assert section content contains "no additional cost"
    });
    it('should include Subscription Fees section with £4.99 and ₦5,000', async () => {
      // TODO: assert section content contains "£4.99" and "₦5,000"
    });
    it('should include Payout Timing section mentioning the 7–14 day first-payout delay', async () => {
      // TODO: assert "7" and "14" present in Payout Timing section
    });
  });

  describe('GET /api/legal/privacy', () => {
    it('should return sections array', async () => {
      // TODO: call handler, assert sections returned
    });
    it('should mention Stripe Identity for UK users', async () => {
      // TODO: assert "Stripe Identity" in data collection section
    });
    it('should mention Account Resolve and Flutterwave for Nigerian users', async () => {
      // TODO: assert "Account Resolve" and "Flutterwave" in data collection section
    });
  });
});
