/**
 * Stripe Connect provider — handles UK members.
 * All funds move through Stripe infrastructure; PadiHub never holds customer money.
 */
import Stripe from 'stripe';
import {
  PaymentProviderConfigError,
  type IPaymentProvider, type CreateCustomerResult, type SavePaymentMethodResult,
  type ChargeResult, type TransferResult, type PayoutResult, type SubscriptionResult, type WebhookResult,
} from './PaymentProviderInterface.js';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new PaymentProviderConfigError('STRIPE_SECRET_KEY environment variable is not set.');
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

/**
 * How far in the future a deferred (Section D.2) subscription's `trial_end`
 * is set at creation — see createSubscription()'s deferBilling branch. Long
 * enough that no member realistically stays outside an active 3+ member
 * group this long (resumeBilling() ends the trial the moment they join
 * one), but Stripe hard-rejects any `trial_end` more than 5 years out
 * ("Invalid timestamp: can be no more than five years in the future", 400
 * invalid_request_error) — 10 tripped that limit, so this stays comfortably
 * under it.
 */
const DEFERRED_BILLING_TRIAL_YEARS = 4;
function deferredBillingTrialEnd(): number {
  const end = new Date();
  end.setUTCFullYear(end.getUTCFullYear() + DEFERRED_BILLING_TRIAL_YEARS);
  return Math.floor(end.getTime() / 1000);
}

/** Shared shape returned by subscriptions.create/retrieve once expanded with
 * `latest_invoice.payment_intent` — used by both createSubscription() and
 * retryIncompleteSubscriptionCharge() below. */
type SubscriptionWithExpandedInvoice = Stripe.Subscription & {
  current_period_end: number;
  latest_invoice?: (Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string | null }) | string | null;
};

function toSubscriptionResult(subscription: SubscriptionWithExpandedInvoice): SubscriptionResult {
  const renewalDate = new Date(subscription.current_period_end * 1000);
  const latestInvoice = subscription.latest_invoice && typeof subscription.latest_invoice !== 'string'
    ? subscription.latest_invoice
    : undefined;
  const paymentIntent = latestInvoice?.payment_intent && typeof latestInvoice.payment_intent !== 'string'
    ? latestInvoice.payment_intent
    : undefined;

  return {
    subscriptionId: subscription.id,
    status:         subscription.status,
    renewalDate,
    latestInvoicePaymentIntentClientSecret: paymentIntent?.client_secret ?? undefined,
    latestInvoicePaymentIntentStatus:       paymentIntent?.status,
  };
}

export class StripeProvider implements IPaymentProvider {
  async createCustomer(params: {
    userId: string; email: string; name: string; currency: string;
  }): Promise<CreateCustomerResult> {
    const stripe = getStripe();
    const customer = await stripe.customers.create({
      email: params.email,
      name:  params.name,
      metadata: { padihub_user_id: params.userId },
    });
    return { customerId: customer.id };
  }

  async savePaymentMethod(params: {
    customerId: string; userId: string;
  }): Promise<SavePaymentMethodResult> {
    const stripe = getStripe();
    const intent = await stripe.setupIntents.create({
      customer: params.customerId,
      payment_method_types: ['card'],
      metadata: { padihub_user_id: params.userId },
    });
    return { clientSecret: intent.client_secret ?? undefined };
  }

  async retrievePaymentMethod(paymentMethodId: string) {
    const stripe = getStripe();
    return stripe.paymentMethods.retrieve(paymentMethodId);
  }

  async setCustomerDefaultPaymentMethod(params: {
    customerId: string;
    paymentMethodId: string;
  }) {
    const stripe = getStripe();
    await stripe.customers.update(params.customerId, {
      invoice_settings: { default_payment_method: params.paymentMethodId },
    });
    return { updated: true };
  }

  async chargeContribution(params: {
    customerId: string; paymentMethodId: string;
    amount: number; currency: string; countryCode?: string;
    contributionId: string; description: string;
  }): Promise<ChargeResult> {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create(
      {
        amount:               params.amount,
        currency:             params.currency.toLowerCase(),
        customer:             params.customerId,
        payment_method:       params.paymentMethodId,
        confirm:              true,
        off_session:          true,
        description:          params.description,
        metadata:             { contribution_id: params.contributionId },
      },
      { idempotencyKey: `contribution-${params.contributionId}` },
    );
    const status = intent.status === 'succeeded' ? 'succeeded'
      : intent.status === 'requires_action' ? 'pending' : 'failed';
    return { providerReference: intent.id, status };
  }

