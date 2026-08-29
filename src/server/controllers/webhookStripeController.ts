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
      if (!customerId) break;

      await db.update(schema.users)
        .set({ subscription_status: 'active' })
        .where(eq(schema.users.stripe_customer_id, customerId));

      const subId = (invoice as unknown as Record<string, unknown>).subscription;
      const subIdStr = typeof subId === 'string' ? subId : (subId as Stripe.Subscription | null)?.id ?? '';
      if (subIdStr) {
        await db.update(schema.subscriptions)
          .set({ billing_status: 'active' })
          .where(eq(schema.subscriptions.provider_subscription_id, subIdStr));
      }

      await createAuditLog({
        action: 'STRIPE_INVOICE_PAID', entity: 'subscriptions',
        metadata: { customerId, invoiceId: invoice.id },
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      await db.update(schema.users)
        .set({ subscription_status: 'expired' })
        .where(eq(schema.users.stripe_customer_id, customerId));

      const subId2 = (invoice as unknown as Record<string, unknown>).subscription;
      const subIdStr2 = typeof subId2 === 'string' ? subId2 : (subId2 as Stripe.Subscription | null)?.id ?? '';
      if (subIdStr2) {
        await db.update(schema.subscriptions)
          .set({ billing_status: 'past_due' })
          .where(eq(schema.subscriptions.provider_subscription_id, subIdStr2));
      }

      // Notify the user
      const userRows = await db.select({ id: schema.users.id })
        .from(schema.users).where(eq(schema.users.stripe_customer_id, customerId)).limit(1);
      if (userRows.length) {
        await notificationService.create({
          userId: userRows[0].id, type: 'subscription_payment_failed',
          title: 'Subscription Payment Failed',
          message: 'Your subscription payment failed. Please update your payment method to keep access.',
        });
      }

      await createAuditLog({
        action: 'STRIPE_INVOICE_FAILED', entity: 'subscriptions',
        metadata: { customerId, invoiceId: invoice.id },
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
