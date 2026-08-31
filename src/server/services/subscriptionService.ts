/**
 * Subscription service — manages platform subscriptions via Stripe (UK) or Flutterwave (NG).
 *
 * PadiHub has exactly two monthly-only tiers — Pro Group and Elite Group —
 * see SUBSCRIPTION_TIERS in ../lib/constants.ts for pricing and group limits.
 * There is no free trial and no annual billing option.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { getPaymentProvider } from '../integrations/payments/PaymentProviderFactory.js';
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
} from '../integrations/email/emailService.js';

export function planCode(country: string, tier: SubscriptionTierKey): string {
  return `${country === 'NG' ? 'ng' : 'gb'}_${tier}`;
}

type PlanSelectionResult = { tier: SubscriptionTierKey; plan: string; monthly_amount: number };
type PlanSwitchResult = {
  tier: SubscriptionTierKey;
  direction: 'upgrade' | 'downgrade';
  effective_immediately?: boolean;
  effective_date?: Date;
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
      throw new AppError('Invalid subscription tier. Choose "pro" or "elite".', 400, 'INVALID_SUBSCRIPTION_TIER');
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

    await db.update(schema.users)
      .set({ subscription_tier: tier })
      .where(eq(schema.users.id, userId));

    await createAuditLog({
      userId, action: 'SUBSCRIPTION_PLAN_SELECTED', entity: 'users', entityId: userId,
      metadata: { tier, country: user.country },
    });

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
    if (existing.length && existing[0].billing_status === 'active') {
      return existing[0];
    }

    return this.createSubscription(userId, user.country, user.subscription_tier);
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

    // Ensure customer record exists
    let customerId = country === 'NG' ? user.flutterwave_customer_id : user.stripe_customer_id;
    if (!customerId) {
      const customerResult = await provider.createCustomer({
        userId,
        email:    user.email,
        name:     `${user.first_name} ${user.last_name}`,
        currency: user.currency,
      });
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

    const result = await provider.createSubscription({
      customerId,
      userId,
      email:    user.email,
      currency: user.currency,
      tier,
    });

    // Upsert subscription record
    const existing = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);

    const plan = planCode(country, tier);

    if (existing.length) {
      await db.update(schema.subscriptions).set({
        provider_subscription_id: result.subscriptionId,
        billing_status:           'active',
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
        billing_status:           'active',
        renewal_date:             result.renewalDate,
      });
    }

    await db.update(schema.users)
      .set({ subscription_tier: tier, subscription_status: 'active' })
      .where(eq(schema.users.id, userId));

    await createAuditLog({
      userId, action: 'SUBSCRIPTION_CREATED', entity: 'subscriptions',
      metadata: { subscriptionId: result.subscriptionId, country, tier },
    });

    await sendSubscriptionCreatedEmail(
      user.email,
      SUBSCRIPTION_TIERS[tier].name,
      formatTierPrice(tier, country),
      result.renewalDate ? result.renewalDate.toLocaleDateString('en-GB') : 'your next billing date',
    );

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
      throw new AppError('Invalid subscription tier. Choose "pro" or "elite".', 400, 'INVALID_SUBSCRIPTION_TIER');
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

    const rankOf = (t: SubscriptionTierKey) => (t === 'elite' ? 1 : 0);
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

      const result = await provider.createSubscription({
        customerId: user.country === 'NG' ? (user.flutterwave_customer_id ?? '') : (user.stripe_customer_id ?? ''),
        userId,
        email:    user.email,
        currency: user.currency,
        tier:     newTier,
      });
      await db.update(schema.subscriptions).set({
        provider_subscription_id: result.subscriptionId,
        plan:                     planCode(user.country, newTier),
        billing_status:           'active',
        renewal_date:             result.renewalDate,
        pending_tier:             null,
      }).where(eq(schema.subscriptions.user_id, userId));
      await db.update(schema.users).set({ subscription_tier: newTier }).where(eq(schema.users.id, userId));
    }

    await createAuditLog({
      userId, action: 'SUBSCRIPTION_TIER_SWITCHED', entity: 'subscriptions',
      metadata: { from: currentTier, to: newTier, direction },
    });

    await sendSubscriptionTierChangedEmail(user.email, {
      direction,
      fromPlanName: SUBSCRIPTION_TIERS[currentTier].name,
      toPlanName:   SUBSCRIPTION_TIERS[newTier].name,
      newAmount,
      effectiveDate: direction === 'downgrade'
        ? effectiveDate.toLocaleDateString('en-GB')
        : new Date().toLocaleDateString('en-GB'),
    });

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
    await provider.cancelSubscription({ subscriptionId: sub.provider_subscription_id });

    await db.update(schema.subscriptions)
      .set({ billing_status: 'cancelled' })
      .where(eq(schema.subscriptions.user_id, userId));

    await db.update(schema.users)
      .set({ subscription_status: 'cancelled' })
      .where(eq(schema.users.id, userId));

    await createAuditLog({ userId, action: 'SUBSCRIPTION_CANCELLED', entity: 'subscriptions' });

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
};