  async createTransfer(params: {
    recipientAccountId: string; amount: number; currency: string;
    rotationId: string; description: string;
  }): Promise<TransferResult> {
    const stripe = getStripe();
    const transfer = await stripe.transfers.create(
      {
        amount:      params.amount,
        currency:    params.currency.toLowerCase(),
        destination: params.recipientAccountId,
        description: params.description,
        metadata:    { rotation_id: params.rotationId },
      },
      { idempotencyKey: `transfer-${params.rotationId}` },
    );
    return { providerTransferReference: transfer.id, status: 'completed' };
  }

  /**
   * Step 2 of the contribution-to-payout loop — instantly push the funds
   * createTransfer() just moved into the recipient's connected account
   * balance out to their linked external bank account. Must run "as" the
   * connected account (the `stripeAccount` request option below), NOT the
   * platform account, or Stripe rejects the call/pays out the platform's own
   * balance instead of the recipient's.
   */
  async createPayout(params: {
    connectedAccountId: string; amount: number; currency: string;
    rotationId: string; description: string;
  }): Promise<PayoutResult> {
    const stripe = getStripe();
    const payout = await stripe.payouts.create(
      {
        amount:      params.amount,
        currency:    params.currency.toLowerCase(),
        description: params.description,
        metadata:    { rotation_id: params.rotationId },
      },
      {
        idempotencyKey: `payout-${params.rotationId}`,
        stripeAccount:  params.connectedAccountId,
      },
    );
    const status = payout.status === 'canceled' || payout.status === 'failed' ? 'failed'
      : payout.status === 'paid' ? 'completed' : 'pending';
    return { providerPayoutReference: payout.id, status };
  }

