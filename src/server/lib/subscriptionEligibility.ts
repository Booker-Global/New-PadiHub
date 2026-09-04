/**
 * Pure, DB-import-free description of "has this member fully completed
 * every subscription-related onboarding input THEY control?" — see
 * paymentEligibilityService.ts for where this is wired into the live
 * eligibility gate. Kept separate from that DB-touching module (same
 * reasoning as onboardingSteps.ts) so it stays directly unit-testable.
 *
 * This is deliberately a proxy for "every member-controlled onboarding
 * input is on file and verified", NOT for "billing is live" — Section D.2
 * deferred billing already treats an unbilled-but-fully-set-up member as
 * done; this simply recognises the same completion even when the
 * subscriptions/billing_status record itself never got created (or is
 * stuck) due to a provider/pipeline bug, instead of blocking the member
 * forever on a charge confirmation they have no way to influence further.
 *
 * Retroactively diagnosed for abdulwahabyakubu@yahoo.com,
 * abdulwahabyakubu17@gmail.com and tounsitraveller@gmail.com (see
 * PR #33-36): waiting on a live billing charge to mark "Complete your
 * subscription payment" done left these accounts permanently stuck at 80%,
 * blocked from joining/creating a group, and repeatedly re-triggered a
 * failing activation retry that kept re-sending "subscription payment
 * failed" emails.
 */
export type FullyVerifiedSubscriptionSetupInput = {
  account_status: string;
  email_verified: boolean;
  subscription_tier: string | null;
  stripe_payment_method_id: string | null;
  stripe_connected_account_id: string | null;
  stripe_customer_id: string | null;
  flutterwave_card_token: string | null;
  flutterwave_subaccount_id: string | null;
  flutterwave_customer_id: string | null;
  payment_method_verified_at: Date | string | null;
  payout_verified_at: Date | string | null;
  created_at: Date | string;
};

/**
 * `payment_method_verified_at`/`payout_verified_at` are additionally
 * required to be later than `created_at` — a defensive sanity check that
 * they hold a genuine post-signup verification timestamp, not some
 * degenerate/backfilled value. Deliberately does NOT require
 * `identity_verified` — identity verification remains its own, separate
 * onboarding step (see onboardingSteps.ts).
 */
export function hasFullyVerifiedSubscriptionSetup(user: FullyVerifiedSubscriptionSetupInput): boolean {
  const createdAtMs = new Date(user.created_at).getTime();
  const paymentMethodVerifiedAfterSignup = Boolean(user.payment_method_verified_at)
    && new Date(user.payment_method_verified_at as NonNullable<typeof user.payment_method_verified_at>).getTime() > createdAtMs;
  const payoutVerifiedAfterSignup = Boolean(user.payout_verified_at)
    && new Date(user.payout_verified_at as NonNullable<typeof user.payout_verified_at>).getTime() > createdAtMs;

  return user.account_status === 'active'
    && Boolean(user.email_verified)
    && (Boolean(user.stripe_payment_method_id) || Boolean(user.flutterwave_card_token))
    && paymentMethodVerifiedAfterSignup
    && payoutVerifiedAfterSignup
    && (user.subscription_tier === 'basic' || user.subscription_tier === 'premium')
    && (Boolean(user.stripe_customer_id) || Boolean(user.flutterwave_customer_id))
    && (Boolean(user.stripe_connected_account_id) || Boolean(user.flutterwave_subaccount_id));
}
