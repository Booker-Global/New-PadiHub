/**
 * Subscription service — manages platform subscriptions via Stripe (UK) or Flutterwave (NG).
 *
 * PadiHub has exactly two monthly-only tiers — Basic and Premium —
 * see SUBSCRIPTION_TIERS in ../lib/constants.ts for pricing and group limits.
 * There is no free trial and no annual billing option.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray, isNull, desc } from 'drizzle-orm';
import axios from 'axios';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { getPaymentProvider, getStripeProvider } from '../integrations/payments/PaymentProviderFactory.js';
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
import {
  sendSubscriptionCreatedEmail,
  sendSubscriptionCancelledEmail,
  sendSubscriptionTierChangedEmail,
  sendSubscriptionPaymentFailedEmail,
  sendSubscriptionRenewalChargedEmail,
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
 * more than once per hour for the same member — see createSubscription's
 * catch block below. */
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
 * EVERY member's activation attempt at once, not just one account. A simple
 * in-process timestamp is enough here (and deliberately resets on every
 * deploy/restart, which is exactly when a just-fixed or just-introduced env
 * var problem should be re-alerted on if it recurs).
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
type CreateSubscriptionOptions = {
  suppressCreatedEmail?: boolean;
};

/**
 * Audit-log actions that represent a real billing/payment event for a
 * member. Exported so adminController.dashboard() can compute actual
 * platform revenue from the same source of truth used by member-facing
 * Billing History, rather than a separate/duplicated action list.
 */
