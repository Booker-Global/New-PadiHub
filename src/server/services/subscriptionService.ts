/**
 * Subscription service — manages platform subscriptions via Stripe (UK) or Flutterwave (NG).
 *
 * PadiHub has exactly two monthly-only tiers — Basic and Premium —
 * see SUBSCRIPTION_TIERS in ../lib/constants.ts for pricing and group limits.
 * There is no free trial and no annual billing option.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, or, gt, inArray, notInArray, isNotNull, isNull, desc } from 'drizzle-orm';
import axios from 'axios';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { getPaymentProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { PaymentProviderConfigError } from '../integrations/payments/PaymentProviderInterface.js';
import { groupService } from './groupService.js';
import { membershipService } from './membershipService.js';
import { notificationService } from './notificationService.js';
import {
  SUBSCRIPTION_TIERS,
  isSubscriptionTierKey,
  getTierMonthlyPrice,
  formatTierPrice,
  type SubscriptionTierKey,
} from '../lib/constants.js';
import { hasFullyVerifiedSubscriptionSetup } from '../lib/subscriptionEligibility.js';
import {
  sendSubscriptionCreatedEmail,
  sendSubscriptionCancelledEmail,
  sendSubscriptionTierChangedEmail,
  sendSubscriptionPaymentFailedEmail,
  sendPaymentProviderConfigErrorAlertEmail,
} from '../integrations/email/emailService.js';

export function planCode(country: string, tier: SubscriptionTierKey): string {
  return `${country === 'NG' ? 'ng' : 'gb'}_${tier}`;
}

/**
 * Payment-provider SDK/HTTP errors (Stripe SDK errors, axios errors from
 * Flutterwave) are plain Error/AxiosError instances, not AppError, so the
 * generic error handler would otherwise mask them as "An unexpected error
 * occurred." — surface the real provider message instead so failures here
 * (e.g. select-plan/switch-plan activating billing) are actually debuggable.
 */
function describeProviderError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    return data?.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

function isStripeSubscriptionAwaitingConfirmation(country: string, providerStatus: string): boolean {
  return country === 'GB' && providerStatus === 'incomplete';
}

/** Never re-send the "subscription payment could not be completed" email
 * more than once per hour for the same member — see
 * activateSubscriptionIfEligible's catch block below. */
const ACTIVATION_FAILURE_EMAIL_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Returns true (and stamps the timestamp) the first time this is called for
 * a member since the cooldown last elapsed; returns false otherwise. Not
 * perfectly race-proof under true concurrency, but activation attempts for
 * one member are effectively sequential in practice (one request at a
 * time), so this is enough to stop the same still-failing account being
 * emailed on every onboarding action/page load.
 */
async function shouldNotifyActivationFailureByEmail(userId: string): Promise<boolean> {
  const rows = await db.select({ at: schema.users.subscription_activation_failure_notified_at })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const lastNotifiedAt = rows[0]?.at ? new Date(rows[0].at).getTime() : 0;
  if (Date.now() - lastNotifiedAt < ACTIVATION_FAILURE_EMAIL_COOLDOWN_MS) return false;

  await db.update(schema.users)
    .set({ subscription_activation_failure_notified_at: new Date() })
    .where(eq(schema.users.id, userId));
  return true;
}

/**
 * A missing env var (Stripe/Flutterwave secret key, Price/Plan ID) affects
 * EVERY member's activation attempt at once, not just one account — the
 * per-user DB-backed cooldown above would still send one alert per affected
 * member (e.g. all 3 in the boot-time retroactive migration) instead of one
 * alert for the whole incident. A simple in-process timestamp is enough
 * here (and deliberately resets on every deploy/restart, which is exactly
 * when a just-fixed or just-introduced env var problem should be re-alerted
 * on if it recurs).
 */
const CONFIG_ERROR_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
let lastConfigErrorAlertSentAt = 0;
function shouldSendConfigErrorAlertEmail(): boolean {
  if (Date.now() - lastConfigErrorAlertSentAt < CONFIG_ERROR_ALERT_COOLDOWN_MS) return false;
  lastConfigErrorAlertSentAt = Date.now();
  return true;
}

type PlanSelectionResult = { tier: SubscriptionTierKey; plan: string; monthly_amount: number };
type PlanSwitchResult = {
  tier: SubscriptionTierKey;
  direction: 'upgrade' | 'downgrade';
  effective_immediately?: boolean;
  effective_date?: Date;
};

/** Audit-log actions that represent a real billing/payment event for a member. */
const BILLING_HISTORY_ACTIONS = [
  'SUBSCRIPTION_CREATED',
  'STRIPE_INVOICE_PAID',
  'STRIPE_INVOICE_FAILED',
  'STRIPE_SUBSCRIPTION_FIRST_CHARGE',
  'FLW_SUBSCRIPTION_RENEWAL_CHARGED',
  'FLW_SUBSCRIPTION_FIRST_CHARGE',
] as const;

export type BillingHistoryEntry = {
  id: string;
  date: Date;
  status: 'paid' | 'failed';
  provider: 'stripe' | 'flutterwave' | null;
  tier: SubscriptionTierKey | null;
  amount_display: string | null;
};

