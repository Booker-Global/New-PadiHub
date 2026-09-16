/**
 * Stripe webhook handler.
 * Endpoint must be publicly accessible — no authenticate middleware.
 * Raw body is required for signature verification; registered with express.raw().
 */
import type { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { getStripeProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { contributionService } from '../services/contributionService.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from '../services/notificationService.js';
import { isSubscriptionTierKey, SUBSCRIPTION_TIERS, formatTierPrice, type SubscriptionTierKey } from '../lib/constants.js';
import { planCode } from '../services/subscriptionService.js';
import { getPaymentEligibility } from '../services/paymentEligibilityService.js';
import { sendSubscriptionCreatedEmail, sendSubscriptionPaymentFailedEmail, sendSubscriptionRenewalChargedEmail } from '../integrations/email/emailService.js';

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

/**
 * The service period this invoice covers (Stripe always includes `lines` on
 * an Invoice object, no expand needed) — for a subscription invoice, its
 * `period.end` IS the subscription's new `current_period_end`, i.e. the
 * date of the NEXT renewal after this one. Used to keep `subscriptions.
 * renewal_date` current on every successful charge (first charge AND
 * ordinary renewals) instead of it staying frozen at whatever value was
 * set at subscription creation — which is exactly what previously made
 * weeklySubscriptionHealthCheck's `renewal_date <= in7Days` reminder query
 * (and the "next billing date" shown in confirmation emails) go stale
 * after the very first renewal, since nothing advanced it from there.
 */
function nextRenewalDateFromInvoice(invoice: Stripe.Invoice): Date | null {
  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  return typeof periodEnd === 'number' ? new Date(periodEnd * 1000) : null;
}

/** mysql2's UPDATE result shape isn't typed by drizzle — same pattern used in rotationService/paymentEligibilityService for atomic claim-style updates. */
function extractAffectedRows(result: unknown): number {
  return (result as { affectedRows?: number }[])[0]?.affectedRows
    ?? (result as { affectedRows?: number }).affectedRows
    ?? 0;
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

    // Stripe fires BOTH of these for the exact same successful invoice
    // (invoice.paid is the modern/recommended one; invoice.payment_succeeded
    // is the older event still sent alongside it), and may redeliver either
    // one on retry — the idempotency guard just below (keyed on
    // last_processed_invoice_id) makes it safe to react to both without
    // double-sending confirmation emails/audit-log entries for the same
    // charge.
    case 'invoice.payment_succeeded':
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      const subIdStr = stripeInvoiceSubscriptionId(invoice);
      if (!customerId || !subIdStr) break;

      const subRows = await db.select().from(schema.subscriptions)
        .where(eq(schema.subscriptions.provider_subscription_id, subIdStr)).limit(1);
      const sub = subRows[0];
      if (!sub || sub.provider !== 'stripe') {
        console.log(`[StripeWebhook] Ignoring ${event.type} for untracked subscription ${subIdStr}`);
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
        console.warn(`[StripeWebhook] Ignoring ${event.type} for subscription ${subIdStr} due to customer mismatch.`);
        break;
      }

      // invoice.paid and invoice.payment_succeeded both fire for the same
      // successful charge, and either can be redelivered by Stripe on
      // retry — a plain "already processed?" read-then-write check has a
      // race window where two concurrent deliveries could both pass the
      // check before either commits its write. This is closed in two
      // steps:
      //  1. If THIS exact invoice was already fully processed (by
      //     whichever event/delivery got there first), there's nothing
      //     left to do — skip immediately.
      //  2. Otherwise, claim the subscription with an OPTIMISTIC-CONCURRENCY
      //     conditional UPDATE keyed on the value of
      //     last_processed_invoice_id as it was when `sub` was read above
      //     (not on invoiceId) — so if a DIFFERENT invoice for this same
      //     subscription is concurrently being processed by another
      //     delivery, only the one whose WHERE clause still matches at the
      //     instant it runs wins the claim (affectedRows > 0); the loser
      //     sees affectedRows === 0 and backs off, guaranteeing only one
      //     invoice is ever processed for a subscription at a time. Mirrors
      //     the existing atomic-claim pattern in
      //     rotationService.advanceIfCycleComplete/paymentEligibilityService.
      const invoiceId = invoice.id;
      const previouslyProcessedInvoiceId = sub.last_processed_invoice_id ?? null;
      if (invoiceId && previouslyProcessedInvoiceId === invoiceId) {
        console.log(`[StripeWebhook] Ignoring ${event.type} — invoice ${invoiceId} already processed for subscription ${subIdStr}.`);
        break;
      }

      let claimedThisInvoice = true;
      if (invoiceId) {
        const claimResult = await db.update(schema.subscriptions)
          .set({ last_processed_invoice_id: invoiceId })
          .where(and(
            eq(schema.subscriptions.id, sub.id),
            previouslyProcessedInvoiceId === null
              ? isNull(schema.subscriptions.last_processed_invoice_id)
              : eq(schema.subscriptions.last_processed_invoice_id, previouslyProcessedInvoiceId),
          ));
        claimedThisInvoice = extractAffectedRows(claimResult) > 0;
      }
      if (!claimedThisInvoice) {
        console.log(`[StripeWebhook] Ignoring ${event.type} — invoice ${invoiceId} — subscription ${subIdStr} was concurrently claimed for a different update.`);
        break;
      }

      // Everything below this point is the actual "processing" of the
      // claimed invoice (tier switches, audit logs, emails, notifications).
      // The claim above only proves NO OTHER concurrent delivery is also
      // processing this invoice right now — it does not by itself mean
      // processing will succeed. If any of the following throws (a
      // transient DB error, etc.), the claim must be rolled back so that
      // Stripe's automatic retry of this same event can actually finish
      // the job, instead of the retry seeing `claimedThisInvoice` already
      // set and silently skipping a charge that was never fully
      // communicated to the member.
      try {
        // Stripe's `billing_reason` distinguishes a brand-new subscription's
        // very first invoice ('subscription_create') from an ordinary
        // recurring renewal ('subscription_cycle') — mirrors the same check
        // already used in the invoice.payment_failed case below. USUALLY the
        // initial invoice for every subscription created by this codebase
        // (group launch first charge, or switchPlan's upgrade
        // recreate-subscription) is already paid off-session SYNCHRONOUSLY by
        // StripeProvider.createSubscription() before it ever returns (see
        // there), in which case subscriptionService.createSubscription()/
        // switchPlan() already updated billing_status/subscription_status and
        // sent the member their "subscription created"/"plan changed"
        // email/audit-log entry the moment that synchronous call resolved —
        // this webhook event for that same invoice then arrives strictly
        // AFTER the outcome is already known and communicated, so re-sending
        // a second confirmation email or logging a second
        // BILLING_HISTORY_ACTIONS entry (double-counting the same charge in
        // admin revenue/Billing History) must be avoided.
        //
        // However, `default_incomplete` subscriptions whose synchronous
        // invoices.pay() attempt did NOT resolve to active/trialing (SCA/3DS
        // required, or the off-session attempt was otherwise deferred) are
        // left `past_due` locally with no confirmation sent — Stripe only
        // confirms the charge LATER, asynchronously, via this very webhook.
        // `wasAlreadyActiveBeforeThisWebhook` (captured from `sub` as loaded
        // above, i.e. BEFORE the updates below) distinguishes that case: if
        // the subscription wasn't already active before this event arrived,
        // this webhook is the FIRST confirmation the member ever gets, so it
        // must send the email/notification/billing-history entry itself,
        // regardless of billing_reason.
        const isInitialInvoiceCharge = invoice.billing_reason === 'subscription_create';
        const wasAlreadyActiveBeforeThisWebhook = sub.billing_status === 'active';
        const nextRenewalDate = nextRenewalDateFromInvoice(invoice);

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

        if (isInitialInvoiceCharge) {
          // Already confirmed/communicated synchronously by
          // subscriptionService.createSubscription() at creation time —
          // nothing left to do here.
          if (wasAlreadyActiveBeforeThisWebhook) break;

          // Wasn't active before this event arrived, so THIS webhook is the
          // first time Stripe has confirmed the charge — send the same
          // "subscription created" confirmation createSubscription() would
          // have sent had the off-session charge resolved synchronously, and
          // log it under STRIPE_SUBSCRIPTION_FIRST_CHARGE (in
          // BILLING_HISTORY_ACTIONS) so it shows up in the member's Billing
          // History exactly like a synchronous first charge would have.
          await createAuditLog({
            userId: sub.user_id, action: 'STRIPE_SUBSCRIPTION_FIRST_CHARGE', entity: 'subscriptions',
            metadata: {
              customerId, invoiceId: invoice.id,
              tier: tierFromPlanCode(sub.plan),
              amount_display: formatInvoiceAmount(invoice.amount_paid, invoice.currency),
              confirmedAsynchronouslyViaWebhook: true,
            },
          });
          if (isSubscriptionTierKey(user.subscription_tier)) {
            try {
              await sendSubscriptionCreatedEmail(
                user.email,
                SUBSCRIPTION_TIERS[user.subscription_tier].name,
                formatInvoiceAmount(invoice.amount_paid, invoice.currency) || formatTierPrice(user.subscription_tier, user.country),
                sub.renewal_date ? new Date(sub.renewal_date).toLocaleDateString('en-GB') : 'your next billing date',
              );
            } catch (emailError) {
              console.error(`[StripeWebhook] Failed to send first-charge confirmation email to ${user.email} for subscription ${sub.id}:`, emailError);
            }
          }
          await notificationService.create({
            userId: sub.user_id,
            type: 'subscription_payment_succeeded',
            title: 'Payment successful — your subscription is active',
            message: 'Your card was charged successfully and your PadiHub subscription is now active.',
          });
          break;
        }

        await createAuditLog({
          userId: sub?.user_id, action: 'STRIPE_INVOICE_PAID', entity: 'subscriptions',
          metadata: {
            customerId, invoiceId: invoice.id,
            tier: tierFromPlanCode(sub?.plan),
            amount_display: formatInvoiceAmount(invoice.amount_paid, invoice.currency),
          },
        });

        // Item 8.d — every ordinary monthly renewal must be confirmed by
        // email so the member can see it reflected in their Billing History
        // (the first charge on a brand-new subscription is confirmed
        // synchronously by createSubscription()/switchPlan() instead — see
        // above). See webhookFlutterwaveController.ts /
        // scheduledJobs.ts's monthlySubscriptionRenewalCharge for the NG
        // equivalent.
        if (isSubscriptionTierKey(user.subscription_tier)) {
          const tierName = SUBSCRIPTION_TIERS[user.subscription_tier].name;
          const priceDisplay = formatInvoiceAmount(invoice.amount_paid, invoice.currency) || formatTierPrice(user.subscription_tier, user.country);
          try {
            await sendSubscriptionRenewalChargedEmail(
              user.email,
              tierName,
              priceDisplay,
              // `nextRenewalDate` (this invoice's period end, i.e. the
              // UPCOMING renewal after this one) — not `sub.renewal_date`,
              // which is the date THIS renewal was originally due and is
              // now in the past.
              nextRenewalDate ? nextRenewalDate.toLocaleDateString('en-GB') : 'next month',
            );
          } catch (emailError) {
            console.error(`[StripeWebhook] Failed to send subscription charge confirmation email to ${user.email} for subscription ${sub.id}:`, emailError);
          }
        }
        await notificationService.create({
          userId: sub.user_id,
          type: 'subscription_payment_succeeded',
          title: 'Subscription renewed',
          message: 'Your PadiHub subscription was renewed successfully.',
        });
      } catch (processingError) {
        // Roll back the claim so a Stripe retry of this same event can
        // still complete the (failed) processing, instead of the retry
        // seeing this invoice as already claimed and silently skipping it
        // — leaving the member's billing status/confirmation/history
        // permanently incomplete for a charge that genuinely succeeded.
        // Conditional on the row STILL holding the invoiceId we ourselves
        // claimed: if a later, unrelated successful webhook has already
        // moved this subscription on to a newer invoice by the time this
        // catch runs, that newer claim must not be clobbered.
        if (invoiceId) {
          await db.update(schema.subscriptions)
            .set({ last_processed_invoice_id: previouslyProcessedInvoiceId })
            .where(and(
              eq(schema.subscriptions.id, sub.id),
              eq(schema.subscriptions.last_processed_invoice_id, invoiceId),
            ));
        }
        throw processingError;
      }
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
      // getPaymentEligibility's eligibility gate) silently no-opping their
      // onboarding-completion retries — even though nothing about their own
      // payout setup had actually changed.
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
      // last would be stuck without onboarding ever finalizing. No-op
      // (via finalizeOnboardingIfNeeded's own guard) unless every other
      // onboarding prerequisite is already in place; never triggers billing
      // (see Part C of the onboarding spec).
      if (verified) {
        const accountUserRows = await db.select({ id: schema.users.id })
          .from(schema.users).where(eq(schema.users.stripe_connected_account_id, account.id)).limit(1);
        if (accountUserRows.length) {
          await getPaymentEligibility(accountUserRows[0].id);
        }
      }
      break;
    }

    default:
      // Unhandled event type — log and ignore
      console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
  }
}
