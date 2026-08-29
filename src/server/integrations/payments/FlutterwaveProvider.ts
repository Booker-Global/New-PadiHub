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

type FlutterwaveVerifyResponse = {
  status?: string;
  data?: {
    id?: number | string;
    status?: string;
    tx_ref?: string;
    card?: {
      token?: string;
    };
    customer?: {
      email?: string;
    };
  };
};

function getHeaders() {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY environment variable is not set.');
  return {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  };
}

export class FlutterwaveProvider implements IPaymentProvider {
  async createCustomer(params: {
    userId: string; email: string; name: string; currency: string;
  }): Promise<CreateCustomerResult> {
    return { customerId: `flw_cust_${params.userId}` };
  }

  async savePaymentMethod(params: {
    customerId: string; userId: string;
  }): Promise<SavePaymentMethodResult> {
    void params;
    return { clientSecret: undefined };
  }

  async createHostedPaymentLink(params: {
    amount: number;
    currency: string;
    email: string;
    name: string;
    txRef: string;
    redirectUrl: string;
    title: string;
    description: string;
    meta?: Record<string, unknown>;
  }): Promise<{ link: string }> {
    const response = await axios.post(`${FLW_BASE}/payments`, {
      tx_ref: params.txRef,
      amount: params.amount,
      currency: params.currency,
      redirect_url: params.redirectUrl,
      payment_options: 'card',
      customer: {
        email: params.email,
        name: params.name,
      },
      customizations: {
        title: params.title,
        description: params.description,
      },
      meta: params.meta,
    }, { headers: getHeaders() });

    const link = response.data?.data?.link as string | undefined;
    if (!link) throw new Error('Flutterwave did not return a hosted payment link.');
    return { link };
  }

  async verifyTransaction(params: { transactionId: string }): Promise<{
    transactionId: string;
    txRef: string;
    status: string;
    cardToken?: string;
    customerEmail: string;
  }> {
    const response = await axios.get<FlutterwaveVerifyResponse>(
      `${FLW_BASE}/transactions/${params.transactionId}/verify`,
      { headers: getHeaders() },
    );

    const data = response.data?.data;
    const txRef = data?.tx_ref ?? '';
    const status = data?.status ?? '';
    const customerEmail = data?.customer?.email ?? '';

    if (!txRef || !customerEmail) {
      throw new Error('Flutterwave verify response was missing transaction ownership details.');
    }

    return {
      transactionId: data?.id?.toString() ?? params.transactionId,
      txRef,
      status,
      cardToken: data?.card?.token,
      customerEmail,
    };
  }

  async chargeContribution(params: {
    customerId: string; paymentMethodId: string;
    amount: number; currency: string; countryCode?: string;
    contributionId: string; description: string;
  }): Promise<ChargeResult> {
    const response = await axios.post(`${FLW_BASE}/tokenized-charges`, {
      token: params.paymentMethodId,
      email: params.customerId,
      currency: params.currency,
      country: params.countryCode ?? 'NG',
      amount: params.amount / 100,
      tx_ref: params.contributionId,
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
      account_bank: params.recipientBankCode ?? '044',
      account_number: params.recipientAccountNumber ?? params.recipientAccountId,
      amount: params.amount / 100,
      currency: params.currency,
      narration: params.description,
      reference: `transfer-${params.rotationId}`,
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
    const planId = process.env.FLUTTERWAVE_PLAN_ID_NG_MONTHLY;
    if (!planId) throw new Error('FLUTTERWAVE_PLAN_ID_NG_MONTHLY environment variable is not set.');

    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + 1);

    return {
      subscriptionId: `flw_sub_${params.userId}_${Date.now()}`,
      status: 'trialing',
      renewalDate,
    };
  }

  async cancelSubscription(params: { subscriptionId: string }): Promise<{ cancelled: boolean }> {
    if (params.subscriptionId.startsWith('flw_sub_')) {
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
      account_bank: params.bankCode,
      account_number: params.accountNumber,
      business_name: params.businessName,
      split_type: 'percentage',
      split_value: params.splitValue ?? 0,
      meta: [{ meta_name: 'padihub_user_id', meta_value: params.userId }],
    }, { headers: getHeaders() });

    return { subaccountId: response.data.data.subaccount_id };
  }
}