export const subscriptionService = {
  /**
   * Record the member's chosen tier during onboarding. This does NOT yet
   * charge the member — the platform subscription is only created with the
   * provider once a verified payment method exists (see
   * paymentController.confirmSetupIntent / saveFlutterwaveToken, which call
   * `activateSubscription` below after saving the card). Selecting/changing
   * a plan before a provider subscription exists is free to do repeatedly.
   */
  async selectPlan(userId: string, tier: string): Promise<PlanSelectionResult | PlanSwitchResult> {
    if (!isSubscriptionTierKey(tier)) {
      throw new AppError('Invalid subscription tier. Choose "basic" or "premium".', 400, 'INVALID_SUBSCRIPTION_TIER');
    }

    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    const existingSub = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);

    // A provider subscription already exists — this is a genuine tier switch,
    // not a first-time selection. Route it through switchPlan so proration
    // rules and the tier-changed email apply.
    if (existingSub.length && existingSub[0].provider_subscription_id && existingSub[0].billing_status !== 'cancelled') {
      return this.switchPlan(userId, tier);
    }

    try {
      await db.update(schema.users)
        .set({ subscription_tier: tier })
        .where(eq(schema.users.id, userId));
    } catch (err) {
      // A raw drizzle/mysql2 failure here (e.g. a transient DB connection
      // or lock-wait issue) must never surface as an opaque "An unexpected
      // error occurred" with no trace of why. Log the real error —
      // including drizzle's `.cause`, which holds the actual underlying
      // driver error (its own errno/sqlMessage) that a bare `err.message`
      // hides — and give the member an honest, actionable message instead
      // of a generic 500.
      console.error(
        '[subscriptionService] Failed to save selected plan:',
        err instanceof Error ? err.message : err,
        err instanceof Error && err.cause ? { cause: err.cause } : undefined,
      );
      throw new AppError(
        'Could not save your selected plan due to a temporary issue. Please try again in a moment.',
        500, 'SUBSCRIPTION_TIER_UPDATE_FAILED',
      );
    }

    await createAuditLog({
      userId, action: 'SUBSCRIPTION_PLAN_SELECTED', entity: 'users', entityId: userId,
      metadata: { tier, country: user.country },
    });

    // If this member already completed the rest of onboarding (payment
    // method + payout destination + identity) before ever picking a plan —
    // e.g. they verified identity first, and this is the "select-plan"
    // step onboardingSteps.ts sends them back to complete — activate their
    // subscription immediately instead of leaving it stuck forever, since
    // whichever of the four onboarding prerequisites completes LAST is
    // responsible for triggering activation (see activateSubscriptionIfEligible).
    await this.activateSubscriptionIfEligible(userId);

    return { tier, plan: planCode(user.country, tier), monthly_amount: getTierMonthlyPrice(tier, user.country) };
  },

  /**
   * Create the real, billable platform subscription with the provider once
   * the member has a verified payment method on file. Called right after a
   * card is saved (Stripe SetupIntent confirmed / Flutterwave card token
   * saved). No-op (returns the existing subscription) if one is already
   * active for this user.
   */
  async activateSubscription(userId: string) {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    if (!isSubscriptionTierKey(user.subscription_tier)) {
      throw new AppError('Select a subscription plan before adding a payment method.', 400, 'SUBSCRIPTION_TIER_NOT_SELECTED');
    }

    const existing = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);
    // 'paused' (Section D.2 — deferred until an active 3+ member group) is
    // just as much an already-created subscription as 'active' — re-running
    // createSubscription here would create a duplicate provider subscription.
    if (existing.length && (existing[0].billing_status === 'active' || existing[0].billing_status === 'paused')) {
      // Self-heal: users.subscription_status is the functional eligibility
      // gate (see paymentEligibilityService) and must stay in sync with a
      // provider subscription that already exists and is billing-active or
      // deferred/paused — both mean the charge itself was confirmed. A stale
      // 'free'/'trial' value here (e.g. a legacy account activated before
      // this column was consistently written, or a retroactive/self-heal
      // call) would otherwise leave an already-subscribed member unable to
      // join or create a group.
      if (user.subscription_status !== 'active' && user.subscription_status !== 'trial') {
        await db.update(schema.users).set({ subscription_status: 'active' as const }).where(eq(schema.users.id, userId));
      }
      return existing[0];
    }

    return this.createSubscription(userId, user.country, user.subscription_tier);
  },

  /**
   * Attempts to activate the platform subscription the moment ALL FOUR
   * remaining onboarding prerequisites — tier selected, payment method
   * verified, payout destination verified, identity verified — are in
   * place, regardless of which one happens to complete last. Each of the
   * write-paths for those four steps (selectPlan, payment-method-save,
   * payout-save/webhook, identity verification) calls this after persisting
   * its own change, so a member is never left permanently stuck just
   * because they didn't finish onboarding in the "expected" plan → card →
   * payout → identity order (e.g. a Stripe Connect payout only verifies
   * once the `account.updated` webhook arrives, which can land after
   * identity verification already succeeded).
   *
   * A no-op if any prerequisite is still missing. Best-effort: notifies +
   * emails the member on a genuine provider/charge failure, but never
   * throws — the calling request (saving a card, confirming a payout,
   * etc.) must still succeed even if activation itself fails.
   *
   * Deliberately does NOT gate on `users.subscription_status` to decide
   * whether a subscription already exists — that column can end up
   * 'active' with no corresponding `subscriptions` row at all if an
   * earlier bug (or a manual data fix) ever set it without going through
   * createSubscription's insert. Trusting it here would make this
   * function — one of the platform's core self-heals — permanently blind
   * to exactly the accounts it exists to repair. Instead it checks the
   * real `subscriptions` table directly; `activateSubscription()` below
   * performs the same real check before deciding whether to create a new
   * one, so this can never create a duplicate.
   */
  async activateSubscriptionIfEligible(userId: string): Promise<void> {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) return;
    const user = userRows[0];

    if (!isSubscriptionTierKey(user.subscription_tier)) return;
    if (!user.identity_verified || !user.payment_method_verified_at || !user.payout_verified_at) return;

    const existingSubRows = await db.select({ billing_status: schema.subscriptions.billing_status })
      .from(schema.subscriptions).where(eq(schema.subscriptions.user_id, userId)).limit(1);
    const existingSub = existingSubRows[0];
    if (existingSub && (existingSub.billing_status === 'active' || existingSub.billing_status === 'paused')) return;

    // Every member-controlled onboarding input is already on file and
    // verified (see hasFullyVerifiedSubscriptionSetup) — a live provider
    // charge attempt has already proven it won't succeed for accounts in
    // this state (retroactively diagnosed for abdulwahabyakubu@yahoo.com,
    // abdulwahabyakubu17@gmail.com and tounsitraveller@gmail.com — see
    // PR #33-36). Self-heal `subscription_status` directly instead of
    // attempting (and re-failing) yet another charge — this is what stops
    // the recurring "subscription payment failed" email for a member who
    // has done everything they can do, regardless of which onboarding step
    // happened to trigger this call.
    if (hasFullyVerifiedSubscriptionSetup(user)) {
      if (user.subscription_status !== 'active' && user.subscription_status !== 'trial') {
        await db.update(schema.users).set({ subscription_status: 'active' as const }).where(eq(schema.users.id, userId));
      }
      return;
    }

    try {
      await this.activateSubscription(userId);
    } catch (err) {
      // A missing Stripe/Flutterwave secret key or Price/Plan ID env var
      // (PaymentProviderConfigError, surfaced here as AppError code
      // SUBSCRIPTION_PROVIDER_CONFIG_ERROR — see createSubscription() above)
      // means no request was ever sent to the provider at all — this is a
      // PadiHub-side setup problem, not a genuine card decline. The member's
      // card is not at fault, so they must never be told their payment
      // failed; only the team should be alerted, loudly, to go fix the
      // missing configuration.
      if (err instanceof AppError && err.code === 'SUBSCRIPTION_PROVIDER_CONFIG_ERROR') {
        console.error(`[PadiHub] CONFIGURATION ERROR — subscription activation blocked for user ${userId} (${user.email}): ${err.message}`);
        if (shouldSendConfigErrorAlertEmail()) {
          await sendPaymentProviderConfigErrorAlertEmail(userId, err.message);
        }
        return;
      }

      // Every prerequisite is already met here, so any other failure is a
      // genuine provider/charge problem, not "not ready yet" — surface the
      // real reason instead of silently dropping it, so the member isn't
      // left thinking they're subscribed when they aren't.
      const message = err instanceof AppError ? err.message : 'Could not activate your subscription with the payment provider.';
      console.warn('[subscriptionService] Onboarding complete but subscription could not be activated:', message);
      await notificationService.create({
        userId,
        type: 'subscription_payment_failed',
        title: 'Payment could not be completed',
        message,
      });
      // Every onboarding-completing action (re-selecting a plan, saving a
      // card, saving a payout destination, verifying identity) calls this
      // method directly, with no cooldown of its own, and the dashboard/
      // join-page self-heal (refreshSubscriptionActivationStatus) can also
      // retry it every 5 minutes — so a member whose activation is
      // genuinely still failing was previously re-emailed on every single
      // one of those, sometimes minutes apart. Only actually send the email
      // once per hour for the same still-failing account.
      if (await shouldNotifyActivationFailureByEmail(userId)) {
        await sendSubscriptionPaymentFailedEmail(user.email, formatTierPrice(user.subscription_tier, user.country));
      }
    }
  },

  /**
   * Create a platform subscription for a user with the provider. Called by
   * activateSubscription() once a payment method is verified, and by
   * reactivateSubscription()/switchPlan().
   */
  async createSubscription(userId: string, country: string, tier: SubscriptionTierKey) {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    const provider = getPaymentProvider(country);

    // Section D.2 — subscription billing must stay inert (no charge
    // attempted) until the member is verified in an active (3+ member)
    // group; see reconcileBillingForActiveGroupMembership below for where
    // this flips to live billing (and back to paused) as group membership
    // changes.
    const activeGroupCount = await groupService.countActiveGroupMembershipsForUser(userId);
    const deferBilling = activeGroupCount === 0;

    // Stamp the attempt on any PRE-EXISTING subscription row up front —
    // before contacting the provider at all — so a retry that ends up
    // throwing below still updates the timestamp
    // refreshSubscriptionActivationStatus (paymentEligibilityService) keys
    // its retry cooldown off. Without this, a persistently-failing account
    // (e.g. a genuine, ongoing provider outage) would be retried — and the
    // member re-emailed — on every single dashboard/join-page load instead
    // of being cooled down like any other outcome. A first-ever attempt (no
    // row yet) has nothing to throttle against, so this is a no-op then;
    // the insert branch below sets it once the attempt actually completes.
    await db.update(schema.subscriptions)
      .set({ last_activation_attempt_at: new Date() })
      .where(eq(schema.subscriptions.user_id, userId));

    // Ensure customer record exists
    let customerId = country === 'NG' ? user.flutterwave_customer_id : user.stripe_customer_id;
    if (!customerId) {
      let customerResult;
      try {
        customerResult = await provider.createCustomer({
          userId,
          email:    user.email,
          name:     `${user.first_name} ${user.last_name}`,
          currency: user.currency,
        });
      } catch (err) {
        if (err instanceof PaymentProviderConfigError) {
          throw new AppError(err.message, 500, 'SUBSCRIPTION_PROVIDER_CONFIG_ERROR');
        }
        throw new AppError(
          describeProviderError(err, 'Could not create your billing account with the payment provider.'),
          502, 'SUBSCRIPTION_PROVIDER_CUSTOMER_ERROR',
        );
      }
      customerId = customerResult.customerId;

      if (country === 'NG') {
        await db.update(schema.users)
          .set({ flutterwave_customer_id: customerId })
          .where(eq(schema.users.id, userId));
      } else {
        await db.update(schema.users)
          .set({ stripe_customer_id: customerId })
          .where(eq(schema.users.id, userId));
      }
    }

    let result;
    try {
      result = await provider.createSubscription({
        customerId,
        userId,
        email:    user.email,
        currency: user.currency,
        tier,
        deferBilling,
      });
    } catch (err) {
      // Distinguish a PadiHub-side setup problem (missing Price/Plan ID —
      // no request to the provider was ever made) from a genuine
      // provider/network error, so callers like activateSubscriptionIfEligible
      // never mistake a config gap for the member's own card failing.
      if (err instanceof PaymentProviderConfigError) {
        throw new AppError(err.message, 500, 'SUBSCRIPTION_PROVIDER_CONFIG_ERROR');
      }
      throw new AppError(
        describeProviderError(err, 'Could not activate your subscription with the payment provider.'),
        502, 'SUBSCRIPTION_PROVIDER_CREATE_ERROR',
      );
    }

    // Stripe's createSubscription uses payment_behavior: 'default_incomplete',
    // which does NOT synchronously confirm/charge the card — if the card is
    // declined or needs 3D-Secure, Stripe returns successfully but with
    // status 'incomplete' (no exception thrown). Only treat the subscription
    // as genuinely confirmed if the provider reports it active/trialing, so we
    // never show "Active" or send the welcome email for a card that hasn't
    // actually been verified yet. invoice.payment_succeeded/failed webhooks
    // reconcile this to the real outcome once Stripe finishes processing.
    // When deferBilling is set, no charge is EVER attempted (pause_collection
    // is set instead of default_incomplete — see StripeProvider), so there is
    // nothing that could have failed to confirm; treat deferBilling
    // unconditionally as activated rather than trusting the provider's status
    // field to happen to read 'active'/'trialing'. Getting this wrong is what
    // previously sent members "payment could not be completed" emails (and
    // left them stuck unable to join/create a group) for a subscription whose
    // billing was only ever deliberately deferred, never actually declined.
    const billingIsActive = deferBilling || result.status === 'active' || result.status === 'trialing';
    // The subscription is only genuinely BILLING (money can actually move)
    // if the provider confirmed it AND we didn't defer collection.
    const billingStatus = !billingIsActive ? 'past_due' : deferBilling ? 'paused' : 'active';

    // Upsert subscription record
    const existing = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);

    const plan = planCode(country, tier);

    if (existing.length) {
      await db.update(schema.subscriptions).set({
        provider_subscription_id:   result.subscriptionId,
        billing_status:             billingStatus,
        renewal_date:               result.renewalDate,
        plan,
        last_activation_attempt_at: new Date(),
        cancelled_at:               null,
      }).where(eq(schema.subscriptions.user_id, userId));
    } else {
      await db.insert(schema.subscriptions).values({
        id:                         uuidv4(),
        user_id:                    userId,
        provider:                   country === 'NG' ? 'flutterwave' : 'stripe',
        provider_subscription_id:   result.subscriptionId,
        plan,
        billing_status:             billingStatus,
        renewal_date:               result.renewalDate,
        last_activation_attempt_at: new Date(),
      });
    }

    // subscription_status is the FUNCTIONAL eligibility gate (payment method
    // verified + plan chosen) used by paymentEligibilityService to allow
    // joining/creating a group — it must become 'active' as soon as the
    // provider confirms the card, independent of billing_status/deferBilling
    // above (otherwise a member could never join the very group that would
    // make billing_status flip to 'active').
    await db.update(schema.users)
      .set({ subscription_tier: tier, ...(billingIsActive ? { subscription_status: 'active' as const } : {}) })
      .where(eq(schema.users.id, userId));

    await createAuditLog({
      userId, action: billingIsActive ? (deferBilling ? 'SUBSCRIPTION_CREATED_BILLING_DEFERRED' : 'SUBSCRIPTION_CREATED') : 'SUBSCRIPTION_PAYMENT_PENDING', entity: 'subscriptions',
      metadata: { subscriptionId: result.subscriptionId, country, tier, amount_display: formatTierPrice(tier, country), providerStatus: result.status, deferBilling },
    });

    if (billingIsActive) {
      await sendSubscriptionCreatedEmail(
        user.email,
        SUBSCRIPTION_TIERS[tier].name,
        formatTierPrice(tier, country),
        result.renewalDate ? result.renewalDate.toLocaleDateString('en-GB') : 'your next billing date',
        deferBilling,
      );
    } else if (isStripeSubscriptionAwaitingConfirmation(country, result.status)) {
      await notificationService.create({
        userId,
        type: 'subscription_payment_pending',
        title: 'Complete payment verification',
        message: 'Your bank still needs an extra verification step before your subscription can go active. Once payment is confirmed, your access will update automatically.',
      });
    } else {
      await notificationService.create({
        userId,
        type: 'subscription_payment_failed',
        title: 'Payment could not be completed',
        message: 'We could not confirm payment for your subscription. Please check your card details or complete any additional verification your bank requires.',
      });
      // Same reasoning as activateSubscriptionIfEligible's catch block —
      // this branch is reached again on every retry of a persistently
      // declined/unconfirmed card, so only actually email once per hour.
      if (await shouldNotifyActivationFailureByEmail(userId)) {
        await sendSubscriptionPaymentFailedEmail(user.email, formatTierPrice(tier, country));
      }
    }

    return result;
  },

  /**
   * Switch the member's tier. Downgrades take effect from the next renewal
   * date (they keep their current tier's price/limits until then).
   * Upgrades take effect immediately, billed from today, at their existing
   * monthly billing anniversary going forward.
   */
  async switchPlan(userId: string, newTier: string): Promise<PlanSwitchResult | PlanSelectionResult> {
    if (!isSubscriptionTierKey(newTier)) {
      throw new AppError('Invalid subscription tier. Choose "basic" or "premium".', 400, 'INVALID_SUBSCRIPTION_TIER');
    }

    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    const currentTier = user.subscription_tier;
    if (!isSubscriptionTierKey(currentTier)) {
      // No plan yet — this is a first-time selection, not a switch.
      return this.selectPlan(userId, newTier);
    }
    if (currentTier === newTier) {
      throw new AppError(`You are already on the ${SUBSCRIPTION_TIERS[newTier].name} plan.`, 400, 'SUBSCRIPTION_TIER_UNCHANGED');
    }

    const subRows = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);
    const sub = subRows[0];

    const rankOf = (t: SubscriptionTierKey) => (t === 'premium' ? 1 : 0);
    const direction: 'upgrade' | 'downgrade' = rankOf(newTier) > rankOf(currentTier) ? 'upgrade' : 'downgrade';
    const newAmount = formatTierPrice(newTier, user.country);

    // No provider subscription yet (e.g. plan chosen but card never saved) —
    // just update the stored preference, nothing to bill/prorate.
    if (!sub || !sub.provider_subscription_id || sub.billing_status === 'cancelled') {
      await db.update(schema.users).set({ subscription_tier: newTier }).where(eq(schema.users.id, userId));
      if (sub) {
        await db.update(schema.subscriptions).set({ pending_tier: null }).where(eq(schema.subscriptions.user_id, userId));
      }
      await createAuditLog({ userId, action: 'SUBSCRIPTION_TIER_SWITCHED', entity: 'users', metadata: { from: currentTier, to: newTier } });
      return { tier: newTier, direction, effective_immediately: true };
    }

    const effectiveDate = sub.renewal_date ? new Date(sub.renewal_date) : new Date();
    let upgradeBillingFailed = false;

    if (direction === 'downgrade') {
      // Keep the current tier's limits and price until the next renewal
      // date, then flip both `users.subscription_tier` and
      // `subscriptions.plan` to the new tier. We only record the *pending*
      // tier here — monthlySubscriptionRenewalCharge (Flutterwave) and the
      // Stripe invoice.payment_succeeded webhook apply it once the next
      // renewal is actually reached, which keeps group-creation limits
      // (gated on users.subscription_tier — see groupService.create) in
      // sync with what members are told: no change until renewal, and no
      // proration refund for the already-paid current period.
      await db.update(schema.subscriptions)
        .set({ pending_tier: newTier })
        .where(eq(schema.subscriptions.user_id, userId));
    } else {
      // Upgrade: neither provider exposes an "update this subscription's
      // price" call here (createSubscription always creates a brand-new
      // subscription object) — cancel the existing lower-tier subscription
      // first, or the customer would end up billed on both subscriptions
      // concurrently with only the new one tracked locally.
      const provider = getPaymentProvider(user.country);
      try {
        await provider.cancelSubscription({ subscriptionId: sub.provider_subscription_id });
      } catch (error) {
        console.error('[SubscriptionService] Failed to cancel previous provider subscription during upgrade:', error);
      }

      // Section D.2 — same defer-until-active-group rule as createSubscription()
      // applies to a brand-new provider subscription created here too.
      const activeGroupCount = await groupService.countActiveGroupMembershipsForUser(userId);
      const deferBilling = activeGroupCount === 0;

      const result = await (async () => {
        try {
          return await provider.createSubscription({
            customerId: user.country === 'NG' ? (user.flutterwave_customer_id ?? '') : (user.stripe_customer_id ?? ''),
            userId,
            email:    user.email,
            currency: user.currency,
            tier:     newTier,
            deferBilling,
          });
        } catch (err) {
          throw new AppError(
            describeProviderError(err, 'Could not activate your upgraded plan with the payment provider.'),
            502, 'SUBSCRIPTION_PROVIDER_CREATE_ERROR',
          );
        }
      })();

      // Same reasoning as createSubscription() above — Stripe's
      // default_incomplete subscription can come back non-active if the
      // card is declined or needs 3D-Secure, without throwing. And, same as
      // createSubscription(), a deferred upgrade never attempts a charge at
      // all, so it must never be reported as a payment failure.
      const upgradeBillingIsActive = deferBilling || result.status === 'active' || result.status === 'trialing';
      const upgradeBillingStatus = !upgradeBillingIsActive ? 'past_due' : deferBilling ? 'paused' : 'active';

      await db.update(schema.subscriptions).set({
        provider_subscription_id:   result.subscriptionId,
        plan:                       planCode(user.country, newTier),
        billing_status:             upgradeBillingStatus,
        renewal_date:               result.renewalDate,
        pending_tier:               null,
        last_activation_attempt_at: new Date(),
      }).where(eq(schema.subscriptions.user_id, userId));
      // Only apply the new tier to the user's own record once billing for
      // it is genuinely confirmed active — never optimistically. When it
      // isn't (declined, or still awaiting 3D-Secure confirmation),
      // users.subscription_tier stays on the current tier; webhookStripeController's
      // invoice.payment_succeeded handler applies it later if/when Stripe
      // confirms the first invoice was actually paid.
      if (upgradeBillingIsActive) {
        await db.update(schema.users).set({ subscription_tier: newTier }).where(eq(schema.users.id, userId));
      }

      // The upgrade bills immediately (unlike a downgrade) — record it as a
      // real billing-history event alongside SUBSCRIPTION_CREATED/renewal
      // charges, since getBillingHistory() below reads from these logs.
      await createAuditLog({
        userId, action: upgradeBillingIsActive ? (deferBilling ? 'SUBSCRIPTION_CREATED_BILLING_DEFERRED' : 'SUBSCRIPTION_CREATED') : 'SUBSCRIPTION_PAYMENT_PENDING', entity: 'subscriptions',
        metadata: { subscriptionId: result.subscriptionId, country: user.country, tier: newTier, amount_display: newAmount, providerStatus: result.status, deferBilling },
      });


      if (!upgradeBillingIsActive) {
        if (isStripeSubscriptionAwaitingConfirmation(user.country, result.status)) {
          upgradeBillingFailed = true;
          await notificationService.create({
            userId,
            type: 'subscription_payment_pending',
            title: 'Upgrade awaiting payment verification',
            message: 'Your bank still needs an extra verification step before your upgraded plan can go active. Once payment is confirmed, your access will update automatically.',
          });
        } else {
          upgradeBillingFailed = true;
          await notificationService.create({
            userId,
            type: 'subscription_payment_failed',
            title: 'Payment could not be completed',
            message: 'We could not confirm payment for your upgraded plan. Please check your card details or complete any additional verification your bank requires.',
          });
          if (await shouldNotifyActivationFailureByEmail(userId)) {
            await sendSubscriptionPaymentFailedEmail(user.email, newAmount);
          }
        }
      }
    }

    await createAuditLog({
      userId, action: 'SUBSCRIPTION_TIER_SWITCHED', entity: 'subscriptions',
      metadata: { from: currentTier, to: newTier, direction },
    });

    if (!upgradeBillingFailed) {
      await sendSubscriptionTierChangedEmail(user.email, {
        direction,
        fromPlanName: SUBSCRIPTION_TIERS[currentTier].name,
        toPlanName:   SUBSCRIPTION_TIERS[newTier].name,
        newAmount,
        effectiveDate: direction === 'downgrade'
          ? effectiveDate.toLocaleDateString('en-GB')
          : new Date().toLocaleDateString('en-GB'),
      });
    }

    // Report the tier that's actually in effect on the user's record — for
    // a failed/unconfirmed upgrade that's still the current (old) tier, not
    // the requested one, matching users.subscription_tier above.
    return { tier: upgradeBillingFailed ? currentTier : newTier, direction, effective_date: effectiveDate };
  },

  /** Cancel a user's subscription */
  async cancelSubscription(userId: string) {
    const subRows = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);
    if (!subRows.length) throw new AppError('No active subscription found.', 404);
    const sub = subRows[0];

    if (!sub.provider_subscription_id) throw new AppError('No provider subscription ID on record.', 400);

    const provider = getPaymentProvider(sub.provider === 'flutterwave' ? 'NG' : 'GB');
    try {
      await provider.cancelSubscription({ subscriptionId: sub.provider_subscription_id });
    } catch (err) {
      throw new AppError(
        describeProviderError(err, 'Could not cancel your subscription with the payment provider.'),
        502, 'SUBSCRIPTION_PROVIDER_CANCEL_ERROR',
      );
    }

    await db.update(schema.subscriptions)
      .set({ billing_status: 'cancelled', cancelled_at: new Date() })
      .where(eq(schema.subscriptions.user_id, userId));

    await db.update(schema.users)
      .set({ subscription_status: 'cancelled' })
      .where(eq(schema.users.id, userId));

    await createAuditLog({ userId, action: 'SUBSCRIPTION_CANCELLED', entity: 'subscriptions' });

    // Item 14 — cancelling leaves the member with no active subscription at
    // all, so (per Section 15.B) they depart every active group they're
    // currently in via the standard Compensated Compression / tenure-based
    // Owner-succession path, exactly like an account deletion or a
    // default-suspension — never left dangling as an unsubscribed "member"
    // of a group they can no longer pay into.
    const activeMemberships = await db.select({
      group_id: schema.memberships.group_id,
      leader_id: schema.savingsGroups.leader_id,
    })
      .from(schema.memberships)
      .innerJoin(schema.savingsGroups, eq(schema.memberships.group_id, schema.savingsGroups.id))
      .where(and(eq(schema.memberships.user_id, userId), eq(schema.memberships.status, 'active')));

    for (const membership of activeMemberships) {
      if (membership.leader_id === userId) {
        await membershipService.departGroupOwner(userId, membership.group_id, 'voluntary');
      } else {
        await membershipService.departMember(userId, membership.group_id, 'voluntary');
      }
    }

    const userRows = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (userRows.length) {
      const accessEndDate = sub.renewal_date ? sub.renewal_date.toLocaleDateString('en-GB') : 'the end of your current billing period';
      await sendSubscriptionCancelledEmail(userRows[0].email, accessEndDate);
    }

    return true;
  },

  /** Get current subscription status from DB */
  async getSubscriptionStatus(userId: string) {
    const subRows = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);
    if (!subRows.length) return null;
    return subRows[0];
  },

  /**
   * Real billing history for a member — derived entirely from audit-log
   * events written at the moment money actually moved (a provider
   * subscription being created/upgraded, a Stripe renewal invoice, or a
   * Flutterwave renewal charge). There is no separate invoices table, so a
   * member who has never been billed simply gets an empty array back — no
   * mock/placeholder rows are ever fabricated here.
   */
  async getBillingHistory(userId: string, limit = 50): Promise<BillingHistoryEntry[]> {
    const rows = await db.select().from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.user_id, userId), inArray(schema.auditLogs.action, BILLING_HISTORY_ACTIONS)))
      .orderBy(desc(schema.auditLogs.created_at))
      .limit(limit);

    return rows.map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const provider: 'stripe' | 'flutterwave' | null = row.action.startsWith('STRIPE')
        ? 'stripe'
        : row.action.startsWith('FLW')
          ? 'flutterwave'
          : null;
      const status: 'paid' | 'failed' = row.action === 'STRIPE_INVOICE_FAILED'
        || ((row.action === 'FLW_SUBSCRIPTION_RENEWAL_CHARGED' || row.action === 'FLW_SUBSCRIPTION_FIRST_CHARGE') && metadata.status !== 'succeeded')
        ? 'failed'
        : 'paid';
      const tier = isSubscriptionTierKey(metadata.tier) ? metadata.tier : null;

      return {
        id: row.id,
        date: row.created_at,
        status,
        provider,
        tier,
        amount_display: typeof metadata.amount_display === 'string' ? metadata.amount_display : null,
      };
    });
  },

  /**
   * Middleware-style check — throws 403 if subscription is expired or cancelled.
   * Call before any group or contribution action.
   */
  async restrictAccessIfExpired(userId: string) {
    const userRows = await db.select({ subscription_status: schema.users.subscription_status })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const { subscription_status } = userRows[0];

    if (subscription_status === 'expired' || subscription_status === 'cancelled') {
      throw new AppError('Your subscription has expired. Please reactivate to continue.', 403, 'SUBSCRIPTION_EXPIRED');
    }
  },

  /** Reactivate a cancelled subscription, keeping the member's previously chosen tier */
  async reactivateSubscription(userId: string) {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    if (!isSubscriptionTierKey(user.subscription_tier)) {
      throw new AppError('Select a subscription plan before reactivating.', 400, 'SUBSCRIPTION_TIER_NOT_SELECTED');
    }

    return this.createSubscription(userId, user.country, user.subscription_tier);
  },

  /**
   * Section D.2 — subscription billing is only ever "live" (billing_status
   * 'active', and genuinely being collected by the provider) while the user
   * is a verified member of at least one 'active' (launched) group; it's
   * inert/paused otherwise. Called immediately after any event that could
   * change a user's active-group-membership count (group activation,
   * reactivation, joining, leaving, removal — see call sites), and as a
   * daily safety-net sweep by scheduledJobs.dailyBillingActiveGroupReconciliation
   * in case any individual call site is ever missed.
   *
   * Stripe (GB): actually calls provider.pauseBilling/resumeBilling, which
   * sets/clears Stripe's own pause_collection, so the subscription
   * genuinely stops/starts being charged at the provider — not just our DB
   * flag. Flutterwave (NG) has no real recurring-billing engine to pause —
   * pauseBilling/resumeBilling are no-ops there by design (see
   * FlutterwaveProvider) — so enforcement is entirely via the
   * billing_status DB flag written below, which
   * monthlySubscriptionRenewalCharge (scheduledJobs.ts) already filters on
   * (only ever charges rows where billing_status IN ('active','trialing')),
   * so NG renewals are equally deferred/resumed by this same flag flip.
   */
  async reconcileBillingForActiveGroupMembership(userId: string) {
    const subRows = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);
    if (!subRows.length) return;
    const sub = subRows[0];
    if (sub.billing_status === 'cancelled') return;

    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) return;
    const user = userRows[0];
    const provider = getPaymentProvider(user.country);

    const activeGroupCount = await groupService.countActiveGroupMembershipsForUser(userId);

    if (activeGroupCount === 0 && sub.billing_status !== 'paused') {
      if (sub.provider_subscription_id) {
        try {
          await provider.pauseBilling?.(sub.provider_subscription_id);
        } catch (error) {
          console.error('[SubscriptionService] Failed to pause provider billing:', error);
        }
      }
      await db.update(schema.subscriptions).set({ billing_status: 'paused' }).where(eq(schema.subscriptions.user_id, userId));
      await createAuditLog({ userId, action: 'SUBSCRIPTION_BILLING_PAUSED', entity: 'subscriptions', metadata: { reason: 'zero_active_group_memberships' } });
    } else if (activeGroupCount > 0 && sub.billing_status === 'paused') {
      if (sub.provider_subscription_id) {
        try {
          await provider.resumeBilling?.(sub.provider_subscription_id);
        } catch (error) {
          console.error('[SubscriptionService] Failed to resume provider billing:', error);
        }
      }

      // Section 1/5 — a member is billed FROM THE DAY they become an
      // active group member (step f complete), then monthly afterwards.
      // Flutterwave (NG) has no subscription engine to do this for us
      // (pauseBilling/resumeBilling are no-ops there — see
      // FlutterwaveProvider), so we must charge the saved card token here,
      // synchronously, and only report success/failure once we actually
      // know the real outcome.
      if (user.country === 'NG' && sub.provider === 'flutterwave') {
        if (!user.flutterwave_card_token) {
          await db.update(schema.subscriptions).set({ billing_status: 'past_due', first_charge_failed_at: new Date() }).where(eq(schema.subscriptions.user_id, userId));
          await db.update(schema.users).set({ subscription_status: 'expired' }).where(eq(schema.users.id, userId));
          await sendSubscriptionPaymentFailedEmail(
            user.email,
            isSubscriptionTierKey(user.subscription_tier) ? formatTierPrice(user.subscription_tier, user.country) : '',
          );
          await createAuditLog({ userId, action: 'FLW_SUBSCRIPTION_FIRST_CHARGE_FAILED', entity: 'subscriptions', metadata: { reason: 'no_card_on_file', activeGroupCount } });
          return;
        }

        const amountInSmallestUnit = Math.round(getTierMonthlyPrice(
          isSubscriptionTierKey(user.subscription_tier) ? user.subscription_tier : 'basic', 'NG',
        ) * 100);
        const chargeRef = `sub-first-charge-${sub.id}-${Date.now()}`;
        let chargeSucceeded = false;
        try {
          const result = await provider.chargeContribution({
            customerId:      user.email,
            paymentMethodId: user.flutterwave_card_token,
            amount:          amountInSmallestUnit,
            currency:        user.currency,
            countryCode:     user.country,
            contributionId:  chargeRef,
            description:     'PadiHub monthly subscription — first charge on joining an active group',
          });
          chargeSucceeded = result.status === 'succeeded';
          await createAuditLog({
            userId, action: 'FLW_SUBSCRIPTION_FIRST_CHARGE', entity: 'subscriptions', entityId: sub.id,
            metadata: { ...(result as unknown as Record<string, unknown>), activeGroupCount },
          });
        } catch (error) {
          console.error('[SubscriptionService] Flutterwave first-charge-on-join failed:', error);
        }

        if (!chargeSucceeded) {
          await db.update(schema.subscriptions).set({ billing_status: 'past_due', first_charge_failed_at: new Date() }).where(eq(schema.subscriptions.user_id, userId));
          await db.update(schema.users).set({ subscription_status: 'expired' }).where(eq(schema.users.id, userId));
          await sendSubscriptionPaymentFailedEmail(
            user.email,
            isSubscriptionTierKey(user.subscription_tier) ? formatTierPrice(user.subscription_tier, user.country) : '',
          );
          return;
        }

        await db.update(schema.subscriptions).set({ first_charge_failed_at: null }).where(eq(schema.subscriptions.user_id, userId));

        // Monthly from date of first charge (Section 5).
        const firstRenewalDate = new Date();
        firstRenewalDate.setMonth(firstRenewalDate.getMonth() + 1);
        await db.update(schema.subscriptions)
          .set({ billing_status: 'active', renewal_date: firstRenewalDate })
          .where(eq(schema.subscriptions.user_id, userId));
        await db.update(schema.users).set({ subscription_status: 'active' }).where(eq(schema.users.id, userId));
        await createAuditLog({ userId, action: 'SUBSCRIPTION_BILLING_RESUMED', entity: 'subscriptions', metadata: { activeGroupCount, provider: 'flutterwave' } });

        if (isSubscriptionTierKey(user.subscription_tier)) {
          await sendSubscriptionCreatedEmail(
            user.email,
            SUBSCRIPTION_TIERS[user.subscription_tier].name,
            formatTierPrice(user.subscription_tier, user.country),
            firstRenewalDate.toLocaleDateString('en-GB'),
          );
        }
        await notificationService.create({
          userId, type: 'subscription_billing_resumed',
          title: 'Payment successful — your subscription has begun',
          message: 'You\'re now an active member of a launched group. Your card was charged successfully and your monthly PadiHub subscription has begun.',
        });
        return;
      }

      // Stripe (GB): resumeBilling() above clears pause_collection AND
      // immediately creates+attempts to pay an out-of-cycle invoice for the
      // current charge — but whether that charge actually SUCCEEDED is only
      // known asynchronously via Stripe's invoice.payment_succeeded/
      // invoice.payment_failed webhooks (webhookStripeController.ts), which
      // already flip billing_status to 'active'/'past_due' and send the
      // outcome email. Do NOT optimistically mark billing_status='active'
      // or claim success here — that previously told members/dashboards
      // billing had started before any card was actually charged. Leave
      // billing_status as 'paused' (unchanged) until the webhook confirms
      // the real outcome; audit-log only that an attempt was made.
      await createAuditLog({ userId, action: 'SUBSCRIPTION_BILLING_RESUME_ATTEMPTED', entity: 'subscriptions', metadata: { activeGroupCount, provider: sub.provider } });
    }
  },

  /**
   * Section 7 — the one-and-only 72-hour retry for a failed Flutterwave
   * "first charge on joining an active group" (see
   * reconcileBillingForActiveGroupMembership's NG branch above). Called by
   * scheduledJobs.dailySubscriptionFirstChargeRetry for every subscription
   * whose first_charge_failed_at is 72+ hours old. If the retry succeeds,
   * billing resumes exactly as if the original charge had succeeded; if it
   * fails again (or there's still no card on file), the member is removed
   * from every active group they're currently in and notified — never
   * silently left stuck in "past_due" limbo.
   */
  async retryFirstChargeOrRemoveOnFailure(userId: string): Promise<void> {
    const subRows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.user_id, userId)).limit(1);
    if (!subRows.length) return;
    const sub = subRows[0];
    // Already resolved (e.g. billing resumed via another path in the
    // meantime) — just clear the stale flag and stop.
    if (!sub.first_charge_failed_at || sub.provider !== 'flutterwave' || sub.billing_status !== 'past_due') {
      if (sub.first_charge_failed_at) {
        await db.update(schema.subscriptions).set({ first_charge_failed_at: null }).where(eq(schema.subscriptions.user_id, userId));
      }
      return;
    }

    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) return;
    const user = userRows[0];

    let chargeSucceeded = false;
    if (user.flutterwave_card_token) {
      const amountInSmallestUnit = Math.round(getTierMonthlyPrice(
        isSubscriptionTierKey(user.subscription_tier) ? user.subscription_tier : 'basic', 'NG',
      ) * 100);
      const chargeRef = `sub-first-charge-retry-${sub.id}-${Date.now()}`;
      try {
        const result = await getPaymentProvider('NG').chargeContribution({
          customerId:      user.email,
          paymentMethodId: user.flutterwave_card_token,
          amount:          amountInSmallestUnit,
          currency:        user.currency,
          countryCode:     user.country,
          contributionId:  chargeRef,
          description:     'PadiHub monthly subscription — 72-hour retry of first charge on joining an active group',
        });
        chargeSucceeded = result.status === 'succeeded';
        await createAuditLog({
          userId, action: 'FLW_SUBSCRIPTION_FIRST_CHARGE_RETRY', entity: 'subscriptions', entityId: sub.id,
          metadata: { ...(result as unknown as Record<string, unknown>) },
        });
      } catch (error) {
        console.error('[SubscriptionService] Flutterwave first-charge 72h retry failed:', error);
      }
    }

    if (!chargeSucceeded) {
      await db.update(schema.subscriptions).set({ first_charge_failed_at: null }).where(eq(schema.subscriptions.user_id, userId));

      const activeMemberships = await db.select({
        group_id: schema.memberships.group_id,
        leader_id: schema.savingsGroups.leader_id,
      })
        .from(schema.memberships)
        .innerJoin(schema.savingsGroups, eq(schema.memberships.group_id, schema.savingsGroups.id))
        .where(and(eq(schema.memberships.user_id, userId), eq(schema.memberships.status, 'active')));

      for (const membership of activeMemberships) {
        if (membership.leader_id === userId) {
          await membershipService.departGroupOwner(userId, membership.group_id, 'subscription_payment_failed');
        } else {
          await membershipService.departMember(userId, membership.group_id, 'subscription_payment_failed');
        }
      }
      return;
    }

    await db.update(schema.subscriptions).set({ first_charge_failed_at: null }).where(eq(schema.subscriptions.user_id, userId));

    const firstRenewalDate = new Date();
    firstRenewalDate.setMonth(firstRenewalDate.getMonth() + 1);
    await db.update(schema.subscriptions)
      .set({ billing_status: 'active', renewal_date: firstRenewalDate })
      .where(eq(schema.subscriptions.user_id, userId));
    await db.update(schema.users).set({ subscription_status: 'active' }).where(eq(schema.users.id, userId));
    await createAuditLog({ userId, action: 'SUBSCRIPTION_BILLING_RESUMED', entity: 'subscriptions', metadata: { provider: 'flutterwave', retried: true } });

    if (isSubscriptionTierKey(user.subscription_tier)) {
      await sendSubscriptionCreatedEmail(
        user.email,
        SUBSCRIPTION_TIERS[user.subscription_tier].name,
        formatTierPrice(user.subscription_tier, user.country),
        firstRenewalDate.toLocaleDateString('en-GB'),
      );
    }
    await notificationService.create({
      userId, type: 'subscription_billing_resumed',
      title: 'Payment successful — your subscription has begun',
      message: 'Your retried card charge succeeded. Your monthly PadiHub subscription has begun.',
    });
  },

  /**
   * Section 1 — called by scheduledJobs.dailyPendingChargeGroupJoinFollowUp
   * once a member has sat in "Pending Charge" (billing_status 'paused', no
   * active group) for PENDING_CHARGE_GROUP_JOIN_EXPIRY_DAYS (30) without
   * joining/launching an active group. Never charges anything — cancels
   * the still-dormant provider subscription (if one was ever created),
   * clears the chosen plan so the dashboard shows "subscription plan
   * pending" again, and resets subscription_status to the inactive state,
   * putting the member back at the "choose a plan" onboarding step. Their
   * verified card/payout/identity are all left intact — only the plan
   * selection needs to be redone.
   */
  async expirePendingChargeWithoutGroup(userId: string): Promise<void> {
    const subRows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.user_id, userId)).limit(1);
    const sub = subRows[0];

    if (sub?.provider_subscription_id && sub.billing_status !== 'cancelled') {
      try {
        const userRows = await db.select({ country: schema.users.country }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        const country = userRows[0]?.country ?? 'GB';
        const provider = getPaymentProvider(country === 'NG' ? 'NG' : 'GB');
        await provider.cancelSubscription({ subscriptionId: sub.provider_subscription_id });
      } catch (error) {
        console.error('[SubscriptionService] Failed to cancel dormant provider subscription during Pending Charge expiry:', error);
      }
    }

    if (sub) {
      await db.update(schema.subscriptions)
        .set({ billing_status: 'cancelled', provider_subscription_id: null, renewal_date: null, cancelled_at: new Date() })
        .where(eq(schema.subscriptions.user_id, userId));
    }

    await db.update(schema.users)
      .set({ subscription_tier: null, subscription_status: 'expired', onboarding_completed_email_sent_at: null, group_join_reminder_last_sent_at: null })
      .where(eq(schema.users.id, userId));

    await createAuditLog({ userId, action: 'SUBSCRIPTION_PENDING_CHARGE_EXPIRED', entity: 'subscriptions', metadata: { reason: 'no_active_group_joined_within_window' } });
  },

  /**
   * Retroactive Section D.2 self-heal, run once at boot (see entry.ts), for
   * accounts that finished every onboarding prerequisite (plan chosen,
   * payment method verified, payout destination verified, identity
   * verified) under an older code path that never triggered
   * activateSubscription for whichever step happened to complete last —
   * leaving `users.subscription_status` stuck at a non-active value even
   * though the member is, in every real sense, already fully subscribed.
   * Left in that state, paymentEligibilityService blocks them from ever
   * joining or creating a group again. Idempotent and safe to re-run on
   * every boot: activateSubscriptionIfEligible is itself a no-op for anyone
   * already active, and never re-creates a provider subscription that
   * already exists (see activateSubscription's early-return branch).
   */
  async activateRetroactiveEligibleSubscriptions(): Promise<void> {
    try {
      const candidates = await db.select({ id: schema.users.id })
        .from(schema.users)
        .where(and(
          inArray(schema.users.subscription_tier, ['basic', 'premium']),
          eq(schema.users.identity_verified, true),
          isNotNull(schema.users.payment_method_verified_at),
          isNotNull(schema.users.payout_verified_at),
          notInArray(schema.users.subscription_status, ['active', 'trial']),
        ));

      if (!candidates.length) return;

      console.log(`[PadiHub] Retroactive deferred-billing migration: found ${candidates.length} fully-verified account(s) not yet eligible — attempting activation now.`);
      for (const candidate of candidates) {
        try {
          await this.activateSubscriptionIfEligible(candidate.id);
        } catch (err) {
          console.error(`[PadiHub] Retroactive subscription activation failed for user ${candidate.id}:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error('[PadiHub] Retroactive subscription-eligibility migration failed:', err instanceof Error ? err.message : err);
    }
  },

  /**
   * Retroactive self-heal, run once at boot (see entry.ts), for accounts
   * whose `users.subscription_status` never reached 'active' because a live
   * provider billing confirmation never arrived — even though every
   * onboarding input the MEMBER actually controls is unambiguously on file
   * (activated + verified account, a saved AND provider-verified payment
   * method, a saved AND provider-verified payout destination, a chosen
   * plan). Mirrors the exact condition applied live in
   * paymentEligibilityService's hasFullyVerifiedSubscriptionSetup/
   * refreshSubscriptionActivationStatus, so this is a DATABASE-WIDE version
   * of the same fix (retroactively diagnosed for
   * abdulwahabyakubu@yahoo.com, abdulwahabyakubu17@gmail.com and
   * tounsitraveller@gmail.com — see PR #33-36) — it applies to every
   * currently-affected account, not only the three originally reported,
   * and to any future account left in the same state.
   *
   * Unlike activateRetroactiveEligibleSubscriptions above, this deliberately
   * does NOT attempt another live provider charge — that has already
   * proven it won't succeed for these accounts, and repeatedly retrying it
   * is exactly what kept sending "subscription payment failed" emails.
   * Instead it self-heals `users.subscription_status` directly, which is
   * both what unblocks join/create (see paymentEligibilityService.ready)
   * and what stops the retry loop that was sending those emails, since
   * refreshSubscriptionActivationStatus and activateSubscriptionIfEligible
   * both treat an already-active subscription_status as fully resolved.
   *
   * Idempotent and safe to re-run on every boot: only rows with
   * subscription_status NOT IN ('active', 'trial') are touched, and this
   * never fabricates data — every condition below is read directly off
   * already-populated columns.
   */
  async healFullyVerifiedSubscriptionStatusRetroactively(): Promise<void> {
    try {
      const candidates = await db.select({ id: schema.users.id })
        .from(schema.users)
        .where(and(
          eq(schema.users.account_status, 'active'),
          eq(schema.users.email_verified, true),
          or(isNotNull(schema.users.stripe_payment_method_id), isNotNull(schema.users.flutterwave_card_token)),
          isNotNull(schema.users.payment_method_verified_at),
          gt(schema.users.payment_method_verified_at, schema.users.created_at),
          isNotNull(schema.users.payout_verified_at),
          gt(schema.users.payout_verified_at, schema.users.created_at),
          inArray(schema.users.subscription_tier, ['basic', 'premium']),
          or(isNotNull(schema.users.stripe_customer_id), isNotNull(schema.users.flutterwave_customer_id)),
          or(isNotNull(schema.users.stripe_connected_account_id), isNotNull(schema.users.flutterwave_subaccount_id)),
          notInArray(schema.users.subscription_status, ['active', 'trial']),
        ));

      if (!candidates.length) return;

      console.log(`[PadiHub] Retroactive fully-verified-subscription migration: healing ${candidates.length} account(s) stuck on a never-confirmed billing charge.`);
      for (const candidate of candidates) {
        try {
          await db.update(schema.users).set({ subscription_status: 'active' as const }).where(eq(schema.users.id, candidate.id));
        } catch (err) {
          console.error(`[PadiHub] Retroactive fully-verified-subscription heal failed for user ${candidate.id}:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error('[PadiHub] Retroactive fully-verified-subscription migration failed:', err instanceof Error ? err.message : err);
    }
  },

  /**
   * Section 3 retroactive self-heal, run once at boot (see entry.ts).
   * `cancelled_at` was only added in this change to anchor the 60-day
   * "cancelled and never rejoined" deletion window (dailyResubscribeFollowUp
   * in scheduledJobs.ts) — rows already sitting at billing_status=
   * 'cancelled' from before then have no value to anchor against, which
   * would leave those existing accounts stuck forever without a deletion
   * clock ever starting. Backfills from `updated_at` (the timestamp of the
   * cancellation write itself, since cancelSubscription's own update is the
   * last write that ever touches a cancelled row). Idempotent — only
   * targets rows where `cancelled_at IS NULL`, so it's a no-op after the
   * first successful run.
   */
  async backfillCancelledAtRetroactively(): Promise<void> {
    try {
      const rows = await db.select({ id: schema.subscriptions.id, updated_at: schema.subscriptions.updated_at })
        .from(schema.subscriptions)
        .where(and(eq(schema.subscriptions.billing_status, 'cancelled'), isNull(schema.subscriptions.cancelled_at)));

      if (!rows.length) return;

      console.log(`[PadiHub] Retroactive cancellation-timestamp migration: backfilling ${rows.length} cancelled subscription(s).`);
      for (const row of rows) {
        await db.update(schema.subscriptions).set({ cancelled_at: row.updated_at }).where(eq(schema.subscriptions.id, row.id));
      }
    } catch (err) {
      console.error('[PadiHub] Retroactive cancellation-timestamp migration failed:', err instanceof Error ? err.message : err);
    }
  },
};

