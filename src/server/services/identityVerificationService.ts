/**
 * Shared post-verification logic for both markets — UK (Stripe Identity)
 * and NG (Flutterwave Account Resolve). Both flows mirror the same
 * charge-gating pattern: a plan is selected and a card/payment method is
 * saved WITHOUT charging anything, verification is triggered, the profile
 * shows "Pending", and only once verification succeeds does the platform
 * subscription actually get created/charged. This module is the single
 * place that turns a successful or failed verification into the resulting
 * charge (or lack of one), Resend emails, trust score bump, and audit log —
 * called from identityController.ts's Stripe Identity webhook handler (UK)
 * and its Account Resolve handler (NG).
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { trustScoreService } from './trustScoreService.js';
import { notificationService } from './notificationService.js';
import { subscriptionService } from './subscriptionService.js';
import { StripeIdentityProvider } from '../integrations/identity/StripeIdentityProvider.js';
import { TRUST_SCORE_DELTA_IDENTITY_VERIFIED, isSubscriptionTierKey, formatTierPrice } from '../lib/constants.js';
import {
  sendIdentityVerifiedEmail,
  sendVerificationFeeChargedEmail,
  sendIdentityVerificationFailedEmail,
  sendSubscriptionPaymentFailedEmail,
} from '../integrations/email/emailService.js';

/**
 * First 50 successfully-verified users platform-wide (GB only — Flutterwave
 * Account Resolve carries no fee) get identity verification free; the 51st
 * onward gets a £1 surcharge added to their first invoice. Per Stripe's own
 * billing docs, Stripe charges PadiHub per *completed* VerificationSession
 * (verified OR unverified outcome) — not per successful-only, and not per
 * mere session creation. That's a real cost to PadiHub on failed attempts
 * too, but is a separate concern from this member-facing "first 50 free"
 * promotion, which the problem statement defines in terms of *successful*
 * verifications — hence this counter only increments on success.
 */
const FREE_VERIFICATION_LIMIT = 50;
const VERIFICATION_SURCHARGE_PENCE = 100; // £1
const FREE_VERIFICATION_COUNTER_NAME = 'identity_verifications_free_used';

const stripeIdentity = new StripeIdentityProvider();

/**
 * Atomically increments the platform-wide successful-verification counter
 * and returns the new count, inside a single DB transaction. The
 * INSERT ... ON DUPLICATE KEY UPDATE takes an exclusive row lock on the
 * counter row that isn't released until the transaction commits, so a
 * concurrent call blocks until this one finishes and always reads the
 * post-increment value — no two concurrent verifications can read the same
 * count and both believe they're under the free limit.
 */
async function incrementAndGetFreeVerificationCount(): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.insert(schema.platformCounters)
      .values({ name: FREE_VERIFICATION_COUNTER_NAME, value: 1 })
      .onDuplicateKeyUpdate({ set: { value: sql`${schema.platformCounters.value} + 1` } });

    const rows = await tx.select({ value: schema.platformCounters.value })
      .from(schema.platformCounters)
      .where(eq(schema.platformCounters.name, FREE_VERIFICATION_COUNTER_NAME))
      .for('update')
      .limit(1);

    return rows[0]?.value ?? 1;
  });
}

