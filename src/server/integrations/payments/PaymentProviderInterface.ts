/**
 * Payment Provider Interface — contract all providers must implement.
 * PadiHub never holds customer funds; all money moves through provider infrastructure.
 */

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
}

export interface TransferResult {
  providerTransferReference: string;
  status: 'completed' | 'pending' | 'failed';
}

export interface SubscriptionResult {
  subscriptionId: string;
  status: string;
  renewalDate?: Date;
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

  /** Transfer the full pot to the rotation recipient */
  createTransfer(params: {
    recipientAccountId: string;   // stripe_connected_account_id or flutterwave_subaccount_id
    amount: number;
    currency: string;
    rotationId: string;
    description: string;
    recipientBankCode?: string;   // Flutterwave only
    recipientAccountNumber?: string; // Flutterwave only
    recipientName?: string;       // Flutterwave only
  }): Promise<TransferResult>;

  /** Create a recurring platform subscription */
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
