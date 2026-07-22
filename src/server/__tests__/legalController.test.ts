import { describe, it } from 'vitest';

describe('legalController', () => {
  describe('GET /api/legal/terms', () => {
    it('should return sections array with at least 4 items', async () => {
      // TODO: call handler, assert sections.length >= 4
    });
    it('should include Identity Verification section', async () => {
      // TODO: assert section with title "Identity Verification" present
    });
    it('should include Identity Verification Fee (UK Users) section with £1.50 mention', async () => {
      // TODO: assert section content contains "£1.50"
    });
    it('should include Identity Verification Fee (Nigerian Users) section stating no charge', async () => {
      // TODO: assert section content contains "no additional cost"
    });
    it('should include Subscription Fees section with £4.99 and ₦3,500', async () => {
      // TODO: assert section content contains "£4.99" and "₦3,500"
    });
    it('should include first invoice total of £6.49 for UK users', async () => {
      // TODO: assert "£6.49" present in Subscription Fees section
    });
  });

  describe('GET /api/legal/privacy', () => {
    it('should return sections array', async () => {
      // TODO: call handler, assert sections returned
    });
    it('should mention Stripe Identity for UK users', async () => {
      // TODO: assert "Stripe Identity" in data collection section
    });
    it('should mention BVN and Flutterwave for Nigerian users', async () => {
      // TODO: assert "BVN" and "Flutterwave" in data collection section
    });
  });
});
