/**
 * Subscription service — manages platform subscriptions via Stripe (UK) or Flutterwave (NG).
 *
 * PadiHub has exactly two monthly-only tiers — Basic and Premium —
 * see SUBSCRIPTION_TIERS in ../lib/constants.ts for pricing and group limits.
 * There is no free trial and no annual billing option.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray, notInArray, isNotNull, desc } from 'drizzle-orm';
import axios from 'axios';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { getPaymentProvider } from '../integrations/payments/PaymentProviderFactory.js';
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
import {
  sendSubscriptionCreatedEmail,
  sendSubscriptionCancelledEmail,
  sendSubscriptionTierChangedEmail,
  sendSubscriptionPaymentFailedEmail,
  sendSubscriptionBillingResumedEmail,
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
  'FLW_SUBSCRIPTION_RENEWAL_CHARGED',
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
   */
  async activateSubscriptionIfEligible(userId: string): Promise<void> {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) return;
    const user = userRows[0];

    if (!isSubscriptionTierKey(user.subscription_tier)) return;
    if (!user.identity_verified || !user.payment_method_verified_at || !user.payout_verified_at) return;
    if (user.subscription_status === 'active' || user.subscription_status === 'trial') return;

    try {
      await this.activateSubscription(userId);
    } catch (err) {
      // Every prerequisite is already met here, so a failure is a genuine
      // provider/charge problem, not "not ready yet" — surface the real
      // reason instead of silently dropping it, so the member isn't left
      // thinking they're subscribed when they aren't.
      const message = err instanceof AppError ? err.message : 'Could not activate your subscription with the payment provider.';
      console.warn('[subscriptionService] Onboarding complete but subscription could not be activated:', message);
      await notificationService.create({
        userId,
        type: 'subscription_payment_failed',
        title: 'Payment could not be completed',
        message,
      });
      await sendSubscriptionPaymentFailedEmail(user.email, formatTierPrice(user.subscription_tier, user.country));
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
        provider_subscription_id: result.subscriptionId,
        billing_status:           billingStatus,
        renewal_date:             result.renewalDate,
        plan,
      }).where(eq(schema.subscriptions.user_id, userId));
    } else {
      await db.insert(schema.subscriptions).values({
        id:                       uuidv4(),
        user_id:                  userId,
        provider:                 country === 'NG' ? 'flutterwave' : 'stripe',
        provider_subscription_id: result.subscriptionId,
        plan,
        billing_status:           billingStatus,
        renewal_date:             result.renewalDate,
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
      await sendSubscriptionPaymentFailedEmail(user.email, formatTierPrice(tier, country));
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
        provider_subscription_id: result.subscriptionId,
        plan:                     planCode(user.country, newTier),
        billing_status:           upgradeBillingStatus,
        renewal_date:             result.renewalDate,
        pending_tier:             null,
      }).where(eq(schema.subscriptions.user_id, userId));
      await db.update(schema.users).set({ subscription_tier: newTier }).where(eq(schema.users.id, userId));

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
          await sendSubscriptionPaymentFailedEmail(user.email, newAmount);
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

    return { tier: newTier, direction, effective_date: effectiveDate };
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
      .set({ billing_status: 'cancelled' })
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
        || (row.action === 'FLW_SUBSCRIPTION_RENEWAL_CHARGED' && metadata.status !== 'succeeded')
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
      await db.update(schema.subscriptions).set({ billing_status: 'active' }).where(eq(schema.subscriptions.user_id, userId));
      await createAuditLog({ userId, action: 'SUBSCRIPTION_BILLING_RESUMED', entity: 'subscriptions', metadata: { activeGroupCount } });

      if (isSubscriptionTierKey(user.subscription_tier)) {
        await sendSubscriptionBillingResumedEmail(
          user.email,
          SUBSCRIPTION_TIERS[user.subscription_tier].name,
          formatTierPrice(user.subscription_tier, user.country),
          sub.renewal_date ? new Date(sub.renewal_date).toLocaleDateString('en-GB') : 'your next billing date',
        );
      }
      await notificationService.create({
        userId, type: 'subscription_billing_resumed',
        title: 'Billing has started',
        message: 'You\'re now an active member of a launched group — your PadiHub subscription billing has started.',
      });
    }
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
};

