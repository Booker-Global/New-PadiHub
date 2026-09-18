/**
 * Payment Provider Interface — contract all providers must implement.
 * PadiHub never holds customer funds; all money moves through provider infrastructure.
 */

/**
 * Thrown when a provider method can't even attempt a real request because
 * required PadiHub-side configuration (an API secret key, a Stripe Price ID,
 * a Flutterwave Payment Plan ID, etc.) is missing from the environment —
 * see getStripe()/getFlutterwave() and the tier→price/plan ID lookups in
 * StripeProvider.ts/FlutterwaveProvider.ts. This is categorically different
 * from a genuine provider-level outcome (a declined card, a 3DS challenge,
 * a network/API error) — no charge was ever attempted, so it must never be
 * surfaced to the member as "your payment failed" (see subscriptionService
 * .reconcileBillingForActiveGroupMembership's catch block, which checks
 * `instanceof AppError` with code SUBSCRIPTION_PROVIDER_CONFIG_ERROR to
 * alert the team instead of emailing the member).
 */
export class PaymentProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderConfigError';
  }
}

export interface CreateCustomerResult {
  customerId: string;
}

export interface SavePaymentMethodResult {
  clientSecret?: string;       // Stripe: returned to frontend for Stripe.js
  paymentMethodId?: string;    // stored after frontend confirms
  token?: string;              // Flutterwave: tokenised card reference
}

export interface ChargeResult {
  providerReference: string;
  status: 'succeeded' | 'pending' | 'failed';
  // Stripe only — the underlying Charge ID (ch_xxx) behind the
  // PaymentIntent, distinct from `providerReference` (pi_xxx). Needed later
  // to fund a `source_transaction` payout transfer for this exact charge —
  // see StripeProvider.createTransfer.
  chargeId?: string;
}

export interface TransferResult {
  providerTransferReference: string;
  status: 'completed' | 'pending' | 'failed';
}

export interface SubscriptionResult {
  subscriptionId: string;
  status: string;
  renewalDate?: Date;
  // Stripe only — populated from `expand: ['latest_invoice.payment_intent']`
  // when billing is live (not deferred), so callers can drive an off-session
  // payment-method attachment/confirmation flow without a second round-trip
  // to fetch the invoice/payment intent separately.
  latestInvoicePaymentIntentClientSecret?: string;
  latestInvoicePaymentIntentStatus?: string;
}

export interface WebhookResult {
  handled: boolean;
  event?: string;
}

export interface IPaymentProvider {
  /** Create a customer record in the provider */
  createCustomer(params: {
    userId: string;
    email: string;
    name: string;
    currency: string;
  }): Promise<CreateCustomerResult>;

  /** Initiate saving a payment method (card) without charging */
  savePaymentMethod(params: {
    customerId: string;
    userId: string;
  }): Promise<SavePaymentMethodResult>;

  /** Charge a contribution from a saved payment method */
  chargeContribution(params: {
    customerId: string;
    paymentMethodId: string;
    amount: number;          // in smallest currency unit (pence / kobo)
    currency: string;
    countryCode?: string;
    contributionId: string;  // used as idempotency key
    description: string;
  }): Promise<ChargeResult>;

  /**
   * Transfer a share of a completed cycle's pot to the rotation recipient.
   * For Stripe, this is the whole payout: once the transfer lands in the
   * recipient's connected account balance, Stripe automatically pays it out
   * to their linked bank account on its own schedule — no separate manual
   * payout call is needed (confirmed with Stripe support; a connected
   * account's own `payout.paid` webhook event tracks delivery, not a manual
   * trigger here). A single cycle's pot may be paid out via several calls
   * to this method — one per contribution/charge that funded it — see
   * rotationService.transferCyclePotToRecipient.
   */
  createTransfer(params: {
    recipientAccountId: string;   // stripe_connected_account_id or flutterwave_subaccount_id
    amount: number;
    currency: string;
    rotationId: string;
    description: string;
    recipientBankCode?: string;   // Flutterwave only
    recipientAccountNumber?: string; // Flutterwave only
    recipientName?: string;       // Flutterwave only
    // Stripe only — links this transfer to the exact charge (ch_xxx) whose
    // funds it draws down, via Stripe's `source_transaction` param. Without
    // it, a transfer draws from the platform's general available balance,
    // which in live mode is subject to Stripe's standard payout-delay hold
    // and can fail with insufficient funds even when the originating charge
    // has long since succeeded. See StripeProvider.createTransfer.
    sourceChargeId?: string;
    // Stripe only — Stripe's `transfer_group`, used to tie together every
    // transfer that makes up one logical payout (e.g. all set to the
    // rotation ID) so they can be found/reconciled together in the Stripe
    // dashboard/API even though each is a separate transfer object.
    transferGroup?: string;
    // Overrides the default `transfer-${rotationId}` idempotency key —
    // required when a single rotation is paid out via multiple transfer
    // calls (one per funding charge), since each needs its own unique key.
    idempotencyKey?: string;
  }): Promise<TransferResult>;

  /**
   * Create a recurring platform subscription — only ever called once the
   * member is a verified member of a group that has actually launched (see
   * subscriptionService.reconcileBillingForActiveGroupMembership); billing
   * is attempted immediately, synchronously, never deferred.
   */
  createSubscription(params: {
    customerId: string;
    userId: string;
    email: string;
    currency: string;
    tier?: 'basic' | 'premium'; // which SUBSCRIPTION_TIERS plan to bill — defaults to 'basic'
  }): Promise<SubscriptionResult>;

  /** Cancel a subscription */
  cancelSubscription(params: {
    subscriptionId: string;
  }): Promise<{ cancelled: boolean }>;

  /** Verify and parse an inbound webhook payload */
  handleWebhook(params: {
    rawBody: Buffer;
    signature: string;
  }): Promise<WebhookResult>;
}
