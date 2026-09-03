/**
 * Stripe webhook handler.
 * Endpoint must be publicly accessible — no authenticate middleware.
 * Raw body is required for signature verification; registered with express.raw().
 */
import type { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { getStripeProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { contributionService } from '../services/contributionService.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from '../services/notificationService.js';
import { isSubscriptionTierKey, type SubscriptionTierKey } from '../lib/constants.js';
import { planCode } from '../services/subscriptionService.js';

/** Recover the tier key ('basic'/'premium') from a stored plan code like 'gb_premium'. */
function tierFromPlanCode(plan?: string | null): SubscriptionTierKey | null {
  if (!plan) return null;
  if (plan.endsWith('_premium')) return 'premium';
  if (plan.endsWith('_basic')) return 'basic';
  return null;
}

/** Format a Stripe invoice's charged amount (minor units) using its own currency, e.g. "£4.99". */
function formatInvoiceAmount(amountMinorUnits: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof amountMinorUnits !== 'number' || !currency) return null;
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(amountMinorUnits / 100);
  } catch {
    return null;
  }
}

function stripeInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subId = (invoice as unknown as Record<string, unknown>).subscription;
  return typeof subId === 'string' ? subId : (subId as Stripe.Subscription | null)?.id ?? null;
}

export async function stripeWebhookHandler(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['stripe-signature'] as string;
  if (!signature) return res.status(400).json({ error: 'Missing stripe-signature header.' });

  let event: Stripe.Event;
  try {
    event = getStripeProvider().constructEvent(req.body as Buffer, signature);
  } catch (err) {
    console.error('[StripeWebhook] Signature verification failed:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed.' });
  }

  try {
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error('[StripeWebhook] Handler error:', err);
    next(err);
  }
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {

    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const contributionId = pi.metadata?.contribution_id;
      if (!contributionId) break;

      await contributionService.markPaid(contributionId, pi.id);
      await createAuditLog({
        action: 'STRIPE_PAYMENT_SUCCEEDED', entity: 'contributions',
        entityId: contributionId, metadata: { paymentIntentId: pi.id },
      });
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const contributionId = pi.metadata?.contribution_id;
      if (!contributionId) break;

      await contributionService.markFailed(contributionId);
      await createAuditLog({
        action: 'STRIPE_PAYMENT_FAILED', entity: 'contributions',
        entityId: contributionId, metadata: { paymentIntentId: pi.id },
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      const subIdStr = stripeInvoiceSubscriptionId(invoice);
      if (!customerId || !subIdStr) break;

      const subRows = await db.select().from(schema.subscriptions)
        .where(eq(schema.subscriptions.provider_subscription_id, subIdStr)).limit(1);
      const sub = subRows[0];
      if (!sub || sub.provider !== 'stripe') {
        console.log(`[StripeWebhook] Ignoring invoice.payment_succeeded for untracked subscription ${subIdStr}`);
        break;
      }

      const userRows = await db.select({
        id: schema.users.id,
        country: schema.users.country,
        subscription_tier: schema.users.subscription_tier,
        stripe_customer_id: schema.users.stripe_customer_id,
      }).from(schema.users).where(eq(schema.users.id, sub.user_id)).limit(1);
      const user = userRows[0];
      if (!user) break;
      if (user.stripe_customer_id && user.stripe_customer_id !== customerId) {
        console.warn(`[StripeWebhook] Ignoring invoice.payment_succeeded for subscription ${subIdStr} due to customer mismatch.`);
        break;
      }

      await db.update(schema.users)
        .set({ subscription_status: 'active' })
        .where(eq(schema.users.id, sub.user_id));
      await db.update(schema.subscriptions)
        .set({ billing_status: 'active' })
        .where(eq(schema.subscriptions.id, sub.id));

      // A mid-cycle downgrade request keeps the member on their current
      // tier's limits until this renewal — apply it now that the renewal
      // invoice has actually been paid. See subscriptionService's
      // switchPlan for where pending_tier is set.
      if (sub.pending_tier && isSubscriptionTierKey(sub.pending_tier) && sub.pending_tier !== user.subscription_tier) {
        const previousTier = user.subscription_tier;
        await db.update(schema.users).set({ subscription_tier: sub.pending_tier }).where(eq(schema.users.id, sub.user_id));
        await db.update(schema.subscriptions).set({ plan: planCode(user.country, sub.pending_tier), pending_tier: null }).where(eq(schema.subscriptions.id, sub.id));
        await createAuditLog({ userId: sub.user_id, action: 'SUBSCRIPTION_TIER_SWITCHED', entity: 'subscriptions', entityId: sub.id, metadata: { from: previousTier, to: sub.pending_tier, appliedAtRenewal: true } });
      }

      await createAuditLog({
        userId: sub?.user_id, action: 'STRIPE_INVOICE_PAID', entity: 'subscriptions',
        metadata: {
          customerId, invoiceId: invoice.id,
          tier: tierFromPlanCode(sub?.plan),
          amount_display: formatInvoiceAmount(invoice.amount_paid, invoice.currency),
        },
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      const subIdStr2 = stripeInvoiceSubscriptionId(invoice);
      if (!customerId || !subIdStr2) break;

      const subRows2 = await db.select().from(schema.subscriptions)
        .where(eq(schema.subscriptions.provider_subscription_id, subIdStr2)).limit(1);
      const subForFailedInvoice = subRows2[0];
      if (!subForFailedInvoice || subForFailedInvoice.provider !== 'stripe') {
        console.log(`[StripeWebhook] Ignoring invoice.payment_failed for untracked subscription ${subIdStr2}`);
        break;
      }

      const userRows = await db.select({
        id: schema.users.id,
        subscription_status: schema.users.subscription_status,
        stripe_customer_id: schema.users.stripe_customer_id,
      }).from(schema.users).where(eq(schema.users.id, subForFailedInvoice.user_id)).limit(1);
      const user = userRows[0];
      if (!user) break;
      if (user.stripe_customer_id && user.stripe_customer_id !== customerId) {
        console.warn(`[StripeWebhook] Ignoring invoice.payment_failed for subscription ${subIdStr2} due to customer mismatch.`);
        break;
      }

      const isInitialInvoiceFailure = invoice.billing_reason === 'subscription_create';
      const subscriptionAlreadyRecovered = isInitialInvoiceFailure && (
        subForFailedInvoice.billing_status === 'active'
        || user.subscription_status === 'active'
        || user.subscription_status === 'trial'
      );
      if (subscriptionAlreadyRecovered) {
        console.log(`[StripeWebhook] Ignoring stale initial invoice.payment_failed for already-active subscription ${subIdStr2}`);
        break;
      }

      await db.update(schema.subscriptions)
        .set({ billing_status: 'past_due' })
        .where(eq(schema.subscriptions.id, subForFailedInvoice.id));

      if (!isInitialInvoiceFailure) {
        await db.update(schema.users)
          .set({ subscription_status: 'expired' })
          .where(eq(schema.users.id, user.id));
      }

      const shouldNotifyUser = !isInitialInvoiceFailure && (
        subForFailedInvoice.billing_status === 'active'
        || subForFailedInvoice.billing_status === 'trialing'
        || subForFailedInvoice.billing_status === 'paused'
        || user.subscription_status === 'active'
        || user.subscription_status === 'trial'
      );
      if (shouldNotifyUser) {
        await notificationService.create({
          userId: user.id, type: 'subscription_payment_failed',
          title: 'Subscription Payment Failed',
          message: 'Your subscription payment failed. Please update your payment method to keep access.',
        });
      }

      await createAuditLog({
        userId: user.id, action: 'STRIPE_INVOICE_FAILED', entity: 'subscriptions',
        metadata: {
          customerId, invoiceId: invoice.id,
          tier: tierFromPlanCode(subForFailedInvoice?.plan),
          amount_display: formatInvoiceAmount(invoice.amount_due, invoice.currency),
          billing_reason: invoice.billing_reason,
          initial_invoice_ignored_for_access: isInitialInvoiceFailure,
        },
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await db.update(schema.subscriptions)
        .set({ billing_status: 'cancelled' })
        .where(eq(schema.subscriptions.provider_subscription_id, sub.id));

      await db.update(schema.users)
        .set({ subscription_status: 'cancelled' })
        .where(eq(schema.users.stripe_customer_id, typeof sub.customer === 'string' ? sub.customer : sub.customer.id));

      await createAuditLog({
        action: 'STRIPE_SUBSCRIPTION_DELETED', entity: 'subscriptions',
        metadata: { subscriptionId: sub.id },
      });
      break;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      const verified = Boolean(account.charges_enabled && account.payouts_enabled);

      await db.update(schema.users)
        .set({ payout_verified_at: verified ? new Date() : null })
        .where(eq(schema.users.stripe_connected_account_id, account.id));

      await createAuditLog({
        action: 'STRIPE_ACCOUNT_UPDATED', entity: 'users',
        metadata: { accountId: account.id, chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled, verified },
      });
      break;
    }

    default:
      // Unhandled event type — log and ignore
      console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
  }
}
