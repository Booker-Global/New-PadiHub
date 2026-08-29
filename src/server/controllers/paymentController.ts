/**
 * Payment controller — setup intent, payment-method storage, Connect onboarding,
 * hosted Flutterwave setup, and manual contribution charge trigger.
 */
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { getPaymentProvider, getStripeProvider, getFlutterwaveProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { createAuditLog } from '../middleware/auditLogger.js';

const FLUTTERWAVE_SETUP_TX_REF_PREFIX = 'padihub-flw-setup';
const DEFAULT_FLUTTERWAVE_SETUP_AMOUNT = 50;

async function getUserOrThrow(userId: string) {
  const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!userRows.length) throw new AppError('User not found.', 404);
  return userRows[0];
}

async function getContributionContext(userId: string, contributionId: string) {
  const contribRows = await db.select().from(schema.contributions)
    .where(eq(schema.contributions.id, contributionId)).limit(1);
  if (!contribRows.length) throw new AppError('Contribution not found.', 404);

  const contribution = contribRows[0];
  if (contribution.member_id !== userId) throw new AppError('Not your contribution.', 403);

  const [user, groupRows] = await Promise.all([
    getUserOrThrow(userId),
    db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, contribution.group_id)).limit(1),
  ]);

  if (!groupRows.length) throw new AppError('Group not found.', 404);

  return {
    contribution,
    user,
    group: groupRows[0],
  };
}

function getBaseAppUrl(req: Request) {
  const candidate = req.headers.origin ?? process.env.APP_URL ?? process.env.VITE_PUBLIC_URL ?? 'https://padihub.com';

  try {
    return new URL(candidate).origin;
  } catch {
    return 'https://padihub.com';
  }
}

function getFlutterwaveSetupAmount() {
  const parsed = Number.parseFloat(process.env.FLUTTERWAVE_PAYMENT_METHOD_SETUP_AMOUNT ?? `${DEFAULT_FLUTTERWAVE_SETUP_AMOUNT}`);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError('FLUTTERWAVE_PAYMENT_METHOD_SETUP_AMOUNT must be a positive number.', 500);
  }
  return parsed;
}

