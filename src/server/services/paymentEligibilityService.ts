/**
 * Payment eligibility — the shared "can this member join/create a group?" gate.
 *
 * Every rotating-savings-group member both contributes and eventually receives
 * a payout, so both a verified payment method (to contribute) and a verified
 * payout destination (to receive their turn) are required BEFORE joining or
 * creating a group — not deferred until the member's payout is due.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { getStripeProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { notificationService } from './notificationService.js';
import { sendProfileSetupCompleteEmail } from '../integrations/email/emailService.js';
import { SUBSCRIPTION_TIERS, isSubscriptionTierKey, formatTierPrice, type SubscriptionTierKey } from '../lib/constants.js';
import { buildOnboardingSteps, lowerFirst } from '../lib/onboardingSteps.js';

export type { OnboardingStep } from '../lib/onboardingSteps.js';

type EligibilityUser = {
  id: string;
  country: string;
  email_verified: boolean;
  identity_verified: boolean;
  subscription_status: 'free' | 'trial' | 'active' | 'expired' | 'cancelled';
  subscription_tier: 'basic' | 'premium' | null;
  stripe_payment_method_id: string | null;
  stripe_connected_account_id: string | null;
  flutterwave_card_token: string | null;
  flutterwave_subaccount_id: string | null;
  payment_method_verified_at: Date | null;
  payout_verified_at: Date | null;
};

/** Never retry a stuck subscription activation more than once every 5
 * minutes per member — see refreshSubscriptionActivationStatus below. */
const SUBSCRIPTION_RETRY_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Self-heal for `users.subscription_status`: a subscription can genuinely
 * already be confirmed with the provider — billing_status 'active' (real
 * billing live) or 'paused' (Section D.2 deferred billing: equally
 * confirmed, simply not yet charging until the member joins an active 3+
 * member group) — while `users.subscription_status` is still stuck at a
 * stale non-active value (e.g. a transient failure partway through an
 * earlier activation attempt, or a race between two onboarding-completion
 * paths that both call activateSubscriptionIfEligible). Left unhealed, this
 * is exactly what leaves an otherwise fully-onboarded member (payment
 * method, payout and identity all verified) stuck seeing "Complete your
 * subscription payment" forever and blocked from joining/creating a group
 * they've already paid for.
 *
 * If billing_status isn't 'active'/'paused' yet, this is NOT necessarily a
 * genuine, still-unresolved failure — it can just as easily be a member
 * whose earlier activation attempt hit a now-fixed bug (e.g. the
 * default_incomplete + pause_collection combination that used to leave
 * every deferred-billing subscription permanently stuck 'incomplete') and
 * would succeed if simply retried. So when every OTHER onboarding
 * prerequisite (`eligibleForActivation`) is already met, actively retry
 * activation here too — instead of leaving the member stuck until the next
 * server boot (activateRetroactiveEligibleSubscriptions) or the next
 * provider webhook delivery — throttled to at most once every 5 minutes per
 * member (via subscriptions.updated_at) so a member whose activation
 * genuinely, repeatedly fails (e.g. a real provider outage) isn't
 * retried — and re-notified/re-emailed — on every single dashboard or
 * group-join page load.
 */
