import { describe, it } from 'vitest';

describe('StripeIdentityProvider', () => {
  describe('createVerificationSession', () => {
    it('should call stripe.identity.verificationSessions.create', async () => {
      // TODO: mock Stripe SDK, assert create called with correct params
    });
    it('should store stripe_identity_session_id on user record', async () => {
      // TODO: assert db.update called with session ID
    });
    it('should return clientSecret and url', async () => {
      // TODO: assert result contains clientSecret and url
    });
  });

  describe('addVerificationFeeToFirstInvoice', () => {
    it('should call stripe.invoiceItems.create with amount 150 GBP', async () => {
      // TODO: mock stripe.invoiceItems.create, assert amount = 150, currency = gbp
    });
    it('should use the correct description text', async () => {
      // TODO: assert description = "Identity Verification Fee (one-time)"
    });
    it('should not throw if user has no stripe_customer_id', async () => {
      // TODO: assert graceful no-op
    });
  });
});

describe('FlutterwaveIdentityProvider', () => {
  describe('initiateBvnVerification', () => {
    it('should POST to /v3/bvn-consents/{bvn}', async () => {
      // TODO: mock axios.post, assert correct endpoint
    });
    it('should store bvn_verification_reference (NOT the BVN itself)', async () => {
      // TODO: assert reference stored, BVN not stored
    });
    it('should return OTP sent message', async () => {
      // TODO: assert message returned
    });
  });

  describe('confirmBvnOtp', () => {
    it('should return verified = true on successful OTP', async () => {
      // TODO: mock axios.post, assert verified = true
    });
    it('should return verified = false on failed OTP', async () => {
      // TODO: assert verified = false
    });
    it('should clear bvn_verification_reference after success', async () => {
      // TODO: assert db.update sets reference to null
    });
  });
});
