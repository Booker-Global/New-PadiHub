/**
 * Payment eligibility — the shared "can this member join/create a group?" gate.
 *
 * Every rotating-savings-group member both contributes and eventually receives
 * a payout, so both a verified payment method (to contribute) and a verified
 * payout destination (to receive their turn) are required BEFORE joining or
 * creating a group — not deferred until the member's payout is due.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { getStripeProvider } from '../integrations/payments/PaymentProviderFactory.js';

type EligibilityUser = {
  id: string;
  country: string;
  email_verified: boolean;
  identity_verified: boolean;
  subscription_tier: 'basic' | 'premium' | null;
  stripe_payment_method_id: string | null;
  stripe_connected_account_id: string | null;
  flutterwave_card_token: string | null;
  flutterwave_subaccount_id: string | null;
  payment_method_verified_at: Date | null;
  payout_verified_at: Date | null;
};

/**
 * Self-healing live check for Stripe Connect accounts: if the account was
 * created but we haven't yet recorded `payout_verified_at` (e.g. the
 * `account.updated` webhook hasn't fired yet in this environment), check
 * directly with Stripe and persist the result. Mirrors the ensureSchemaSync
 * self-heal pattern used for schema drift.
 */
async function refreshStripePayoutVerification(user: EligibilityUser): Promise<boolean> {
  if (user.payout_verified_at) return true;
  if (!user.stripe_connected_account_id) return false;

  try {
    const status = await getStripeProvider().getAccountStatus(user.stripe_connected_account_id);
    if (status.chargesEnabled && status.payoutsEnabled) {
      await db.update(schema.users)
        .set({ payout_verified_at: new Date() })
        .where(eq(schema.users.id, user.id));
      return true;
    }
  } catch (err) {
    console.warn('[paymentEligibilityService] Could not verify Stripe account status:', err instanceof Error ? err.message : err);
  }
  return false;
}

export async function getPaymentEligibility(userId: string) {
  const rows = await db.select({
    id:                           schema.users.id,
    country:                      schema.users.country,
    email_verified:               schema.users.email_verified,
    identity_verified:            schema.users.identity_verified,
    subscription_tier:            schema.users.subscription_tier,
    stripe_payment_method_id:     schema.users.stripe_payment_method_id,
    stripe_connected_account_id:  schema.users.stripe_connected_account_id,
    flutterwave_card_token:       schema.users.flutterwave_card_token,
    flutterwave_subaccount_id:    schema.users.flutterwave_subaccount_id,
    payment_method_verified_at:   schema.users.payment_method_verified_at,
    payout_verified_at:           schema.users.payout_verified_at,
  }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!rows.length) throw new AppError('User not found.', 404);
  const user = rows[0];

  const hasPaymentMethod = user.country === 'NG'
    ? Boolean(user.flutterwave_card_token)
    : Boolean(user.stripe_payment_method_id);
  const paymentMethodVerified = hasPaymentMethod && Boolean(user.payment_method_verified_at);

  const hasPayout = user.country === 'NG'
    ? Boolean(user.flutterwave_subaccount_id)
    : Boolean(user.stripe_connected_account_id);
  const payoutVerified = user.country === 'NG'
    ? (hasPayout && Boolean(user.payout_verified_at))
    : await refreshStripePayoutVerification(user);

  const emailVerified = Boolean(user.email_verified);
  const identityVerified = Boolean(user.identity_verified);
  const subscriptionTierSelected = user.subscription_tier === 'basic' || user.subscription_tier === 'premium';

  return {
    emailVerified,
    identityVerified,
    subscriptionTierSelected,
    subscriptionTier: user.subscription_tier,
    hasPaymentMethod,
    paymentMethodVerified,
    hasPayout,
    payoutVerified,
    ready: emailVerified && identityVerified && subscriptionTierSelected && paymentMethodVerified && payoutVerified,
  };
}

/**
 * Throws a 403 error unless the user has completed EVERY onboarding step
 * required before creating or joining a savings group: verified email,
 * verified identity, a chosen subscription tier, a verified payment method,
 * and a verified payout destination. Call before allowing a user to create
 * or join a savings group.
 */
export async function assertPaymentSetupComplete(userId: string): Promise<void> {
  const eligibility = await getPaymentEligibility(userId);
  if (eligibility.ready) return;

  const missing: string[] = [];
  if (!eligibility.emailVerified) missing.push('a verified email address');
  if (!eligibility.identityVerified) missing.push('identity verification (/verify-identity)');
  if (!eligibility.subscriptionTierSelected) missing.push('a chosen subscription plan (/onboarding)');
  if (!eligibility.paymentMethodVerified) missing.push('a verified payment method (/payments/methods)');
  if (!eligibility.payoutVerified) missing.push('a verified payout destination (/payments/payout)');

  throw new AppError(
    `Before joining or creating a group, complete: ${missing.join('; ')}.`,
    403,
    'PAYMENT_SETUP_REQUIRED',
  );
}
