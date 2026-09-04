import { describe, expect, it } from 'vitest';
import { hasFullyVerifiedSubscriptionSetup, type FullyVerifiedSubscriptionSetupInput } from '../lib/subscriptionEligibility.js';

const CREATED_AT = new Date('2024-01-01T00:00:00Z');
const AFTER_SIGNUP = new Date('2024-01-02T00:00:00Z');

/**
 * A user who has genuinely completed every onboarding input they control —
 * matching the three accounts (abdulwahabyakubu@yahoo.com,
 * abdulwahabyakubu17@gmail.com, tounsitraveller@gmail.com) that stayed
 * stuck at 80% purely because their live billing charge was never
 * confirmed (see PR #33-36).
 */
function fullyVerifiedUser(overrides: Partial<FullyVerifiedSubscriptionSetupInput> = {}): FullyVerifiedSubscriptionSetupInput {
  return {
    account_status: 'active',
    email_verified: true,
    subscription_tier: 'basic',
    stripe_customer_id: 'cus_123',
    stripe_payment_method_id: 'pm_123',
    stripe_connected_account_id: 'acct_123',
    flutterwave_customer_id: null,
    flutterwave_card_token: null,
    flutterwave_subaccount_id: null,
    payment_method_verified_at: AFTER_SIGNUP,
    payout_verified_at: AFTER_SIGNUP,
    created_at: CREATED_AT,
    ...overrides,
  };
}

describe('hasFullyVerifiedSubscriptionSetup', () => {
  it('is true when every member-controlled onboarding input is on file and verified, even without a live billing confirmation', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser())).toBe(true);
  });

  it('is true for an NG (Flutterwave) user with the equivalent fields populated', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({
      stripe_customer_id: null,
      stripe_payment_method_id: null,
      stripe_connected_account_id: null,
      flutterwave_customer_id: 'flw_cus_123',
      flutterwave_card_token: 'flw_tok_123',
      flutterwave_subaccount_id: 'flw_sub_123',
    }))).toBe(true);
  });

  it('is false when the account is not active', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ account_status: 'pending_verification' }))).toBe(false);
  });

  it('is false when the email has not been verified', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ email_verified: false }))).toBe(false);
  });

  it('is false when no payment method token/id is on file', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ stripe_payment_method_id: null }))).toBe(false);
  });

  it('is false when payment_method_verified_at is null', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ payment_method_verified_at: null }))).toBe(false);
  });

  it('is false when payment_method_verified_at is not later than created_at', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ payment_method_verified_at: CREATED_AT }))).toBe(false);
  });

  it('is false when payout_verified_at is null', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ payout_verified_at: null }))).toBe(false);
  });

  it('is false when payout_verified_at is not later than created_at', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ payout_verified_at: CREATED_AT }))).toBe(false);
  });

  it('is false when no subscription tier has been chosen', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ subscription_tier: null }))).toBe(false);
  });

  it('is false when no provider customer id is on file', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ stripe_customer_id: null }))).toBe(false);
  });

  it('is false when no provider payout/connected-account id is on file', () => {
    expect(hasFullyVerifiedSubscriptionSetup(fullyVerifiedUser({ stripe_connected_account_id: null }))).toBe(false);
  });
});