export const identityVerificationService = {
  /**
   * Called once a verification provider (Stripe Identity for GB, Flutterwave
   * Account Resolve for NG) reports success. Idempotent — a no-op if this
   * user is already verified, so a duplicate webhook delivery or a repeated
   * status poll can never double-charge or double-count the free-tier.
   */
  async completeIdentityVerification(userId: string, country: 'GB' | 'NG') {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    if (user.identity_verified) {
      return { alreadyVerified: true as const };
    }

    let feePence = 0;
    if (country === 'GB') {
      const verifiedCount = await incrementAndGetFreeVerificationCount();
      if (verifiedCount > FREE_VERIFICATION_LIMIT) {
        feePence = VERIFICATION_SURCHARGE_PENCE;
      }
    }

    await db.update(schema.users)
      .set({
        identity_verified:                true,
        identity_verified_at:              new Date(),
        identity_verification_status:      'verified',
        identity_verification_fee_amount:  country === 'GB' ? (feePence / 100).toFixed(2) : null,
      })
      .where(eq(schema.users.id, userId));

    await trustScoreService.increase(userId, TRUST_SCORE_DELTA_IDENTITY_VERIFIED, 'IDENTITY_VERIFIED');
    await createAuditLog({ userId, action: 'IDENTITY_VERIFIED', entity: 'users', entityId: userId });

    // Charge the £1 surcharge (if any) on the *first* invoice before creating
    // the subscription below, so it's actually picked up by that invoice.
    if (country === 'GB' && feePence > 0) {
      await stripeIdentity.addVerificationFeeToFirstInvoice(userId, feePence);
    }

    // Now that verification succeeded, actually create/charge the platform
    // subscription — this is the only point in either flow where the member
    // is charged for their subscription (see subscriptionService.activateSubscription).
    // Verification itself has already been recorded above, so a member who
    // hasn't picked a plan or saved a card yet (they can verify first and
    // subscribe afterwards) must not have their verification result thrown
    // away — the remaining onboarding steps are enforced separately by
    // paymentEligibilityService before they can create or join a group.
    let subscriptionResult: Awaited<ReturnType<typeof subscriptionService.activateSubscription>> | null = null;
    let subscriptionActivationFailureReason: string | null = null;
    try {
      subscriptionResult = await subscriptionService.activateSubscription(userId);
    } catch (err) {
      // 'SUBSCRIPTION_TIER_NOT_SELECTED' just means the member hasn't picked
      // a plan/saved a card yet — expected, not an error worth surfacing.
      // Anything else (provider/customer/charge failure) is genuine and must
      // not be silently dropped, or the member is left thinking they need to
      // "finish onboarding" when really their card was declined or the
      // provider request failed.
      const isNotReadyYet = err instanceof AppError && err.code === 'SUBSCRIPTION_TIER_NOT_SELECTED';
      console.warn(
        '[identityVerificationService] Identity verified but subscription could not be activated:',
        err instanceof Error ? err.message : err,
      );
      if (!isNotReadyYet) {
        subscriptionActivationFailureReason = err instanceof AppError
          ? err.message
          : 'Could not activate your subscription with the payment provider.';
      }
    }

    // Only claim the subscription is now active if activateSubscription
    // actually succeeded — a member who verifies identity before choosing a
    // plan/card must be told the truth: verification succeeded, but their
    // subscription is still outstanding until they finish those steps.
    const subscriptionActivated = Boolean(subscriptionResult);
    await notificationService.create({
      userId, type: 'identity_verified',
      title: 'Identity Verified',
      message: subscriptionActivated
        ? 'Your identity has been verified. Your Trust Score has increased and your subscription is now active.'
        : subscriptionActivationFailureReason
          ? `Your identity has been verified and your Trust Score has increased, but your subscription could not be activated: ${subscriptionActivationFailureReason}`
          : 'Your identity has been verified and your Trust Score has increased. Choose a subscription plan and add your payment card to activate your subscription.',
    });

    if (subscriptionActivationFailureReason) {
      const failedTier = isSubscriptionTierKey(user.subscription_tier) ? user.subscription_tier : 'basic';
      await sendSubscriptionPaymentFailedEmail(user.email, formatTierPrice(failedTier, user.country));
    }

    const tier = isSubscriptionTierKey(user.subscription_tier) ? user.subscription_tier : 'basic';
    await sendIdentityVerifiedEmail(user.email, user.first_name, subscriptionActivated);
    if (country === 'GB' && feePence > 0) {
      await sendVerificationFeeChargedEmail(
        user.email, user.first_name,
        formatTierPrice(tier, user.country),
        `£${(feePence / 100).toFixed(2)}`,
      );
    }

    return { alreadyVerified: false as const, feePence, subscription: subscriptionResult };
  },

  /**
   * Called once a verification provider reports failure (or the member
   * abandons/times out). No charge occurs — the member can re-trigger the
   * whole verification+subscription process from scratch at any time.
   */
  async failIdentityVerification(userId: string) {
    const userRows = await db.select({ email: schema.users.email, first_name: schema.users.first_name, identity_verified: schema.users.identity_verified })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    if (userRows[0].identity_verified) return; // already verified — ignore a stale failure event

    await db.update(schema.users)
      .set({ identity_verification_status: 'failed' })
      .where(eq(schema.users.id, userId));

    await notificationService.create({
      userId, type: 'identity_verification_failed',
      title: 'Identity Verification Needs Attention',
      message: 'We couldn\'t verify your identity. No charge has been made — you can try again at any time.',
    });
    await createAuditLog({ userId, action: 'IDENTITY_VERIFICATION_FAILED', entity: 'users', entityId: userId });
    await sendIdentityVerificationFailedEmail(userRows[0].email, userRows[0].first_name);
  },
};
