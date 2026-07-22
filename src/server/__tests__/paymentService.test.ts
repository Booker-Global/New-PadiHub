import { describe, it } from 'vitest';

describe('PaymentProviderFactory', () => {
  describe('getPaymentProvider', () => {
    it('should return StripeProvider for country GB', async () => {
      // TODO: import factory, assert instanceof StripeProvider
    });
    it('should return FlutterwaveProvider for country NG', async () => {
      // TODO: assert instanceof FlutterwaveProvider
    });
    it('should default to StripeProvider for unknown countries', async () => {
      // TODO: assert StripeProvider returned for US, CA, etc.
    });
  });
});

describe('StripeProvider', () => {
  describe('createCustomer', () => {
    it('should call stripe.customers.create with correct params', async () => {
      // TODO: mock Stripe SDK, assert create called
    });
    it('should return customerId from Stripe response', async () => {
      // TODO: assert customerId returned
    });
  });

  describe('chargeContribution', () => {
    it('should create a PaymentIntent with idempotency key', async () => {
      // TODO: mock stripe.paymentIntents.create, assert idempotencyKey set
    });
    it('should return succeeded status for successful charge', async () => {
      // TODO: assert status = succeeded
    });
  });
});

describe('FlutterwaveProvider', () => {
  describe('chargeContribution', () => {
    it('should POST to /v3/charges?type=token', async () => {
      // TODO: mock axios.post, assert correct endpoint called
    });
    it('should convert amount from kobo to naira (divide by 100)', async () => {
      // TODO: assert amount / 100 passed to Flutterwave
    });
  });
});