async function refreshSubscriptionActivationStatus(userId: string, eligibleForActivation: boolean): Promise<boolean> {
  const subRows = await db.select({
    billing_status:             schema.subscriptions.billing_status,
    last_activation_attempt_at: schema.subscriptions.last_activation_attempt_at,
  }).from(schema.subscriptions).where(eq(schema.subscriptions.user_id, userId)).limit(1);
  const sub = subRows[0];

  const isConfirmedWithProvider = sub && (sub.billing_status === 'active' || sub.billing_status === 'paused');
  if (isConfirmedWithProvider) {
    await db.update(schema.users).set({ subscription_status: 'active' as const }).where(eq(schema.users.id, userId));
    return true;
  }

  if (!eligibleForActivation) return false;
  // Deliberately keyed off subscriptions.last_activation_attempt_at, NOT
  // updated_at — updated_at is also bumped by writes that have nothing to
  // do with an activation retry (billing pause/resume reconciliation,
  // Stripe invoice webhooks), which would otherwise perpetually reset this
  // cooldown and starve a genuinely stuck subscription of ever being
  // retried at all.
  const lastAttemptAt = sub?.last_activation_attempt_at ? new Date(sub.last_activation_attempt_at).getTime() : 0;
  if (Date.now() - lastAttemptAt < SUBSCRIPTION_RETRY_COOLDOWN_MS) return false;

  try {
    // Dynamically imported to avoid a static circular dependency
    // (subscriptionService imports membershipService, which imports this
    // module) — same pattern used by refreshStripePayoutVerification below.
    const { subscriptionService } = await import('./subscriptionService.js');
    await subscriptionService.activateSubscriptionIfEligible(userId);
  } catch (err) {
    console.error('[paymentEligibilityService] Could not retry stuck subscription activation:', err);
    return false;
  }

  const refreshedUserRows = await db.select({ subscription_status: schema.users.subscription_status })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const refreshedStatus = refreshedUserRows[0]?.subscription_status;
  return refreshedStatus === 'active' || refreshedStatus === 'trial';
}

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

      // This self-heal can be the moment a payout destination becomes
      // verified for the first time (if the account.updated webhook hasn't
      // fired yet) — attempt subscription activation immediately in case
      // it's now the last remaining onboarding prerequisite. Dynamically
      // imported to avoid a static circular dependency (subscriptionService
      // imports membershipService, which imports this module) — same
      // pattern used by groupService.reconcileMemberBilling.
      try {
        const { subscriptionService } = await import('./subscriptionService.js');
        await subscriptionService.activateSubscriptionIfEligible(user.id);
      } catch (activationErr) {
        console.error('[paymentEligibilityService] Could not activate subscription after payout self-heal:', activationErr);
      }

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
    subscription_status:          schema.users.subscription_status,
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
  // Every OTHER onboarding prerequisite is met — if the subscription still
  // isn't marked active, it's worth actively retrying activation (see
  // refreshSubscriptionActivationStatus) rather than only passively reading
  // back a billing_status that a still-broken/never-retried activation
  // attempt would leave stuck forever.
  const eligibleForSubscriptionActivation = subscriptionTierSelected && paymentMethodVerified && payoutVerified && identityVerified;
  const subscriptionActive = (user.subscription_status === 'active' || user.subscription_status === 'trial')
    || await refreshSubscriptionActivationStatus(user.id, eligibleForSubscriptionActivation);

  return {
    emailVerified,
    identityVerified,
    subscriptionTierSelected,
    subscriptionActive,
    subscriptionTier: user.subscription_tier,
    hasPaymentMethod,
    paymentMethodVerified,
    hasPayout,
    payoutVerified,
    ready: emailVerified && identityVerified && subscriptionTierSelected && subscriptionActive && paymentMethodVerified && payoutVerified,
  };
}

/**
 * Everything the dashboard's profile-completion card (and the group
 * create/join gate) needs: the ordered steps, which are done, how far along
 * the member is, and what their plan lets them do once they're finished.
 */
export async function getOnboardingProgress(userId: string) {
  const eligibility = await getPaymentEligibility(userId);
  const steps = buildOnboardingSteps(eligibility);
  const completedCount = steps.filter(step => step.complete).length;
  const tier = isSubscriptionTierKey(eligibility.subscriptionTier) ? eligibility.subscriptionTier : null;

  if (eligibility.ready) {
    // Fire-and-forget: the "your profile is complete" email must never block
    // or fail the request that happened to notice the completion.
    void notifyOnboardingComplete(userId, tier).catch(err => {
      console.error('[paymentEligibilityService] Could not send profile-complete confirmation:', err);
    });
  }

  return {
    steps,
    completed_steps: completedCount,
    total_steps: steps.length,
    completion_percent: Math.round((completedCount / steps.length) * 100),
    complete: eligibility.ready,
    next_step: steps.find(step => !step.complete) ?? null,
    subscription_tier: tier,
    can_create_groups: tier ? SUBSCRIPTION_TIERS[tier].maxGroupsCreate > 0 : false,
    max_groups_create: tier ? SUBSCRIPTION_TIERS[tier].maxGroupsCreate : 0,
    max_groups_join: tier ? SUBSCRIPTION_TIERS[tier].maxGroupsJoin : 0,
  };
}

