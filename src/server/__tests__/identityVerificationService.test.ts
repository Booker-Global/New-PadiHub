import { describe, it } from 'vitest';

describe('StripeIdentityProvider', () => {
  describe('createVerificationSession', () => {
    it('should call stripe.identity.verificationSessions.create', async () => {
      // TODO: mock Stripe SDK, assert create called with correct params
    });
    it('should store stripe_identity_session_id and flip identity_verification_status to pending', async () => {
      // TODO: assert db.update called with session ID and status='pending'
    });
    it('should return clientSecret for the embedded stripe.verifyIdentity() modal', async () => {
      // TODO: assert result contains clientSecret (and url as a fallback only)
    });
  });

  describe('addVerificationFeeToFirstInvoice', () => {
    it('should no-op when amountPence is 0 (one of the first 50 free verifications)', async () => {
      // TODO: assert stripe.invoiceItems.create is NOT called
    });
    it('should call stripe.invoiceItems.create with the given amountPence (e.g. 100 = £1)', async () => {
      // TODO: mock stripe.invoiceItems.create, assert amount = amountPence, currency = gbp
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
  describe('validateBankAccount (Flutterwave Account Resolve)', () => {
    it('should flip identity_verification_status to pending before calling the validator', async () => {
      // TODO: assert db.update called with status='pending' before the provider call
    });
    it('should delegate to the injected IBankAccountValidationProvider', async () => {
      // TODO: mock FlutterwaveAccountResolveProvider.validateBankAccount, assert called with accountNumber/bankCode
    });
    it('should flip identity_verification_status to failed when the validator reports unverified', async () => {
      // TODO: assert db.update called with status='failed'
    });
    it('should not itself flip status to verified — that is identityVerificationService\'s job', async () => {
      // TODO: assert no db.update with status='verified' inside this method
    });
  });
});

describe('FlutterwaveAccountResolveProvider', () => {
  describe('validateBankAccount', () => {
    it('should POST to /v3/accounts/resolve with account_number and account_bank', async () => {
      // TODO: mock axios.post, assert correct endpoint and body
    });
    it('should return verified=true with the resolved account_name on success', async () => {
      // TODO: assert verified=true, accountName set
    });
    it('should return verified=false with a helpful message on API error or missing account_name', async () => {
      // TODO: assert verified=false, message set
    });
  });
});

describe('identityVerificationService', () => {
  describe('completeIdentityVerification', () => {
    it('should be idempotent — a no-op if the user is already identity_verified', async () => {
      // TODO: assert no counter increment / no charge / no email on a second call
    });
    it('should atomically increment the platform-wide free-verification counter for GB only', async () => {
      // TODO: assert platform_counters row incremented via INSERT ... ON DUPLICATE KEY UPDATE, and never for NG
    });
    it('should charge no verification fee for the first 50 successfully-verified users platform-wide', async () => {
      // TODO: assert identity_verification_fee_amount = '0.00' and addVerificationFeeToFirstInvoice not called with amount > 0
    });
    it('should add a £1 fee for the 51st successful verification onward', async () => {
      // TODO: assert addVerificationFeeToFirstInvoice called with 100 pence before activateSubscription
    });
    it('should call subscriptionService.activateSubscription only after verification succeeds', async () => {
      // TODO: assert activateSubscription called, not called anywhere before this point in the flow
    });
    it('should send the identity-verified confirmation email via Resend', async () => {
      // TODO: assert sendIdentityVerifiedEmail called
    });
  });

  describe('failIdentityVerification', () => {
    it('should not charge anything and should set identity_verification_status to failed', async () => {
      // TODO: assert no subscription/charge call, db.update sets status='failed'
    });
    it('should send a failure email with a try-again call to action', async () => {
      // TODO: assert sendIdentityVerificationFailedEmail called
    });
    it('should ignore a stale failure event if the user is already verified', async () => {
      // TODO: assert no-op when identity_verified is already true
    });
  });
});