export const BILLING_HISTORY_ACTIONS = [
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

/**
 * Flutterwave (NG) has no recurring-billing engine — its
 * FlutterwaveProvider.createSubscription() is a pure bookkeeping stub that
 * NEVER actually charges the card (see its own doc comment) and always
 * reports status 'active', so it must NEVER be routed through the shared
 * createSubscription() above, which would treat that stub status as a
 * confirmed charge and mark `users.subscription_status` active before any
 * money has actually moved. This is the one and only path that creates a
 * member's very first Flutterwave subscription (called from
 * reconcileBillingForActiveGroupMembership once they're a verified member
 * of a launched group): it creates the bookkeeping subscription row
 * `past_due` (not yet billed), then synchronously charges the member's
 * saved card token — only flipping to `active` once that charge genuinely
 * succeeds. A failed charge here is picked up by
 * retryFirstChargeOrRemoveOnFailure's 72-hour retry (scheduledJobs.
 * dailySubscriptionFirstChargeRetry), exactly like a renewal charge that
 * fails after the first has already succeeded.
 */
async function chargeFirstFlutterwaveSubscription(
  userId: string,
  user: typeof schema.users.$inferSelect,
  tier: SubscriptionTierKey,
  activeGroupCount: number,
): Promise<void> {
  const provider = getPaymentProvider('NG');

  let customerId = user.flutterwave_customer_id;
  if (!customerId) {
    let customerResult;
    try {
      customerResult = await provider.createCustomer({
        userId, email: user.email, name: `${user.first_name} ${user.last_name}`, currency: user.currency,
      });
    } catch (err) {
      if (err instanceof PaymentProviderConfigError) {
        console.error(`[PadiHub] CONFIGURATION ERROR — Flutterwave subscription blocked for user ${userId} (${user.email}): ${err.message}`);
        if (shouldSendConfigErrorAlertEmail()) {
          await sendPaymentProviderConfigErrorAlertEmail(userId, err.message);
        }
        return;
      }
      console.error('[SubscriptionService] Could not create Flutterwave customer on group launch:', err instanceof Error ? err.message : err);
      return;
    }
    customerId = customerResult.customerId;
    await db.update(schema.users).set({ flutterwave_customer_id: customerId }).where(eq(schema.users.id, userId));
  }

  let providerSub;
  try {
    providerSub = await provider.createSubscription({
      customerId, userId, email: user.email, currency: user.currency, tier,
    });
  } catch (err) {
    if (err instanceof PaymentProviderConfigError) {
      console.error(`[PadiHub] CONFIGURATION ERROR — Flutterwave subscription blocked for user ${userId} (${user.email}): ${err.message}`);
      if (shouldSendConfigErrorAlertEmail()) {
        await sendPaymentProviderConfigErrorAlertEmail(userId, err.message);
      }
      return;
    }
    console.error('[SubscriptionService] Could not create Flutterwave subscription on group launch:', err instanceof Error ? err.message : err);
    return;
  }

  const subId = uuidv4();
  const plan = planCode('NG', tier);
  await db.insert(schema.subscriptions).values({
    id:                         subId,
    user_id:                    userId,
    provider:                   'flutterwave',
    provider_subscription_id:   providerSub.subscriptionId,
    plan,
    billing_status:             'past_due',
    last_activation_attempt_at: new Date(),
  });

  if (!user.flutterwave_card_token) {
    await db.update(schema.subscriptions).set({ first_charge_failed_at: new Date() }).where(eq(schema.subscriptions.user_id, userId));
    await createAuditLog({ userId, action: 'FLW_SUBSCRIPTION_FIRST_CHARGE_FAILED', entity: 'subscriptions', entityId: subId, metadata: { reason: 'no_card_on_file', activeGroupCount } });
    await notificationService.create({
      userId, type: 'subscription_payment_failed', title: 'Payment could not be completed',
      message: 'We could not confirm payment for your subscription. Please check your card details.',
    });
    await sendSubscriptionPaymentFailedEmail(user.email, formatTierPrice(tier, 'NG'));
    return;
  }

  const amountInSmallestUnit = Math.round(getTierMonthlyPrice(tier, 'NG') * 100);
  const chargeRef = `sub-first-charge-${subId}-${Date.now()}`;
  let chargeStatus: 'succeeded' | 'pending' | 'failed' = 'failed';
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
    chargeStatus = result.status;
    await createAuditLog({
      userId, action: 'FLW_SUBSCRIPTION_FIRST_CHARGE', entity: 'subscriptions', entityId: subId,
      metadata: { ...(result as unknown as Record<string, unknown>), activeGroupCount },
    });
  } catch (error) {
    console.error('[SubscriptionService] Flutterwave first-charge-on-join failed:', error);
  }

  if (chargeStatus === 'pending') {
    // Flutterwave is still confirming this charge asynchronously (e.g. extra
    // authentication in progress) — unlike a genuine failure, this must NOT
    // stamp first_charge_failed_at or tell the member payment failed, since
    // it may still succeed moments later via the charge.completed webhook
    // (see webhookFlutterwaveController.ts, which calls
    // confirmFlutterwaveSubscriptionCharge below to finalize
    // billing_status/emails/audit-log once Flutterwave reports the
    // definitive outcome). billing_status stays 'past_due' (as already
    // inserted above) so weeklySubscriptionHealthCheck still nags the
    // member if the webhook confirmation never arrives.
    await notificationService.create({
      userId, type: 'subscription_payment_processing', title: 'Payment is being processed',
      message: 'Your subscription payment is still being confirmed. We\'ll email you as soon as it goes through.',
    });
    return;
  }

  if (chargeStatus !== 'succeeded') {
    await db.update(schema.subscriptions).set({ first_charge_failed_at: new Date() }).where(eq(schema.subscriptions.user_id, userId));
    await notificationService.create({
      userId, type: 'subscription_payment_failed', title: 'Payment could not be completed',
      message: 'We could not confirm payment for your subscription. Please check your card details or complete any additional verification your bank requires.',
    });
    await sendSubscriptionPaymentFailedEmail(user.email, formatTierPrice(tier, 'NG'));
    return;
  }

  // Monthly from date of first charge.
  const firstRenewalDate = new Date();
  firstRenewalDate.setMonth(firstRenewalDate.getMonth() + 1);
  await db.update(schema.subscriptions)
    .set({ billing_status: 'active', renewal_date: firstRenewalDate, first_charge_failed_at: null })
    .where(eq(schema.subscriptions.user_id, userId));
  await db.update(schema.users).set({ subscription_status: 'active' }).where(eq(schema.users.id, userId));

  await sendSubscriptionCreatedEmail(
    user.email, SUBSCRIPTION_TIERS[tier].name, formatTierPrice(tier, 'NG'), firstRenewalDate.toLocaleDateString('en-GB'),
  );
  await notificationService.create({
    userId, type: 'subscription_billing_resumed',
    title: 'Payment successful — your subscription has begun',
    message: 'You\'re now an active member of a launched group. Your card was charged successfully and your monthly PadiHub subscription has begun.',
  });
}

