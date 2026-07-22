/**
 * Subscription service — manages platform subscriptions via Stripe (UK) or Flutterwave (NG).
 */
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { getPaymentProvider } from '../integrations/payments/PaymentProviderFactory.js';

export const subscriptionService = {
  /**
   * Create a platform subscription for a user after registration.
   * Called by authService after email verification.
   */
  async createSubscription(userId: string, country: string) {
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
    });

    // Upsert subscription record
    const existing = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);

    if (existing.length) {
      await db.update(schema.subscriptions).set({
        provider_subscription_id: result.subscriptionId,
        billing_status:           'trialing',
        renewal_date:             result.renewalDate,
        plan:                     country === 'NG' ? 'ng_monthly' : 'uk_monthly',
      }).where(eq(schema.subscriptions.user_id, userId));
    } else {
      await db.insert(schema.subscriptions).values({
        id:                       uuidv4(),
        user_id:                  userId,
        provider:                 country === 'NG' ? 'flutterwave' : 'stripe',
        provider_subscription_id: result.subscriptionId,
        plan:                     country === 'NG' ? 'ng_monthly' : 'uk_monthly',
        billing_status:           'trialing',
        renewal_date:             result.renewalDate,
      });
    }

    await createAuditLog({
      userId, action: 'SUBSCRIPTION_CREATED', entity: 'subscriptions',
      metadata: { subscriptionId: result.subscriptionId, country },
    });

    return result;
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

  /** Reactivate a cancelled subscription */
  async reactivateSubscription(userId: string) {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    // Create a fresh subscription via the provider
    return this.createSubscription(userId, user.country);
  },
};
