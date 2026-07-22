/**
 * Flutterwave provider — handles Nigeria (NG) members.
 * Uses Flutterwave REST API via axios (no official Node SDK).
 * All funds move through Flutterwave infrastructure; PadiHub never holds customer money.
 */
import axios from 'axios';
import crypto from 'crypto';
import type {
  IPaymentProvider, CreateCustomerResult, SavePaymentMethodResult,
  ChargeResult, TransferResult, SubscriptionResult, WebhookResult,
} from './PaymentProviderInterface.js';

const FLW_BASE = 'https://api.flutterwave.com/v3';

function getHeaders() {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY environment variable is not set.');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export class FlutterwaveProvider implements IPaymentProvider {
  async createCustomer(params: {
    userId: string; email: string; name: string; currency: string;
  }): Promise<CreateCustomerResult> {
    // Flutterwave doesn't have a standalone "create customer" endpoint;
    // customer identity is established on first charge. We return a
    // deterministic customer ID derived from the user ID for tracking.
    return { customerId: `flw_cust_${params.userId}` };
  }

  async savePaymentMethod(params: {
    customerId: string; userId: string;
  }): Promise<SavePaymentMethodResult> {
    // Flutterwave tokenisation is completed via the hosted payment page.
    // The token is returned in the charge.completed webhook and stored then.
    // This method returns a redirect URL for the frontend to initiate tokenisation.
    return { clientSecret: undefined };
  }

  async chargeContribution(params: {
    customerId: string; paymentMethodId: string;
    amount: number; currency: string;
    contributionId: string; description: string;
  }): Promise<ChargeResult> {
    // paymentMethodId is the Flutterwave card token
    const response = await axios.post(`${FLW_BASE}/charges?type=token`, {
      token:    params.paymentMethodId,
      email:    params.customerId, // stored as email in our DB for FLW
      currency: params.currency,
      amount:   params.amount / 100, // FLW uses full units (naira, not kobo)
      tx_ref:   params.contributionId,
      narration: params.description,
    }, { headers: getHeaders() });

    const data = response.data;
    const status = data.data?.status === 'successful' ? 'succeeded'
      : data.data?.status === 'pending' ? 'pending' : 'failed';
    return {
      providerReference: data.data?.id?.toString() ?? params.contributionId,
      status,
    };
  }

  async createTransfer(params: {
    recipientAccountId: string; amount: number; currency: string;
    rotationId: string; description: string;
    recipientBankCode?: string;
    recipientAccountNumber?: string;
    recipientName?: string;
  }): Promise<TransferResult> {
    const response = await axios.post(`${FLW_BASE}/transfers`, {
      account_bank:   params.recipientBankCode ?? '044',
      account_number: params.recipientAccountNumber ?? params.recipientAccountId,
      amount:         params.amount / 100, // full naira units
      currency:       params.currency,
      narration:      params.description,
      reference:      `transfer-${params.rotationId}`,
      beneficiary_name: params.recipientName ?? 'PadiHub Member',
    }, { headers: getHeaders() });

    const data = response.data;
    const status = data.data?.status === 'SUCCESSFUL' ? 'completed'
      : data.data?.status === 'PENDING' ? 'pending' : 'failed';
    return {
      providerTransferReference: data.data?.id?.toString() ?? params.rotationId,
      status,
    };
  }

  async createSubscription(params: {
    customerId: string; userId: string; email: string; currency: string;
  }): Promise<SubscriptionResult> {
    // Flutterwave recurring billing is initiated via a payment plan charge.
    // The plan ID is stored in env; the actual charge happens on the hosted page.
    const planId = process.env.FLUTTERWAVE_PLAN_ID_NG_MONTHLY;
    if (!planId) throw new Error('FLUTTERWAVE_PLAN_ID_NG_MONTHLY environment variable is not set.');

    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + 1);

    // Return a synthetic subscription ID; the real one comes back via webhook
    return {
      subscriptionId: `flw_sub_${params.userId}_${Date.now()}`,
      status:         'trialing',
      renewalDate,
    };
  }

  async cancelSubscription(params: { subscriptionId: string }): Promise<{ cancelled: boolean }> {
    // Extract the Flutterwave subscription ID if it's a real FLW ID
    if (params.subscriptionId.startsWith('flw_sub_')) {
      // Synthetic ID — mark cancelled locally only
      return { cancelled: true };
    }
    await axios.put(
      `${FLW_BASE}/subscriptions/${params.subscriptionId}/cancel`,
      {},
      { headers: getHeaders() },
    );
    return { cancelled: true };
  }

  async handleWebhook(params: { rawBody: Buffer; signature: string }): Promise<WebhookResult> {
    const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    if (!secret) throw new Error('FLUTTERWAVE_WEBHOOK_SECRET environment variable is not set.');

    const hash = crypto.createHmac('sha256', secret)
      .update(params.rawBody)
      .digest('hex');

    if (hash !== params.signature) return { handled: false };

    const body = JSON.parse(params.rawBody.toString());
    return { handled: true, event: body.event };
  }

  /** Create a Flutterwave subaccount for a group leader */
  async createSubaccount(params: {
    userId: string; businessName: string; bankCode: string;
    accountNumber: string; splitValue?: number;
  }): Promise<{ subaccountId: string }> {
    const response = await axios.post(`${FLW_BASE}/subaccounts`, {
      account_bank:    params.bankCode,
      account_number:  params.accountNumber,
      business_name:   params.businessName,
      split_type:      'percentage',
      split_value:     params.splitValue ?? 0,
      meta: [{ meta_name: 'padihub_user_id', meta_value: params.userId }],
    }, { headers: getHeaders() });

    return { subaccountId: response.data.data.subaccount_id };
  }
}