/**
 * Finalizes a Flutterwave subscription first-charge/renewal once
 * Flutterwave's `charge.completed` webhook reports the definitive outcome
 * for a charge that came back `pending` synchronously (see
 * chargeFirstFlutterwaveSubscription and monthlySubscriptionRenewalCharge
 * in scheduledJobs.ts). `tx_ref` for these charges is never a real
 * `contributions.id` (format: `sub-first-charge-{subId}-{ts}` or
 * `sub-renewal-{subId}-{ts}`), so webhookFlutterwaveController must route
 * them here instead of contributionService.markPaid/markFailed. Returns
 * `true` if the tx_ref was recognized/handled (whether or not any state
 * actually changed) so the webhook can distinguish "not a subscription
 * charge, fall through to contribution handling" from "handled".
 *
 * Idempotent both ways: a success event is a no-op if billing_status is
 * already 'active' (already confirmed synchronously or by an earlier
 * webhook delivery); a failure event is a no-op if the synchronous attempt
 * already reported failure itself (first_charge_failed_at set for a first
 * charge, or billing_status already flipped to 'past_due' for a renewal) —
 * a genuinely stale/duplicate webhook must never demote a subscription that
 * has since been separately reconciled as active.
 */
async function confirmFlutterwaveSubscriptionCharge(
  txRef: string, providerStatus: string, flwRef?: string,
): Promise<boolean> {
  const isFirstCharge = txRef.startsWith('sub-first-charge-');
  const isRenewal = txRef.startsWith('sub-renewal-');
  if (!isFirstCharge && !isRenewal) return false;

  const withoutPrefix = txRef.slice((isFirstCharge ? 'sub-first-charge-' : 'sub-renewal-').length);
  const lastDash = withoutPrefix.lastIndexOf('-');
  const subId = lastDash > -1 ? withoutPrefix.slice(0, lastDash) : '';
  if (!subId) {
    console.warn(`[SubscriptionService] confirmFlutterwaveSubscriptionCharge: could not parse subscription id from tx_ref "${txRef}".`);
    return true;
  }

  const subRows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, subId)).limit(1);
  const sub = subRows[0];
  if (!sub || sub.provider !== 'flutterwave') return true;

  const userRows = await db.select().from(schema.users).where(eq(schema.users.id, sub.user_id)).limit(1);
  const user = userRows[0];
  if (!user) return true;

  const succeeded = providerStatus === 'successful';
  const wasAlreadyActive = sub.billing_status === 'active';

  if (succeeded) {
    if (wasAlreadyActive) return true;

    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + 1);
    await db.update(schema.subscriptions)
      .set({ billing_status: 'active', renewal_date: renewalDate, first_charge_failed_at: null })
      .where(eq(schema.subscriptions.id, sub.id));
    await db.update(schema.users).set({ subscription_status: 'active' }).where(eq(schema.users.id, user.id));

    await createAuditLog({
      userId: user.id,
      action: isFirstCharge ? 'FLW_SUBSCRIPTION_FIRST_CHARGE' : 'FLW_SUBSCRIPTION_RENEWAL_CHARGED',
      entity: 'subscriptions', entityId: sub.id,
      // Billing History (getBillingHistory below) derives paid/failed from
      // metadata.status === 'succeeded' for these two actions — mirror the
      // exact key/value the synchronous charge path already spreads in from
      // ChargeResult so async-confirmed charges show up identically.
      metadata: { txRef, flwRef, status: 'succeeded', providerStatus, confirmedAsynchronouslyViaWebhook: true },
    });

    if (isSubscriptionTierKey(user.subscription_tier)) {
      try {
        if (isFirstCharge) {
          await sendSubscriptionCreatedEmail(
            user.email, SUBSCRIPTION_TIERS[user.subscription_tier].name,
            formatTierPrice(user.subscription_tier, user.country), renewalDate.toLocaleDateString('en-GB'),
          );
        } else {
          await sendSubscriptionRenewalChargedEmail(
            user.email, SUBSCRIPTION_TIERS[user.subscription_tier].name,
            formatTierPrice(user.subscription_tier, user.country), renewalDate.toLocaleDateString('en-GB'),
          );
        }
      } catch (emailError) {
        console.error(`[SubscriptionService] Failed to send Flutterwave ${isFirstCharge ? 'first-charge' : 'renewal'} confirmation email to ${user.email}:`, emailError);
      }
    }
    await notificationService.create({
      userId: user.id, type: 'subscription_payment_succeeded',
      title: 'Payment successful — your subscription is active',
      message: isFirstCharge
        ? 'Your card was charged successfully and your monthly PadiHub subscription has begun.'
        : 'Your card was charged successfully and your PadiHub subscription has been renewed.',
    });
    return true;
  }

  // Definitive async failure. Skip if we've already told the member: a
  // first charge stamps first_charge_failed_at synchronously on failure
  // (see above), and a renewal's synchronous failure branch flips
  // billing_status straight to 'past_due' — a 'pending' outcome is the only
  // case that leaves neither set, which is exactly what this webhook exists
  // to resolve.
  if (wasAlreadyActive) return true;
  if (isFirstCharge && sub.first_charge_failed_at) return true;
  if (isRenewal && sub.billing_status === 'past_due') return true;

  if (isFirstCharge) {
    await db.update(schema.subscriptions).set({ first_charge_failed_at: new Date() }).where(eq(schema.subscriptions.id, sub.id));
  } else {
    await db.update(schema.subscriptions).set({ billing_status: 'past_due' }).where(eq(schema.subscriptions.id, sub.id));
  }
  await db.update(schema.users).set({ subscription_status: 'expired' }).where(eq(schema.users.id, user.id));

  await createAuditLog({
    userId: user.id,
    // Reuse the same action as a successful charge (rather than the
    // "_FAILED" variant, which is reserved for chargeFirstFlutterwaveSubscription's
    // no-card-on-file case where no charge was ever attempted) — a
    // definitive async failure IS a resolved charge attempt, and
    // getBillingHistory below correctly derives 'failed' status from
    // metadata.status here, exactly like a synchronous decline does.
    action: isFirstCharge ? 'FLW_SUBSCRIPTION_FIRST_CHARGE' : 'FLW_SUBSCRIPTION_RENEWAL_CHARGED',
    entity: 'subscriptions', entityId: sub.id,
    metadata: { txRef, flwRef, status: 'failed', providerStatus, confirmedAsynchronouslyViaWebhook: true },
  });
  await notificationService.create({
    userId: user.id, type: 'subscription_payment_failed', title: 'Payment could not be completed',
    message: isFirstCharge
      ? 'We could not confirm payment for your subscription. Please check your card details or complete any additional verification your bank requires.'
      : 'Your subscription renewal payment failed. Please update your payment method to keep access.',
  });
  await sendSubscriptionPaymentFailedEmail(
    user.email, isSubscriptionTierKey(user.subscription_tier) ? formatTierPrice(user.subscription_tier, user.country) : '',
  );
  return true;
}