export const paymentController = {
  /** POST /api/payments/setup-intent — returns client_secret for Stripe.js */
  setupIntent: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const user = await getUserOrThrow(userId);

      let stripeCustomerId = user.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await getStripeProvider().createCustomer({
          userId,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          currency: user.currency,
        });
        stripeCustomerId = customer.customerId;

        await db.update(schema.users)
          .set({ stripe_customer_id: stripeCustomerId })
          .where(eq(schema.users.id, userId));

        await createAuditLog({
          userId,
          action: 'STRIPE_CUSTOMER_CREATED',
          entity: 'users',
          entityId: userId,
          metadata: { stripeCustomerId },
        });
      }

      const result = await getStripeProvider().savePaymentMethod({
        customerId: stripeCustomerId,
        userId,
      });
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },

  /** POST /api/payments/confirm-setup-intent — persist verified Stripe payment method */
  confirmSetupIntent: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { payment_method_id } = req.body as { payment_method_id?: string };
      if (!payment_method_id) throw new AppError('payment_method_id is required.', 400);

      const user = await getUserOrThrow(userId);
      if (!user.stripe_customer_id) {
        throw new AppError('No Stripe customer record. Start payment method setup again.', 400, 'PAYMENT_CUSTOMER_MISSING');
      }

      const paymentMethod = await getStripeProvider().retrievePaymentMethod(payment_method_id);
      const customerId = typeof paymentMethod.customer === 'string'
        ? paymentMethod.customer
        : paymentMethod.customer?.id;

      if (paymentMethod.type !== 'card') {
        throw new AppError('Only card payment methods can be saved for contributions.', 400, 'INVALID_PAYMENT_METHOD');
      }

      if (customerId !== user.stripe_customer_id) {
        throw new AppError('This payment method is not attached to your Stripe customer record.', 403, 'PAYMENT_METHOD_MISMATCH');
      }

      await getStripeProvider().setCustomerDefaultPaymentMethod({
        customerId: user.stripe_customer_id,
        paymentMethodId: payment_method_id,
      });

      await db.update(schema.users)
        .set({ stripe_payment_method_id: payment_method_id })
        .where(eq(schema.users.id, userId));

      await createAuditLog({
        userId,
        action: 'STRIPE_PAYMENT_METHOD_SAVED',
        entity: 'users',
        entityId: userId,
        metadata: { paymentMethodId: payment_method_id },
      });

      res.json({
        success: true,
        data: { payment_method_id },
      });
    } catch (e) { next(e); }
  },

  /** POST /api/payments/create-flutterwave-payment-link — redirect to hosted checkout to save a card token */
  createFlutterwavePaymentLink: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { contribution_id } = req.body as { contribution_id?: string };
      if (!contribution_id) throw new AppError('contribution_id is required.', 400);

      const { contribution, user, group } = await getContributionContext(userId, contribution_id);
      if (group.payment_provider !== 'flutterwave' || group.country !== 'NG' || group.currency !== 'NGN') {
        throw new AppError('Flutterwave card setup is only available for Nigerian NGN groups.', 400);
      }

      const verificationAmount = getFlutterwaveSetupAmount();
      const txRef = `${FLUTTERWAVE_SETUP_TX_REF_PREFIX}-${userId}-${contribution.id}-${randomUUID()}`;
      const redirectUrl = new URL(`/savings-groups/${group.id}/contribute`, getBaseAppUrl(req));
      redirectUrl.searchParams.set('setup_provider', 'flutterwave');
      redirectUrl.searchParams.set('contribution_id', contribution.id);

      const result = await getFlutterwaveProvider().createHostedPaymentLink({
        amount: verificationAmount,
        currency: group.currency,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        txRef,
        redirectUrl: redirectUrl.toString(),
        title: 'Save card for future contributions',
        description: `Save a card for ${group.name}`,
        meta: {
          padihub_user_id: userId,
          contribution_id: contribution.id,
          purpose: 'payment_method_setup',
        },
      });

      await createAuditLog({
        userId,
        action: 'FLW_PAYMENT_METHOD_SETUP_LINK_CREATED',
        entity: 'users',
        entityId: userId,
        metadata: {
          txRef,
          contributionId: contribution.id,
          verificationAmount,
          currency: group.currency,
        },
      });

      res.json({
        success: true,
        data: {
          ...result,
          tx_ref: txRef,
          verification_amount: verificationAmount,
          currency: group.currency,
        },
      });
    } catch (e) { next(e); }
  },

  /** POST /api/payments/save-flutterwave-token — verify hosted checkout result and persist card token */
  saveFlutterwaveToken: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { transaction_id, tx_ref } = req.body as { transaction_id?: string | number; tx_ref?: string };
      if (!transaction_id) throw new AppError('transaction_id is required.', 400);

      const user = await getUserOrThrow(userId);
      const result = await getFlutterwaveProvider().verifyTransaction({
        transactionId: transaction_id.toString(),
      });

      if (!result.txRef.startsWith(`${FLUTTERWAVE_SETUP_TX_REF_PREFIX}-${userId}-`)) {
        throw new AppError('This Flutterwave transaction does not belong to your payment-method setup flow.', 403, 'PAYMENT_METHOD_MISMATCH');
      }

      if (tx_ref && tx_ref !== result.txRef) {
        throw new AppError('The Flutterwave transaction reference does not match the verified transaction.', 403, 'PAYMENT_METHOD_MISMATCH');
      }

      if (result.customerEmail.toLowerCase() !== user.email.toLowerCase()) {
        throw new AppError('The verified Flutterwave transaction does not belong to your account.', 403, 'PAYMENT_METHOD_MISMATCH');
      }

      if (result.status !== 'successful') {
        throw new AppError('Flutterwave has not confirmed a successful card setup payment yet.', 400, 'PAYMENT_NOT_CONFIRMED');
      }

      if (!result.cardToken) {
        throw new AppError('Flutterwave did not return a reusable card token for this card. Try another card.', 400, 'PAYMENT_METHOD_NOT_TOKENIZED');
      }

      await db.update(schema.users)
        .set({
          flutterwave_customer_id: user.flutterwave_customer_id ?? `flw_cust_${userId}`,
          flutterwave_card_token: result.cardToken,
        })
        .where(eq(schema.users.id, userId));

      await createAuditLog({
        userId,
        action: 'FLW_PAYMENT_METHOD_SAVED',
        entity: 'users',
        entityId: userId,
        metadata: {
          transactionId: result.transactionId,
          txRef: result.txRef,
        },
      });

      res.json({
        success: true,
        data: {
          flutterwave_card_token: result.cardToken,
          transaction_id: result.transactionId,
          tx_ref: result.txRef,
        },
      });
    } catch (e) { next(e); }
  },

  /** POST /api/payments/connect-onboard — create Stripe Express account for group leader */
  connectOnboard: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const user = await getUserOrThrow(userId);

      if (user.country === 'NG') {
        // Flutterwave subaccount — requires bank details from request body
        const { business_name, bank_code, account_number } = req.body as {
          business_name: string; bank_code: string; account_number: string;
        };
        if (!business_name || !bank_code || !account_number) {
          throw new AppError('business_name, bank_code, and account_number are required for NG accounts.', 400);
        }
        const result = await getFlutterwaveProvider().createSubaccount({
          userId,
          businessName:   business_name,
          bankCode:       bank_code,
          accountNumber:  account_number,
        });
        await db.update(schema.users)
          .set({ flutterwave_subaccount_id: result.subaccountId })
          .where(eq(schema.users.id, userId));

        await createAuditLog({ userId, action: 'FLW_SUBACCOUNT_CREATED', entity: 'users', entityId: userId });
        return res.json({ success: true, data: result });
      }

      // UK — Stripe Express
      const result = await getStripeProvider().createConnectedAccount({
        userId, email: user.email,
      });
      await db.update(schema.users)
        .set({ stripe_connected_account_id: result.accountId })
        .where(eq(schema.users.id, userId));

      await createAuditLog({ userId, action: 'STRIPE_CONNECT_ACCOUNT_CREATED', entity: 'users', entityId: userId });
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },

  /** POST /api/payments/charge-contribution — manually trigger a contribution charge */
  chargeContribution: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { contribution_id } = req.body as { contribution_id?: string };
      if (!contribution_id) throw new AppError('contribution_id is required.', 400);

      const { contribution, user, group } = await getContributionContext(userId, contribution_id);
      if (contribution.payment_status === 'paid') {
        throw new AppError('This contribution has already been paid.', 409, 'CONTRIBUTION_ALREADY_PAID');
      }

      const providerCountry = group.payment_provider === 'flutterwave' ? 'NG' : 'GB';
      const provider = getPaymentProvider(providerCountry);
      const customerId = group.payment_provider === 'flutterwave'
        ? user.email
        : (user.stripe_customer_id ?? '');
      const paymentMethodId = group.payment_provider === 'flutterwave'
        ? (user.flutterwave_card_token ?? '')
        : (user.stripe_payment_method_id ?? '');

      if (!customerId || !paymentMethodId) {
        throw new AppError('Add a payment method before contributing.', 400, 'NO_PAYMENT_METHOD');
      }

      const amountInSmallestUnit = Math.round(Number.parseFloat(contribution.amount_due) * 100);
      if (!Number.isFinite(amountInSmallestUnit) || amountInSmallestUnit <= 0) {
        throw new AppError('Contribution amount is invalid.', 400, 'INVALID_CONTRIBUTION_AMOUNT');
      }

      const result = await provider.chargeContribution({
        customerId,
        paymentMethodId,
        amount:         amountInSmallestUnit,
        currency:       group.currency,
        contributionId: contribution_id,
        description:    `PadiHub contribution — ${group.name} cycle ${contribution.cycle_number}`,
      });

      await createAuditLog({
        userId,
        action: 'CONTRIBUTION_CHARGE_INITIATED',
        entity: 'contributions',
        entityId: contribution_id,
        metadata: result as unknown as Record<string, unknown>,
      });
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },
};
