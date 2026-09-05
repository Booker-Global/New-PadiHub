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
import { isSubscriptionTierKey, SUBSCRIPTION_TIERS, formatTierPrice, type SubscriptionTierKey } from '../lib/constants.js';
import { planCode, subscriptionService } from '../services/subscriptionService.js';
import { sendSubscriptionPaymentFailedEmail, sendSubscriptionBillingResumedEmail, sendSubscriptionRenewalChargedEmail } from '../integrations/email/emailService.js';

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
        email: schema.users.email,
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

      // Section D.2/1/5 — if billing_status was 'paused' immediately before
      // this event, this invoice IS the immediate first charge triggered by
      // StripeProvider.resumeBilling() the moment the member joined an
      // active (3+ member) group — as opposed to an ordinary monthly
      // renewal invoice. Capture that BEFORE overwriting billing_status
      // below, so the right confirmation email/renewal_date can be sent.
      const wasFirstChargeOnJoin = sub.billing_status === 'paused';
      const nextRenewalDate = wasFirstChargeOnJoin ? (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d;
      })() : null;

      await db.update(schema.users)
        .set({ subscription_status: 'active' })
        .where(eq(schema.users.id, sub.user_id));
      await db.update(schema.subscriptions)
        .set({ billing_status: 'active', ...(nextRenewalDate ? { renewal_date: nextRenewalDate } : {}) })
        .where(eq(schema.subscriptions.id, sub.id));

      // An upgrade's first invoice that needed 3D-Secure/extra confirmation
      // (or was otherwise not yet confirmed) deliberately leaves
      // users.subscription_tier unchanged until billing is genuinely
      // active — see subscriptionService.switchPlan's upgrade branch.
      // subscriptions.plan, however, already reflects the new tier (it's
      // set immediately, tied to the specific provider subscription object
      // just created for the upgrade). Now that Stripe confirms this
      // invoice was actually paid, apply it. Guarded on `!sub.pending_tier`
      // so this never fires for/collides with the separate
      // downgrade-at-renewal case handled just below.
      if (!sub.pending_tier) {
        const confirmedTier = tierFromPlanCode(sub.plan);
        if (confirmedTier && confirmedTier !== user.subscription_tier) {
          await db.update(schema.users).set({ subscription_tier: confirmedTier }).where(eq(schema.users.id, sub.user_id));
          await createAuditLog({ userId: sub.user_id, action: 'SUBSCRIPTION_TIER_SWITCHED', entity: 'subscriptions', entityId: sub.id, metadata: { from: user.subscription_tier, to: confirmedTier, confirmedAfter3ds: true } });
        }
      }

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
        userId: sub?.user_id, action: wasFirstChargeOnJoin ? 'STRIPE_SUBSCRIPTION_FIRST_CHARGE' : 'STRIPE_INVOICE_PAID', entity: 'subscriptions',
        metadata: {
          customerId, invoiceId: invoice.id,
          tier: tierFromPlanCode(sub?.plan),
          amount_display: formatInvoiceAmount(invoice.amount_paid, invoice.currency),
        },
      });

      // Item 8.d — every successful subscription charge (first charge on
      // joining an active group, and every ordinary monthly renewal after
      // it) must be confirmed by email so the member can see it reflected
      // in their Billing History. See webhookFlutterwaveController.ts /
      // scheduledJobs.ts's monthlySubscriptionRenewalCharge for the NG
      // equivalent.
      if (isSubscriptionTierKey(user.subscription_tier)) {
        const tierName = SUBSCRIPTION_TIERS[user.subscription_tier].name;
        const priceDisplay = formatInvoiceAmount(invoice.amount_paid, invoice.currency) || formatTierPrice(user.subscription_tier, user.country);
        if (wasFirstChargeOnJoin) {
          await sendSubscriptionBillingResumedEmail(
            user.email,
            tierName,
            priceDisplay,
            nextRenewalDate ? nextRenewalDate.toLocaleDateString('en-GB') : 'next month',
          );
        } else {
          await sendSubscriptionRenewalChargedEmail(
            user.email,
            tierName,
            priceDisplay,
            sub.renewal_date ? new Date(sub.renewal_date).toLocaleDateString('en-GB') : 'next month',
          );
        }
      }
      await notificationService.create({
        userId: sub.user_id,
        type: wasFirstChargeOnJoin ? 'subscription_billing_resumed' : 'subscription_payment_succeeded',
        title: wasFirstChargeOnJoin ? 'Billing has started' : 'Subscription renewed',
        message: wasFirstChargeOnJoin
          ? 'You\'re now an active member of a launched group — your PadiHub subscription billing has started.'
          : 'Your PadiHub subscription was renewed successfully.',
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
        email: schema.users.email,
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
        // Item 7 — a genuine failed charge attempt against a live (not
        // merely deferred) subscription is exactly the case a
        // payment-failure email is for.
        await sendSubscriptionPaymentFailedEmail(user.email, formatInvoiceAmount(invoice.amount_due, invoice.currency) ?? '');
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

      // Only ever SET payout_verified_at, never clear it. `account.updated`
      // fires on any change to the connected account — including Stripe's
      // periodic risk/requirements re-checks, or out-of-order webhook
      // delivery of a stale event — so charges_enabled/payouts_enabled can
      // legitimately (and temporarily) read false again long after the
      // member genuinely completed payout verification. Nulling the
      // timestamp here previously erased that completed onboarding step —
      // resetting the member's profile-completion percentage, re-blocking
      // them from joining/creating a group, and (via
      // activateSubscriptionIfEligible's eligibility gate) silently
      // no-opping their subscription activation retries — even though
      // nothing about their own payout setup had actually changed.
      if (verified) {
        await db.update(schema.users)
          .set({ payout_verified_at: new Date() })
          .where(eq(schema.users.stripe_connected_account_id, account.id));
      }

      await createAuditLog({
        action: 'STRIPE_ACCOUNT_UPDATED', entity: 'users',
        metadata: { accountId: account.id, chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled, verified },
      });

      // This webhook is the ONLY place a UK payout destination ever becomes
      // verified (Stripe Express onboarding has no synchronous confirmation
      // step), and it can easily arrive after identity verification already
      // succeeded — without this, a member whose payout confirmation lands
      // last would be stuck ineligible forever. No-op unless every other
      // onboarding prerequisite is already in place.
      if (verified) {
        const accountUserRows = await db.select({ id: schema.users.id })
          .from(schema.users).where(eq(schema.users.stripe_connected_account_id, account.id)).limit(1);
        if (accountUserRows.length) {
          await subscriptionService.activateSubscriptionIfEligible(accountUserRows[0].id);
        }
      }
      break;
    }

    default:
      // Unhandled event type — log and ignore
      console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
  }
}