  async createSubscription(params: {
    customerId: string; userId: string; email: string; currency: string; tier?: 'basic' | 'premium';
    deferBilling?: boolean;
  }): Promise<SubscriptionResult> {
    const stripe = getStripe();
    // Basic (£4.99/mo) and Premium (£14.99/mo) are separate Stripe
    // Price objects, configured in the Stripe Dashboard — see SUBSCRIPTION_TIERS
    // in src/server/lib/constants.ts for the tier definitions this maps to.
    const priceId = params.tier === 'premium'
      ? process.env.STRIPE_PRICE_ID_PREMIUM_MONTHLY
      : process.env.STRIPE_PRICE_ID_BASIC_MONTHLY;
    if (!priceId) {
      throw new PaymentProviderConfigError(`${params.tier === 'premium' ? 'STRIPE_PRICE_ID_PREMIUM_MONTHLY' : 'STRIPE_PRICE_ID_BASIC_MONTHLY'} environment variable is not set.`);
    }
    // A Product ID (prod_...), a live-mode Price used against a test/sandbox
    // secret key, or any other non-Price value here makes Stripe reject the
    // whole POST /v1/subscriptions call with a 400 invalid_request_error
    // ("No such price") — fail fast with a clear, actionable config error
    // instead of a confusing opaque 400 in the Stripe dashboard logs.
    if (!priceId.startsWith('price_')) {
      throw new PaymentProviderConfigError(
        `${params.tier === 'premium' ? 'STRIPE_PRICE_ID_PREMIUM_MONTHLY' : 'STRIPE_PRICE_ID_BASIC_MONTHLY'} ("${priceId}") is not a valid Stripe Price ID (expected it to start with "price_") — check it matches a Price in your current Stripe Sandbox/Test catalog.`,
      );
    }

    // Section D.2 — billing must stay inert until the member is verified in
    // an active (3+ member) group. Stripe REJECTS `pause_collection` as an
    // "unknown parameter" on subscriptions.create (400 invalid_request_error,
    // code parameter_unknown) — it is only a valid parameter on
    // subscriptions.update (see resumeBilling/pauseBilling below, which both
    // call update() and are unaffected by this). So a deferred subscription
    // is instead created with a far-future `trial_end`: Stripe genuinely
    // never generates or attempts to collect any invoice for a 'trialing'
    // subscription, so the card is never charged at signup — this is the
    // real provider-level defer, not just a DB flag subscriptionService also
    // keeps in sync. Unlike `payment_behavior: 'default_incomplete'` (which
    // DOES generate an invoice immediately and leaves the subscription
    // 'incomplete' — Stripe auto-cancels 'incomplete' subscriptions ~23
    // hours later if that invoice is never paid, which is wrong here since
    // deferral can legitimately last far longer than 23 hours), a
    // 'trialing' subscription has no such expiry risk. resumeBilling()
    // below ends this trial the moment the member becomes eligible for real
    // billing.
    //
    // payment_behavior: 'default_incomplete' is only used for genuinely
    // live (non-deferred) billing, together with
    // payment_settings.save_default_payment_method (without it, the card
    // used to confirm the first invoice is never persisted as the
    // customer's default payment method, breaking future off-session
    // renewal charges) and expanding latest_invoice.payment_intent (without
    // it, the caller only gets back an invoice ID, not the PaymentIntent
    // client secret it may need to confirm/attach payment off-session
    // without a second round-trip to Stripe).
    let subscription: SubscriptionWithExpandedInvoice;
    try {
      subscription = await stripe.subscriptions.create({
        customer: params.customerId,
        items:    [{ price: priceId }],
        metadata: { padihub_user_id: params.userId },
        ...(params.deferBilling
          ? { trial_end: deferredBillingTrialEnd() }
          : {
              payment_behavior: 'default_incomplete' as const,
              payment_settings: { save_default_payment_method: 'on_subscription' as const },
              expand: ['latest_invoice.payment_intent'],
            }),
      }) as unknown as SubscriptionWithExpandedInvoice;
    } catch (err) {
      // Stripe validates `customer` and `items[0][price]` server-side, so a
      // malformed-but-plausible-looking env var (e.g. a Price ID copied from
      // a different Stripe account/mode than STRIPE_SECRET_KEY points to, or
      // a customer created against a different account than the one
      // currently configured) reaches the API and comes back as a
      // `resource_missing` invalid_request_error — a 400 that would
      // otherwise repeat forever in the Stripe dashboard's logs while
      // subscriptionService misclassifies it as a genuine card failure (see
      // its catch block) and wrongly tells the member "payment could not be
      // completed". Re-throw these as PaymentProviderConfigError instead, so
      // the team gets alerted with a precise, actionable cause rather than
      // the member being blamed for a setup problem that was never their
      // card's fault.
      if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
        if (err.param?.includes('price')) {
          throw new PaymentProviderConfigError(
            `Stripe rejected price ID "${priceId}" (${params.tier === 'premium' ? 'STRIPE_PRICE_ID_PREMIUM_MONTHLY' : 'STRIPE_PRICE_ID_BASIC_MONTHLY'}) as "No such price" — it does not exist in the Stripe account/mode STRIPE_SECRET_KEY currently points to. Create/copy the matching Price ID from that account's Product catalog.`,
          );
        }
        if (err.param === 'customer') {
          throw new PaymentProviderConfigError(
            `Stripe rejected customer ID "${params.customerId}" as "No such customer" — it does not exist in the Stripe account/mode STRIPE_SECRET_KEY currently points to (likely created under a different account/mode). The stored stripe_customer_id for this user must be cleared/recreated against the current account.`,
          );
        }
      }
      throw err;
    }

    // `default_incomplete` DOES auto-finalize the first invoice (it comes
    // back already `open`, with a PaymentIntent attached using the
    // customer's `invoice_settings.default_payment_method`) — but, contrary
    // to what its name suggests, Stripe deliberately leaves that
    // PaymentIntent in `requires_confirmation` rather than attempting to
    // collect it, precisely so a *client* can drive SCA/3DS via
    // stripe.confirmCardPayment(). PadiHub never does that (there is no
    // client-side confirmation step anywhere in this codebase), so every
    // such subscription was previously left permanently stuck `incomplete`
    // with an unpaid, un-attempted invoice — even though the member's card
    // was already verified and saved off-session earlier in onboarding
    // (confirmSetupIntent → setCustomerDefaultPaymentMethod). Explicitly pay
    // that invoice here, exactly the way resumeBilling() already does for
    // the previously-live-then-paused case above — `invoices.pay()` is the
    // correct server-initiated, off-session collection call (unlike
    // `paymentIntents.confirm`, it needs no explicit `off_session` flag) and
    // requires no client involvement at all. If the card genuinely still
    // needs interactive SCA or was declined, this throws/leaves the invoice
    // unpaid — in which case subscriptionService's existing
    // pending/payment-failed handling below (keyed off `result.status`)
    // takes over exactly as before; that residual case can't be avoided
    // server-side without violating SCA rules.
    if (!params.deferBilling) {
      subscription = await this.payOpenInvoiceAndRefresh(subscription);
    }

