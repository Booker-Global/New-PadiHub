/**
 * Stripe Connect provider — handles UK members.
 * All funds move through Stripe infrastructure; PadiHub never holds customer money.
 */
import Stripe from 'stripe';
import {
  PaymentProviderConfigError,
  type IPaymentProvider, type CreateCustomerResult, type SavePaymentMethodResult,
  type ChargeResult, type TransferResult, type SubscriptionResult, type WebhookResult,
} from './PaymentProviderInterface.js';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new PaymentProviderConfigError('STRIPE_SECRET_KEY environment variable is not set.');
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
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

    // Section D.2 — billing must stay inert until the member is verified in
    // an active (3+ member) group. pause_collection: 'void' tells Stripe to
    // never generate/attempt an invoice for this subscription while set, so
    // the card is genuinely never charged at signup — this is the real
    // provider-level defer, not just a DB flag subscriptionService also
    // keeps in sync (see resumeBilling/pauseBilling below).
    //
    // payment_behavior: 'default_incomplete' must NEVER be combined with
    // pause_collection at creation time: Stripe still generates (and
    // immediately voids, because of pause_collection) the first invoice,
    // but default_incomplete forces the subscription's status to stay
    // 'incomplete' until an invoice is actually paid — which, once voided,
    // can never happen. That previously left every deferred-billing member
    // (i.e. everyone who hasn't yet joined a 3+ member active group)
    // permanently stuck "awaiting payment confirmation" even after
    // completing every onboarding step, and fired the payment-failed
    // notification/email for a charge that was never even attempted. There
    // is nothing to confirm when billing is deferred (no invoice is ever
    // due), so only request default_incomplete confirmation when billing is
    // genuinely live.
    const subscription = await stripe.subscriptions.create({
      customer: params.customerId,
      items:    [{ price: priceId }],
      metadata: { padihub_user_id: params.userId },
      ...(params.deferBilling
        ? { pause_collection: { behavior: 'void' as const } }
        : { payment_behavior: 'default_incomplete' as const }),
    }) as unknown as Stripe.Subscription & { current_period_end: number };

    const renewalDate = new Date(subscription.current_period_end * 1000);
    return {
      subscriptionId: subscription.id,
      status:         subscription.status,
      renewalDate,
    };
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
   * original (deferred, paused-at-creation) billing cycle anchor happens
   * to land on. Clearing pause_collection alone only resumes Stripe's
   * normal automatic billing at its existing cycle date — it does NOT
   * trigger a charge today, which previously left billing_status stuck
   * unset/paused indefinitely for anyone who joined an active group
   * between billing cycle anchors. Creating + paying an out-of-cycle
   * invoice for the current subscription forces that immediate charge.
   * The actual success/failure is reported via Stripe's usual
   * invoice.payment_succeeded/invoice.payment_failed webhooks (handled in
   * webhookStripeController.ts) exactly like any other renewal charge, so
   * this method deliberately does not update any local billing_status
   * itself — callers must treat this as "charge attempted", not "charge
   * confirmed".
   */
  async resumeBilling(subscriptionId: string): Promise<void> {
    const stripe = getStripe();
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
      },
      metadata: { padihub_user_id: params.userId },
      capabilities: { transfers: { requested: true } },
    });

    return { accountId: account.id };
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
   * after Stripe's hosted flow — see sanitizeReturnPath() in paymentController. */
  async createOnboardingLink(accountId: string, mode: 'add' | 'change' = 'add', nextPath?: string): Promise<{ onboardingUrl: string }> {
    const stripe = getStripe();
    const nextParam = nextPath ? `&next=${encodeURIComponent(nextPath)}` : '';
    const accountLink = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: `${process.env.APP_URL ?? 'https://padihub.com'}/payments/payout?stripe_refresh=1&payout_mode=${mode}${nextParam}`,
      return_url:  `${process.env.APP_URL ?? 'https://padihub.com'}/payments/payout?stripe_connected=1&payout_mode=${mode}${nextParam}`,
      type:        'account_onboarding',
    });
    return { onboardingUrl: accountLink.url };
  }

  /** Whether a connected account still has outstanding onboarding requirements
   * (e.g. identity verification) that only Stripe's hosted flow can collect. */
  async getOutstandingRequirements(accountId: string): Promise<string[]> {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);
    return [
      ...(account.requirements?.currently_due ?? []),
      ...(account.requirements?.past_due ?? []),
    ];
  }
}