export const subscriptionService = {
  /**
   * Record the member's chosen tier during onboarding. This NEVER charges
   * the member or creates a provider subscription — the platform
   * subscription is only ever created/charged once the member is a verified
   * member of a group that actually launches (3+ active members, leader
   * clicks "Start Group" — see groupService.activateGroup ->
   * reconcileMemberBilling -> reconcileBillingForActiveGroupMembership
   * below). Selecting/changing a plan before that point is free to do
   * repeatedly.
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

    return { tier, plan: planCode(user.country, tier), monthly_amount: getTierMonthlyPrice(tier, user.country) };
  },

  /**
   * Shared by retryStripeIncompleteSubscriptionCharge below and the one-off
   * reconcileStaleStripeSubscriptionReferences.ts script — see that
   * script's header comment for the full root-cause explanation. Before the
   * `past_due` duplicate-subscription guard existed (PR #49/50),
   * activateSubscription() could create a SECOND Stripe subscription object
   * for a member already stuck `past_due`, leaving `subscriptions.
   * provider_subscription_id` pointing at whichever object was created
   * first/last — not necessarily the one that actually went active with
   * Stripe. Any local retry keyed off that single stored id can then never
   * succeed (it keeps re-attempting a genuinely abandoned invoice), even
   * though Stripe already shows a DIFFERENT subscription object for the
   * same customer as active/trialing — its invoice.payment_succeeded
   * webhook was, and remains, silently ignored by webhookStripeController.ts
   * because no local row's provider_subscription_id matches it. Re-checks
   * EVERY Stripe subscription object on file for this customer
   * (read-only) and, only if one is genuinely active/trialing, repoints the
   * local row at it. Returns true once reconciled. This makes the fix
   * automatic for every affected account (past and future) instead of only
   * the handful of hardcoded emails the one-off script covers.
   */
  async reconcileStaleStripeSubscriptionReference(userId: string, stripeCustomerId: string, storedProviderSubscriptionId: string | null): Promise<boolean> {
    const stripeSubscriptions = await getStripeProvider().listSubscriptionsForCustomer(stripeCustomerId);
    const genuinelyActive = stripeSubscriptions.find(s => s.status === 'active' || s.status === 'trialing');
    // No subscription for this customer is genuinely active/trialing — this
    // is either a real, still-unresolved failure, or the single subscription
    // stored locally simply hasn't been paid yet; either way there is
    // nothing to reconcile onto, and callers must fall back to their own
    // handling (e.g. retrying the stored subscription's own invoice).
    if (!genuinelyActive) return false;

    const wasStaleReference = storedProviderSubscriptionId !== genuinelyActive.id;
    const renewalDate = new Date(genuinelyActive.currentPeriodEnd * 1000);
    await db.update(schema.subscriptions)
      .set({
        provider_subscription_id: genuinelyActive.id,
        billing_status:           'active',
        renewal_date:             renewalDate,
      })
      .where(eq(schema.subscriptions.user_id, userId));

    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    const user = userRows[0];
    if (user && user.subscription_status !== 'active' && user.subscription_status !== 'trial') {
      await db.update(schema.users).set({ subscription_status: 'active' as const }).where(eq(schema.users.id, userId));
    }

    await createAuditLog({
      userId, action: 'STRIPE_SUBSCRIPTION_REFERENCE_RECONCILED', entity: 'subscriptions',
      metadata: {
        previousProviderSubscriptionId: storedProviderSubscriptionId,
        reconciledProviderSubscriptionId: genuinelyActive.id,
        wasStaleReference,
        stripeSubscriptionsSeen: stripeSubscriptions.map(s => ({ id: s.id, status: s.status })),
      },
    });

    await notificationService.create({
      userId, type: 'subscription_billing_resumed',
      title: 'Payment successful — your subscription is active',
      message: 'We reconciled your account with Stripe — your subscription is confirmed active.',
    });

    if (user && isSubscriptionTierKey(user.subscription_tier)) {
      await sendSubscriptionCreatedEmail(
        user.email,
        SUBSCRIPTION_TIERS[user.subscription_tier].name,
        formatTierPrice(user.subscription_tier, user.country),
        renewalDate.toLocaleDateString('en-GB'),
      );
    }

    return true;
  },

  /**
   * Retroactive remediation, called from weeklySubscriptionHealthCheck's
   * self-heal (scheduledJobs.ts): re-attempts off-session collection of an
   * EXISTING Stripe subscription's still-open, never-actually-attempted
   * first invoice (see StripeProvider.retryIncompleteSubscriptionCharge/
   * createSubscription's invoices.pay() fix) instead of creating a second
   * provider subscription. Returns true only once the subscription is
   * genuinely active/trialing with the provider — callers must fall back
   * to their own handling (e.g. the existing self-heal) on false, since the
   * charge may have genuinely failed (real decline, interactive 3DS still
   * required) rather than just never having been attempted.
   */
  async retryStripeIncompleteSubscriptionCharge(userId: string, providerSubscriptionId: string): Promise<boolean> {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) return false;
    const user = userRows[0];

    // Stamped unconditionally (success or failure) — mirrors createSubscription's
    // own stamping, and keeps paymentEligibilityService's 5-minute retry
    // cooldown accurate for this path too, since it never calls
    // createSubscription() itself.
    await db.update(schema.subscriptions)
      .set({ last_activation_attempt_at: new Date() })
      .where(eq(schema.subscriptions.user_id, userId));

    // Check FIRST whether Stripe already has a different, genuinely
    // active/trialing subscription object for this customer (see
    // reconcileStaleStripeSubscriptionReference above) — retrying the
    // stored id's own invoice below is pointless (and can never succeed) if
    // that id is actually the abandoned half of the past_due
    // duplicate-subscription bug.
    if (user.stripe_customer_id) {
      const reconciled = await this.reconcileStaleStripeSubscriptionReference(userId, user.stripe_customer_id, providerSubscriptionId);
      if (reconciled) return true;
    }

    let result;
    try {
      result = await getStripeProvider().retryIncompleteSubscriptionCharge(providerSubscriptionId);
    } catch (err) {
      console.error('[SubscriptionService] Retry of existing incomplete Stripe subscription failed:', {
        providerSubscriptionId, userId, error: err instanceof Error ? err.message : err,
      });
      return false;
    }

    const billingIsActive = result.status === 'active' || result.status === 'trialing';
    if (!billingIsActive) return false;

    await db.update(schema.subscriptions)
      .set({ billing_status: 'active', renewal_date: result.renewalDate })
      .where(eq(schema.subscriptions.user_id, userId));
    await db.update(schema.users).set({ subscription_status: 'active' as const }).where(eq(schema.users.id, userId));

    await createAuditLog({
      userId, action: 'SUBSCRIPTION_BILLING_RESUMED', entity: 'subscriptions',
      metadata: { provider: 'stripe', subscriptionId: providerSubscriptionId, providerStatus: result.status, retried: true, reason: 'retroactive_incomplete_subscription_fix' },
    });

    if (isSubscriptionTierKey(user.subscription_tier)) {
      await sendSubscriptionCreatedEmail(
        user.email,
        SUBSCRIPTION_TIERS[user.subscription_tier].name,
        formatTierPrice(user.subscription_tier, user.country),
        result.renewalDate ? result.renewalDate.toLocaleDateString('en-GB') : 'your next billing date',
      );
    }
    await notificationService.create({
      userId, type: 'subscription_billing_resumed',
      title: 'Payment successful — your subscription has begun',
      message: 'We successfully retried your card charge. Your monthly PadiHub subscription has begun.',
    });

    return true;
  },

  /**
   * Create a platform subscription for a user with the provider. Called by
   * reconcileBillingForActiveGroupMembership below once the member is a
   * verified member of a group that has actually launched, and by
   * reactivateSubscription()/switchPlan()'s upgrade branch.
   */
  async createSubscription(userId: string, country: string, tier: SubscriptionTierKey, options: CreateSubscriptionOptions = {}) {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    const provider = getPaymentProvider(country);

    // Stamp the attempt on any PRE-EXISTING subscription row up front —
    // before contacting the provider at all — so a retry that ends up
    // throwing below still updates the timestamp. A first-ever attempt (no
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
      });
    } catch (err) {
      // Distinguish a PadiHub-side setup problem (missing Price/Plan ID —
      // no request to the provider was ever made) from a genuine
      // provider/network error, so callers never mistake a config gap for
      // the member's own card failing.
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
    const billingIsActive = result.status === 'active' || result.status === 'trialing';
    const billingStatus = billingIsActive ? 'active' : 'past_due';

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

    // subscription_status only becomes 'active' once the provider actually
    // confirms the charge — never optimistically, and never merely because
    // a plan was chosen or a card was saved (see Part C of the onboarding
    // spec: billing only starts once the member's group launches).
    await db.update(schema.users)
      .set({ subscription_tier: tier, ...(billingIsActive ? { subscription_status: 'active' as const } : {}) })
      .where(eq(schema.users.id, userId));

    await createAuditLog({
      userId, action: billingIsActive ? 'SUBSCRIPTION_CREATED' : 'SUBSCRIPTION_PAYMENT_PENDING', entity: 'subscriptions',
      metadata: { subscriptionId: result.subscriptionId, country, tier, amount_display: formatTierPrice(tier, country), providerStatus: result.status },
    });

    if (billingIsActive) {
      if (!options.suppressCreatedEmail) {
        await sendSubscriptionCreatedEmail(
          user.email,
          SUBSCRIPTION_TIERS[tier].name,
          formatTierPrice(tier, country),
          result.renewalDate ? result.renewalDate.toLocaleDateString('en-GB') : 'your next billing date',
        );
      }
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
      // This branch is reached again on every retry of a persistently
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

      const result = await (async () => {
        try {
          return await provider.createSubscription({
            customerId: user.country === 'NG' ? (user.flutterwave_customer_id ?? '') : (user.stripe_customer_id ?? ''),
            userId,
            email:    user.email,
            currency: user.currency,
            tier:     newTier,
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
      // card is declined or needs 3D-Secure, without throwing.
      const upgradeBillingIsActive = result.status === 'active' || result.status === 'trialing';
      const upgradeBillingStatus = upgradeBillingIsActive ? 'active' : 'past_due';

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
        userId, action: upgradeBillingIsActive ? 'SUBSCRIPTION_CREATED' : 'SUBSCRIPTION_PAYMENT_PENDING', entity: 'subscriptions',
        metadata: { subscriptionId: result.subscriptionId, country: user.country, tier: newTier, amount_display: newAmount, providerStatus: result.status },
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
   * The one and only trigger for a member's platform subscription — see
   * onboarding Part C: no charge is ever attempted, and
   * `users.subscription_status` never becomes 'active', until the member is
   * a verified member of a group that has actually launched (3+ active
   * members, leader clicks "Start Group" — see groupService.activateGroup).
   * Called from groupService.reconcileMemberBilling (itself invoked by
   * activateGroup and reevaluateAfterMembershipChange whenever a member's
   * active-group-membership count could have changed), and as a daily
   * safety-net sweep by scheduledJobs.dailyBillingActiveGroupReconciliation
   * in case any individual call site is ever missed.
   *
   * No-op if the member has no active (launched) group membership yet
   * (nothing to bill), or if a `subscriptions` row already exists for them
   * — the one first-charge attempt has already been made; a genuine
   * failure is handled by retryFirstChargeOrRemoveOnFailure (Flutterwave)
   * or the Stripe invoice.payment_failed webhook, never by re-attempting
   * here, which would risk creating a duplicate provider subscription.
   *
   * Stripe (GB): createSubscription() below performs the create-customer,
   * create-subscription and synchronous first-invoice-pay steps in one
   * call, and reports the confirmed provider status back.
   *
   * Flutterwave (NG): has no real recurring-billing engine (its
   * createSubscription() is a pure bookkeeping stub that never charges —
   * see FlutterwaveProvider) — the real first charge is an explicit
   * chargeContribution() call against the member's saved card token,
   * performed by chargeFirstFlutterwaveSubscription below.
   */
  async reconcileBillingForActiveGroupMembership(userId: string) {
    const activeGroupCount = await groupService.countActiveGroupMembershipsForUser(userId);
    if (activeGroupCount === 0) return;

    const existingSub = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId)).limit(1);
    if (existingSub.length) return;

    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) return;
    const user = userRows[0];
    // Should not happen — joining/creating a group is gated on a plan
    // already being chosen (see paymentEligibilityService.assertPaymentSetupComplete)
    // — but never attempt to bill a member with no tier selected.
    if (!isSubscriptionTierKey(user.subscription_tier)) return;

    if (user.country === 'NG') {
      await chargeFirstFlutterwaveSubscription(userId, user, user.subscription_tier, activeGroupCount);
      return;
    }

    try {
      await this.createSubscription(userId, user.country, user.subscription_tier);
    } catch (err) {
      // A missing Stripe secret key or Price ID env var
      // (PaymentProviderConfigError, surfaced here as AppError code
      // SUBSCRIPTION_PROVIDER_CONFIG_ERROR — see createSubscription()
      // above) means no request was ever sent to Stripe at all — this is a
      // PadiHub-side setup problem, not a genuine card decline. The
      // member's card is not at fault, so they must never be told their
      // payment failed; only the team should be alerted, loudly, to go fix
      // the missing configuration.
      if (err instanceof AppError && err.code === 'SUBSCRIPTION_PROVIDER_CONFIG_ERROR') {
        console.error(`[PadiHub] CONFIGURATION ERROR — subscription activation blocked for user ${userId} (${user.email}): ${err.message}`);
        if (shouldSendConfigErrorAlertEmail()) {
          await sendPaymentProviderConfigErrorAlertEmail(userId, err.message);
        }
        return;
      }
      // Any other provider/network error here is already turned into a
      // "payment could not be completed" notification+email by
      // createSubscription() itself before it throws — just log for
      // visibility, never let it bubble up and fail the group-launch/join
      // request that triggered this reconciliation.
      console.error('[SubscriptionService] Could not create Stripe subscription on group launch:', err instanceof Error ? err.message : err);
    }
  },

  /**
   * ONE-OFF RETROACTIVE BACKFILL support — see
   * src/server/scripts/backfillMissingSubscriptionConfirmations.ts. Covers
   * accounts whose local `subscriptions` row is already billing_status=
   * 'active' (so the data itself is correct) but which never got a
   * billing-history-visible confirmation for it — the exact gap just fixed
   * in webhookStripeController.ts's invoice.payment_succeeded handler for
   * subscriptions confirmed asynchronously via webhook rather than
   * synchronously inside createSubscription(). Idempotent: a user who
   * already has a SUBSCRIPTION_CREATED or STRIPE_SUBSCRIPTION_FIRST_CHARGE
   * billing-history entry is left untouched, so re-running this is always
   * safe. Returns true only if it actually sent a backfilled confirmation.
   */
  async backfillMissingActivationConfirmation(userId: string): Promise<boolean> {
    const subRows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.user_id, userId)).limit(1);
    if (!subRows.length) return false;
    const sub = subRows[0];
    if (sub.provider !== 'stripe' || sub.billing_status !== 'active') return false;

    const alreadyConfirmed = await db.select({ id: schema.auditLogs.id }).from(schema.auditLogs)
      .where(and(
        eq(schema.auditLogs.user_id, userId),
        inArray(schema.auditLogs.action, ['SUBSCRIPTION_CREATED', 'STRIPE_SUBSCRIPTION_FIRST_CHARGE']),
      )).limit(1);
    if (alreadyConfirmed.length) return false;

    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) return false;
    const user = userRows[0];
    if (!isSubscriptionTierKey(user.subscription_tier)) return false;

    await createAuditLog({
      userId, action: 'STRIPE_SUBSCRIPTION_FIRST_CHARGE', entity: 'subscriptions', entityId: sub.id,
      metadata: {
        subscriptionId: sub.provider_subscription_id,
        tier: user.subscription_tier,
        amount_display: formatTierPrice(user.subscription_tier, user.country),
        backfilled: true,
      },
    });
    await sendSubscriptionCreatedEmail(
      user.email,
      SUBSCRIPTION_TIERS[user.subscription_tier].name,
      formatTierPrice(user.subscription_tier, user.country),
      sub.renewal_date ? new Date(sub.renewal_date).toLocaleDateString('en-GB') : 'your next billing date',
    );
    await notificationService.create({
      userId, type: 'subscription_payment_succeeded',
      title: 'Payment successful — your subscription is active',
      message: 'Your card was charged successfully and your PadiHub subscription is now active.',
    });

    return true;
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
   * Section 3 retroactive self-heal, run once at boot (see entry.ts).
   * `cancelled_at` anchors the 60-day "cancelled and never rejoined"
   * deletion window (dailyResubscribeFollowUp in scheduledJobs.ts) — rows
   * already sitting at billing_status='cancelled' from before it was added
   * have no value to anchor against, which would leave those existing
   * accounts stuck forever without a deletion clock ever starting.
   * Backfills from `updated_at` (the timestamp of the cancellation write
   * itself, since cancelSubscription's own update is the last write that
   * ever touches a cancelled row). Idempotent — only targets rows where
   * `cancelled_at IS NULL`, so it's a no-op after the first successful run.
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

  /**
   * Public entry point for webhookFlutterwaveController's charge.completed
   * handler — see confirmFlutterwaveSubscriptionCharge above for full
   * behavior. Returns `false` if txRef doesn't belong to a subscription
   * charge at all, so the caller knows to fall back to its normal
   * contribution markPaid/markFailed handling.
   */
  async confirmFlutterwaveSubscriptionCharge(txRef: string, providerStatus: string, flwRef?: string): Promise<boolean> {
    return confirmFlutterwaveSubscriptionCharge(txRef, providerStatus, flwRef);
  },
};
