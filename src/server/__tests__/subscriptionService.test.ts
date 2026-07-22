import { describe, it } from 'vitest';

describe('subscriptionService', () => {
  describe('createSubscription', () => {
    it('should create a Stripe customer if none exists (GB user)', async () => {
      // TODO: mock StripeProvider.createCustomer, assert called
    });
    it('should create a Flutterwave customer if none exists (NG user)', async () => {
      // TODO: mock FlutterwaveProvider.createCustomer, assert called
    });
    it('should insert a subscription record in the database', async () => {
      // TODO: mock db.insert, assert subscription created
    });
    it('should write an audit log entry', async () => {
      // TODO: assert createAuditLog called with SUBSCRIPTION_CREATED
    });
  });

  describe('cancelSubscription', () => {
    it('should call provider.cancelSubscription', async () => {
      // TODO: mock provider, assert cancelSubscription called
    });
    it('should set billing_status = cancelled in DB', async () => {
      // TODO: assert db.update called
    });
  });

  describe('restrictAccessIfExpired', () => {
    it('should throw 403 SUBSCRIPTION_EXPIRED for expired subscriptions', async () => {
      // TODO: mock user with subscription_status = expired, assert AppError 403
    });
    it('should not throw for active subscriptions', async () => {
      // TODO: assert no error for active status
    });
  });
});