    return toSubscriptionResult(subscription);
  }

  /**
   * Off-session collection of a subscription's currently-open invoice
   * (shared by createSubscription()'s live/non-deferred branch and
   * retryIncompleteSubscriptionCharge() below) — calls `invoices.pay()`
   * exactly as resumeBilling() does for the previously-live-then-paused
   * case, then re-fetches the subscription so the returned status/renewal
   * date reflect the real post-payment outcome rather than the stale
   * pre-attempt state still held in `subscription`.
   */
  private async payOpenInvoiceAndRefresh(subscription: SubscriptionWithExpandedInvoice): Promise<SubscriptionWithExpandedInvoice> {
    const stripe = getStripe();
    const firstInvoice = subscription.latest_invoice && typeof subscription.latest_invoice !== 'string'
      ? subscription.latest_invoice
      : undefined;
    if (!firstInvoice?.id || firstInvoice.status !== 'open') return subscription;

    try {
      await stripe.invoices.pay(firstInvoice.id, undefined, { idempotencyKey: `sub-first-charge-pay-${subscription.id}` });
    } catch (error) {
      console.warn(`[StripeProvider] Off-session collection of invoice ${firstInvoice.id} for subscription ${subscription.id} did not succeed:`, error instanceof Error ? error.message : error);
    }
    return await stripe.subscriptions.retrieve(subscription.id, {
      expand: ['latest_invoice.payment_intent'],
    }) as unknown as SubscriptionWithExpandedInvoice;
  }

  /**
   * Retroactive remediation for a subscription that was created BEFORE this
   * off-session invoice-payment fix existed (see createSubscription() above)
   * and has therefore been sitting `incomplete` with an unpaid, un-attempted
   * first invoice ever since — `default_incomplete` auto-finalizes that
   * invoice but never tries to collect it, and Stripe never retries an
   * `incomplete` subscription's invoice on its own. Safe to call repeatedly:
   * a subscription that's already past `incomplete` (paid, or genuinely
   * failed into `incomplete_expired`/canceled) is simply re-reported as-is
   * with no further Stripe calls. Called by
   * subscriptionService.activateSubscriptionIfEligible's self-heal so
   * accounts stuck this way before the fix shipped get actually billed the
   * next time their eligibility is (re-)checked, instead of only having
   * `users.subscription_status` optimistically flipped to 'active' with the
   * underlying charge still never attempted.
   */
  async retryIncompleteSubscriptionCharge(subscriptionId: string): Promise<SubscriptionResult> {
    const stripe = getStripe();
    let subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent'],
    }) as unknown as SubscriptionWithExpandedInvoice;

    if (subscription.status === 'incomplete') {
      subscription = await this.payOpenInvoiceAndRefresh(subscription);
    }

    return toSubscriptionResult(subscription);
  }

  /**
   * Read-only lookup of every subscription object Stripe has on file for a
   * customer, newest first — used by the one-off
   * reconcileStaleSubscriptionReferences.ts script to find a customer's
   * genuinely active/trialing subscription when the locally-stored
   * `subscriptions.provider_subscription_id` points at a DIFFERENT, now-
   * abandoned subscription object (see createSubscription()'s
   * duplicate-subscription comments and activateSubscription()'s `past_due`
   * branch above — before that fix shipped, a member could end up with more
   * than one Stripe subscription object, only one of which ever actually
   * went active). Never mutates anything.
   */
  async listSubscriptionsForCustomer(customerId: string): Promise<{ id: string; status: Stripe.Subscription.Status; currentPeriodEnd: number }[]> {
    const stripe = getStripe();
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 100 });
    return subscriptions.data
      .map(sub => ({
        id:              sub.id,
        status:          sub.status,
        currentPeriodEnd: (sub as unknown as { current_period_end: number }).current_period_end,
      }))
      .sort((a, b) => b.currentPeriodEnd - a.currentPeriodEnd);
  }

  async cancelSubscription(params: { subscriptionId: string }): Promise<{ cancelled: boolean }> {
    const stripe = getStripe();
    await stripe.subscriptions.cancel(params.subscriptionId);
    return { cancelled: true };
  }

  /** Section D.2 — actually stop Stripe from attempting to collect payment. */
  async pauseBilling(subscriptionId: string): Promise<void> {
    const stripe = getStripe();
    await stripe.subscriptions.update(subscriptionId, { pause_collection: { behavior: 'void' } });
  }

  /**
   * Section D.2/1/5 — resume real Stripe collection once the member is
   * verified in an active (3+ member) group, AND immediately charge the
   * card now rather than waiting for whatever date the subscription's
   * original billing cycle anchor happens to land on.
   *
   * Two distinct prior states reach this method, requiring different
   * handling:
   *
   * 1. Created via createSubscription()'s deferBilling branch — the
   *    subscription is still 'trialing' (a far-future `trial_end`, since
   *    Stripe rejects `pause_collection` on create — see there). Ending the
   *    trial via `trial_end: 'now'` makes Stripe itself generate AND
   *    attempt to collect the first invoice — asynchronously, reported via
   *    the usual invoice.payment_succeeded/failed webhook, exactly like any
   *    other charge (see webhookStripeController.ts's `wasFirstChargeOnJoin`
   *    branch, keyed off billing_status==='paused', which doesn't care how
   *    the invoice was generated). Manually creating a second invoice below
   *    for this case would double-charge the member for the same period, so
   *    this branch returns immediately after ending the trial.
   *
   * 2. Previously genuinely live (billing_status 'active'), then paused via
   *    pauseBilling() after the member dropped below an active group and
   *    later rejoined one — clearing pause_collection alone only resumes
   *    Stripe's normal automatic billing at its EXISTING cycle date, it
   *    does NOT trigger a charge today, which previously left billing_status
   *    stuck unset/paused indefinitely for anyone who rejoined an active
   *    group between billing cycle anchors. Creating + paying an
   *    out-of-cycle invoice for the current subscription forces that
   *    immediate charge.
   *
   * Either way, the actual success/failure is reported via Stripe's usual
   * invoice.payment_succeeded/invoice.payment_failed webhooks (handled in
   * webhookStripeController.ts), so this method deliberately does not
   * update any local billing_status itself — callers must treat this as
   * "charge attempted", not "charge confirmed".
   */
  async resumeBilling(subscriptionId: string): Promise<void> {
    const stripe = getStripe();
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    if (current.status === 'trialing') {
      // Stripe errors ("You cannot end a trial for a subscription that
      // does not have a trial.") if trial_end: 'now' is sent to a
      // subscription that was never given a trial_end — only take this
      // branch for subscriptions genuinely still in trial.
      await stripe.subscriptions.update(subscriptionId, { trial_end: 'now', proration_behavior: 'none' });
      return;
    }

    await stripe.subscriptions.update(subscriptionId, { pause_collection: null });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

    let invoice: Stripe.Invoice;
    try {
      invoice = await stripe.invoices.create({
        customer: customerId,
        subscription: subscriptionId,
        collection_method: 'charge_automatically',
        description: 'PadiHub monthly subscription — first charge on joining an active group',
      }, { idempotencyKey: `sub-first-charge-invoice-${subscriptionId}` });
    } catch (error) {
      console.error(`[StripeProvider] Failed to create immediate first-charge invoice for subscription ${subscriptionId}:`, error);
      return;
    }
    if (!invoice.id) return;

    // `invoices.create` always returns the invoice in `draft` status — it is
    // NOT automatically finalized (Stripe only auto-finalizes drafts on its
    // own background schedule, up to ~1 hour later). `invoices.pay()` can
    // only be called on a `finalized` ('open') invoice; calling it on a
    // still-draft invoice throws immediately every time ("This invoice is
    // not finalized..."), before Stripe ever attempts to charge the card at
    // all. That silent, synchronous failure — not a genuine card decline —
    // is what previously left every "first charge on joining an active
    // group" stuck relying on Stripe's own delayed auto-finalize instead of
    // being charged immediately as intended, while still (eventually, once
    // Stripe's background job ran) firing genuine invoice.payment_failed
    // webhooks for members whose card was fine all along. Finalizing here
    // explicitly makes the immediate charge attempt actually happen.
    try {
      if (invoice.status === 'draft') {
        invoice = await stripe.invoices.finalizeInvoice(invoice.id, undefined, { idempotencyKey: `sub-first-charge-finalize-${subscriptionId}` });
      }
    } catch (error) {
      console.error(`[StripeProvider] Failed to finalize immediate first-charge invoice ${invoice.id} for subscription ${subscriptionId}:`, error);
      return;
    }
    if (invoice.status !== 'open') return;

    try {
      await stripe.invoices.pay(invoice.id, undefined, { idempotencyKey: `sub-first-charge-pay-${subscriptionId}` });
    } catch (error) {
      // Card declined etc. — leave it to Stripe's invoice.payment_failed
      // webhook (already wired to billing_status='past_due' + the
      // payment-failed email/retry-suspension flow) to record the outcome.
      console.error(`[StripeProvider] Immediate first-charge invoice ${invoice.id} for subscription ${subscriptionId} failed to pay:`, error);
    }
  }

  async handleWebhook(params: { rawBody: Buffer; signature: string }): Promise<WebhookResult> {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(params.rawBody, params.signature, secret);
    } catch {
      return { handled: false };
    }
    return { handled: true, event: event.type };
  }

  /** Parse a raw Stripe webhook event (after signature verification) */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  /** Retrieve a connected account's onboarding/payout status */
  async getAccountStatus(accountId: string): Promise<{
    chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean;
  }> {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);
    return {
      chargesEnabled:   Boolean(account.charges_enabled),
      payoutsEnabled:   Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
    };
  }

  /** Create a Stripe Express connected account for a group leader */
  async createConnectedAccount(params: {
    userId: string; email: string; country?: string;
    firstName?: string; lastName?: string;
    // Optional verified DOB/address (from Stripe Identity's verified_outputs
    // — see identityVerificationService.completeIdentityVerification) to
    // pre-fill the individual's personal details at account-creation time, so
    // Stripe's hosted onboarding page has fewer of these questions left to
    // ask, without changing what data is collected or who collects it.
    dob?: { day: number; month: number; year: number };
    address?: { line1?: string; line2?: string; city?: string; postalCode?: string; state?: string };
  }): Promise<{ accountId: string }> {
    const stripe = getStripe();
    const account = await stripe.accounts.create({
      type:         'express',
      email:        params.email,
      country:      params.country || 'GB',
      business_type: 'individual',
      individual: {
        email:      params.email,
        first_name: params.firstName,
        last_name:  params.lastName,
        ...(params.dob ? { dob: params.dob } : {}),
        ...(params.address ? {
          address: {
            line1:       params.address.line1,
            line2:       params.address.line2,
            city:        params.address.city,
            postal_code: params.address.postalCode,
            state:       params.address.state,
            country:     params.country || 'GB',
          },
        } : {}),
      },
      // Pre-fill the business website with PadiHub's own site — Stripe's
      // hosted "Business details" step only asks for this when it's
      // missing, so setting it up front skips a confusing question that
      // has nothing to do with the member's own business.
      business_profile: { url: 'https://www.padihub.com' },
      metadata: { padihub_user_id: params.userId },
      capabilities: { transfers: { requested: true } },
    });

    return { accountId: account.id };
  }

  /**
   * Push already-verified DOB/address (captured from Stripe Identity's
   * verified_outputs) onto an EXISTING connected account, so an account
   * created before this data was available (or before the member's identity
   * was verified) still gets pre-filled before the next Account Link is
   * generated — same self-heal pattern as the business_profile.url fix in
   * getOutstandingRequirements below. Best-effort: swallows errors (e.g. the
   * account already has different values on file and Stripe rejects the
   * update) rather than blocking payout setup on it.
   */
  async syncIndividualDetails(accountId: string, params: {
    dob?: { day: number; month: number; year: number };
    address?: { line1?: string; line2?: string; city?: string; postalCode?: string; state?: string };
    country?: string;
  }): Promise<void> {
    if (!params.dob && !params.address) return;
    const stripe = getStripe();
    try {
      await stripe.accounts.update(accountId, {
        individual: {
          ...(params.dob ? { dob: params.dob } : {}),
          ...(params.address ? {
            address: {
              line1:       params.address.line1,
              line2:       params.address.line2,
              city:        params.address.city,
              postal_code: params.address.postalCode,
              state:       params.address.state,
              country:     params.country || 'GB',
            },
          } : {}),
        },
      });
    } catch (err) {
      console.warn('[StripeProvider] Could not pre-fill individual details on connected account:', err instanceof Error ? err.message : err);
    }
  }

  /**
   * Attach a UK bank account (sort code + account number) submitted in-app to
   * an existing Express connected account, so the member doesn't have to
   * re-type their bank details on Stripe's hosted onboarding page — it will
   * only ask for whatever is still outstanding (e.g. identity verification).
   */
  async attachExternalBankAccount(params: {
    accountId: string; accountHolderName: string; sortCode: string;
    accountNumber: string; country?: string; currency?: string;
  }): Promise<{ externalAccountId: string }> {
    const stripe = getStripe();
    const existingAccounts = await stripe.accounts.listExternalAccounts(params.accountId, {
      object: 'bank_account',
      limit: 100,
    });
    const externalAccount = await stripe.accounts.createExternalAccount(params.accountId, {
      external_account: {
        object:              'bank_account',
        country:             params.country || 'GB',
        currency:            params.currency || 'gbp',
        account_holder_name: params.accountHolderName,
        account_number:      params.accountNumber,
        routing_number:      params.sortCode,
      },
    });
    for (const account of existingAccounts.data) {
      if (account.id === externalAccount.id) continue;
      await stripe.accounts.deleteExternalAccount(params.accountId, account.id);
    }
    return { externalAccountId: externalAccount.id };
  }

  /** Create an Account Link for whatever onboarding requirements (e.g. identity
   * verification) are still outstanding on a connected account. `nextPath` is
   * an optional, already-sanitized return path (e.g. back to an invite's join
   * page) appended to both URLs so the member isn't stranded on /payments/payout
   * after Stripe's hosted flow — see sanitizeReturnPath() in paymentController.
   *
   * `for_account=<accountId>` is also stamped onto both URLs so the return
   * page can detect a "wrong browser session" mid-flow (e.g. a different
   * PadiHub account got logged into the same browser/tab while the member was
   * on Stripe's hosted page) and warn instead of silently rendering whichever
   * account happens to be logged in when the redirect lands. */
  async createOnboardingLink(accountId: string, mode: 'add' | 'change' = 'add', nextPath?: string): Promise<{ onboardingUrl: string }> {
    const stripe = getStripe();
    const nextParam = nextPath ? `&next=${encodeURIComponent(nextPath)}` : '';
    const acctParam = `&for_account=${encodeURIComponent(accountId)}`;
    const accountLink = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: `${process.env.APP_URL ?? 'https://padihub.com'}/payments/payout?stripe_refresh=1&payout_mode=${mode}${nextParam}${acctParam}`,
      return_url:  `${process.env.APP_URL ?? 'https://padihub.com'}/payments/payout?stripe_connected=1&payout_mode=${mode}${nextParam}${acctParam}`,
      type:        'account_onboarding',
    });
    return { onboardingUrl: accountLink.url };
  }

  /** Whether a connected account still has outstanding onboarding requirements
   * (e.g. identity verification) that only Stripe's hosted flow can collect.
   * Also self-heals accounts created before business_profile.url was added to
   * createConnectedAccount() above, so pre-existing connected accounts skip
   * Stripe's "Business details → website" question too. */
  async getOutstandingRequirements(accountId: string): Promise<string[]> {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);
    if (!account.business_profile?.url) {
      await stripe.accounts.update(accountId, { business_profile: { url: 'https://www.padihub.com' } });
    }
    return [
      ...(account.requirements?.currently_due ?? []),
      ...(account.requirements?.past_due ?? []),
    ];
  }

  /**
   * SANDBOX/TEST-MODE-ONLY TEST UTILITY. Submits Stripe's special test-mode
   * file token (`file_identity_document_success`) as the connected account's
   * identity-document upload, satisfying the `individual.verification
   * .document` requirement (the Dashboard's "Provide an identity document"
   * warning) without any real document — see
   * https://docs.stripe.com/connect/testing#test-file-tokens. In production,
   * this requirement must always be satisfied by the account holder
   * themselves via Stripe's hosted onboarding flow
   * (createOnboardingLink() above) — never by this method.
   *
   * Hard-refuses to run unless BOTH `NODE_ENV !== 'production'` AND
   * `STRIPE_SECRET_KEY` is itself a test-mode key (starts with `sk_test_`).
   * Stripe would in any case reject `file_identity_document_success` as an
   * invalid file ID against a live-mode key, but this does not rely on that
   * alone — the check happens before any request reaches Stripe at all, so
   * a misconfigured environment (e.g. NODE_ENV left unset in a prod-like
   * deploy) can never silently attempt this against a real account.
   *
   * Deliberately NOT part of `IPaymentProvider`/never called from any
   * controller or user-reachable route — it exists solely for the one-off
   * sandbox scripts under src/server/scripts/ (e.g.
   * submitSandboxIdentityTestDocuments.ts) to unblock test Connect accounts
   * during manual QA.
   */
  async submitSandboxIdentityTestDocument(accountId: string): Promise<void> {
    const key = process.env.STRIPE_SECRET_KEY ?? '';
    if (process.env.NODE_ENV === 'production' || !key.startsWith('sk_test_')) {
      throw new Error(
        'submitSandboxIdentityTestDocument refused: this is a sandbox/test-mode-only utility and must never run in production or against a live Stripe key.',
      );
    }
    const stripe = getStripe();
    await stripe.accounts.update(accountId, {
      individual: {
        verification: {
          document: { front: 'file_identity_document_success' },
        },
      },
    });
  }

  /**
   * Actively verify that STRIPE_PRICE_ID_BASIC_MONTHLY and
   * STRIPE_PRICE_ID_PREMIUM_MONTHLY resolve to real, active Price objects in
   * whichever Stripe account/mode STRIPE_SECRET_KEY currently points to.
   *
   * createSubscription()'s resource_missing catch above only surfaces a
   * misconfigured Price ID the first time a real member's onboarding
   * happens to trigger it — which is exactly what previously showed up as a
   * silent, unexplained string of `POST /v1/subscriptions 400 ERR` entries
   * in the Stripe dashboard logs (e.g. after a Price ID was copied from a
   * different Stripe account/mode during a key rotation) with no clear
   * signal anywhere in PadiHub itself. Called at boot (see entry.ts) and
   * from monitoringService.getHealthStatus() so this class of
   * misconfiguration is caught immediately and loudly instead.
   */
  async verifyPriceConfig(): Promise<{
    basic: { configured: boolean; valid: boolean; error?: string };
    premium: { configured: boolean; valid: boolean; error?: string };
  }> {
    const stripe = getStripe();
    const check = async (envVar: string): Promise<{ configured: boolean; valid: boolean; error?: string }> => {
      const priceId = process.env[envVar];
      if (!priceId) return { configured: false, valid: false, error: `${envVar} is not set.` };
      try {
        const price = await stripe.prices.retrieve(priceId);
        if (!price.active) {
          return {
            configured: true, valid: false,
            error: `${envVar} ("${priceId}") exists but is archived (active: false) in the current Stripe account/mode — reactivate it or point ${envVar} at an active Price.`,
          };
        }
        return { configured: true, valid: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          configured: true, valid: false,
          error: `${envVar} ("${priceId}") could not be retrieved from the current Stripe account/mode: ${message}`,
        };
      }
    };
    const [basic, premium] = await Promise.all([
      check('STRIPE_PRICE_ID_BASIC_MONTHLY'),
      check('STRIPE_PRICE_ID_PREMIUM_MONTHLY'),
    ]);
    return { basic, premium };
  }
}