/**
 * Sends the "your profile setup is complete" email exactly once per member.
 * The conditional UPDATE ... WHERE ... IS NULL is what makes this idempotent:
 * only the first caller to flip the column sees affectedRows > 0, so two
 * concurrent requests can never both send the email.
 */
async function notifyOnboardingComplete(userId: string, tier: SubscriptionTierKey | null): Promise<void> {
  if (!tier) return;

  const result = await db.update(schema.users)
    .set({ onboarding_completed_email_sent_at: new Date() })
    .where(and(
      eq(schema.users.id, userId),
      isNull(schema.users.onboarding_completed_email_sent_at),
    ));

  const affectedRows = (result as unknown as { affectedRows?: number }[])[0]?.affectedRows
    ?? (result as unknown as { affectedRows?: number }).affectedRows
    ?? 0;
  if (!affectedRows) return;

  const rows = await db.select({
    email:      schema.users.email,
    first_name: schema.users.first_name,
    country:    schema.users.country,
  }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!rows.length) return;

  // Section 1 — profile completion (steps a-e) is distinct from step f
  // (joining an active group); a member can be 100% complete with
  // subscription status 'Pending Charge' (billing_status 'paused' — card
  // validated, not yet charged). The email must say so explicitly instead
  // of implying they're already being billed.
  const subRows = await db.select({ billing_status: schema.subscriptions.billing_status })
    .from(schema.subscriptions).where(eq(schema.subscriptions.user_id, userId)).limit(1);
  const billingDeferred = subRows[0]?.billing_status === 'paused';

  const plan = SUBSCRIPTION_TIERS[tier];
  await notificationService.create({
    userId,
    type: 'profile_setup_complete',
    title: 'Profile Setup Complete',
    message: (billingDeferred
      ? `Your profile is 100% complete on the ${plan.name} plan — subscription status: Pending Charge (validated, not yet charged until you join an active group). `
      : `Your profile is complete on the ${plan.name} plan — `)
      + (plan.maxGroupsCreate > 0
        ? `you can now create up to ${plan.maxGroupsCreate} groups and join up to ${plan.maxGroupsJoin}.`
        : `you can now join up to ${plan.maxGroupsJoin} groups. Upgrade to Premium if you'd like to create your own group.`),
  });
  await sendProfileSetupCompleteEmail(rows[0].email, rows[0].first_name, {
    tierName:        plan.name,
    monthlyPrice:    formatTierPrice(tier, rows[0].country),
    maxGroupsCreate: plan.maxGroupsCreate,
    maxGroupsJoin:   plan.maxGroupsJoin,
  }, billingDeferred);
}

/**
 * Throws a 403 error unless the user has completed EVERY onboarding step
 * required before creating or joining a savings group: verified email,
 * verified identity, a chosen and ACTIVE subscription, a verified payment
 * method, and a verified payout destination. Call before allowing a user to
 * create or join a savings group.
 *
 * The message names the *next* missing step and links to the dashboard page
 * that completes it (never an API route), so a blocked member always knows
 * exactly what to do next.
 */
export async function assertPaymentSetupComplete(userId: string): Promise<void> {
  const eligibility = await getPaymentEligibility(userId);
  if (eligibility.ready) return;

  const steps = buildOnboardingSteps(eligibility);
  const outstanding = steps.filter(step => !step.complete);
  const nextStep = outstanding[0];
  const remainder = outstanding.slice(1);

  throw new AppError(
    `Before joining or creating a group you still need to ${lowerFirst(nextStep.label)}.`
      + (remainder.length
        ? ` After that: ${remainder.map(step => lowerFirst(step.label)).join('; ')}.`
        : ''),
    403,
    'PAYMENT_SETUP_REQUIRED',
  );
}
