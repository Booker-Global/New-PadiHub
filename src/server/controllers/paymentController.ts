/**
 * Payment controller — setup intent, payment-method storage, Connect onboarding,
 * hosted Flutterwave setup, and manual contribution charge trigger.
 */
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import axios from 'axios';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { getStripeProvider, getFlutterwaveProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { contributionService } from '../services/contributionService.js';
import { getPaymentEligibility } from '../services/paymentEligibilityService.js';
import { calculateContributionFees } from '../lib/paymentFees.js';
import { qs } from '../lib/reqHelpers.js';

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

function getBaseAppUrl() {
  const candidate = process.env.APP_URL ?? process.env.VITE_PUBLIC_URL ?? 'https://padihub.com';

  try {
    return new URL(candidate).origin;
  } catch {
    return 'https://padihub.com';
  }
}

function buildFlutterwaveSetupTxRef(userId: string, contributionId: string) {
  return `${FLUTTERWAVE_SETUP_TX_REF_PREFIX}__${userId}__${contributionId}__${randomUUID()}`;
}

function isFlutterwaveSetupTxRefOwnedByUser(txRef: string, userId: string) {
  const [prefix, ownerUserId] = txRef.split('__');
  return prefix === FLUTTERWAVE_SETUP_TX_REF_PREFIX && ownerUserId === userId;
}

/**
 * Extracts a human-readable message from a Stripe SDK error or an axios error
 * from the Flutterwave REST API, instead of letting these bubble up as plain
 * Errors — which the global error handler masks as a generic "An unexpected
 * error occurred." (see errorHandler.ts), hiding the actual, actionable cause
 * (e.g. an invalid sort code, or Connect not being enabled on the platform's
 * Stripe account) from both the member and whoever is debugging the report.
 */
function describeProviderError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    return data?.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

function getFlutterwaveSetupAmount() {
  const parsed = Number.parseFloat(process.env.FLUTTERWAVE_PAYMENT_METHOD_SETUP_AMOUNT ?? `${DEFAULT_FLUTTERWAVE_SETUP_AMOUNT}`);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError('FLUTTERWAVE_PAYMENT_METHOD_SETUP_AMOUNT must be a positive number.', 500);
  }
  return parsed;
}

/**
 * Compute this contribution's itemised fee surcharge without charging
 * anything. Shared by the fee-preview endpoint (so the frontend can itemise
 * the charge before the member confirms) and the actual charge flow below,
 * so the numbers shown to the member always match what they're charged.
 */
async function computeContributionFeeBreakdown(contribution: typeof schema.contributions.$inferSelect, group: typeof schema.savingsGroups.$inferSelect) {
  const amountInSmallestUnit = Math.round(Number.parseFloat(contribution.amount_due) * 100);
  if (!Number.isFinite(amountInSmallestUnit) || amountInSmallestUnit <= 0) {
    throw new AppError('Contribution amount is invalid.', 400, 'INVALID_CONTRIBUTION_AMOUNT');
  }

  // The cycle pot and contributing-member count are both fixed the moment a
  // cycle's contribution schedule is generated (before any charging begins),
  // so the payout-fee split can be computed synchronously here regardless of
  // contribution frequency (daily/weekly/monthly).
  const cycleContributions = await contributionService.getForGroup(group.id, contribution.cycle_number);
  const contributingMemberCount = Math.max(cycleContributions.length, 1);
  const cyclePotAmount = cycleContributions.reduce(
    (sum, c) => sum + Math.round(Number.parseFloat(c.amount_due) * 100), 0,
  ) || amountInSmallestUnit;

  const breakdown = calculateContributionFees({
    provider: group.payment_provider,
    contributionAmount: amountInSmallestUnit,
    cyclePotAmount,
    contributingMemberCount,
  });

  return { amountInSmallestUnit, breakdown, contributingMemberCount, cyclePotAmount };
}

/**
 * Core contribution-charge logic, shared by the interactive
 * POST /api/payments/charge-contribution endpoint and the automated daily
 * scheduled job. Charges the member's saved payment method via the group's
 * payment provider, then synchronously reconciles the contribution's status
 * from the provider's immediate response (the Stripe/Flutterwave webhook
 * handlers remain the source of truth and will no-op if this already marked
 * the contribution paid/failed, since markPaid/markFailed are idempotent
 * against contributions already in a terminal state).
 */
export async function chargeContributionForUser(userId: string, contributionId: string) {
  const { contribution, user, group } = await getContributionContext(userId, contributionId);
  if (contribution.payment_status === 'paid') {
    throw new AppError('This contribution has already been paid.', 409, 'CONTRIBUTION_ALREADY_PAID');
  }

  const provider = group.payment_provider === 'flutterwave'
    ? getFlutterwaveProvider()
    : getStripeProvider();
  const customerId = group.payment_provider === 'flutterwave'
    ? user.email
    : (user.stripe_customer_id ?? '');
  const paymentMethodId = group.payment_provider === 'flutterwave'
    ? (user.flutterwave_card_token ?? '')
    : (user.stripe_payment_method_id ?? '');

  if (!customerId || !paymentMethodId) {
    throw new AppError('Add a payment method before contributing.', 400, 'NO_PAYMENT_METHOD');
  }

  // The provider processing fee AND this member's share of the cycle's
  // payout fee are both added on top of the contribution amount (the member
  // pays amount_due + fees) rather than deducted from the group pot — see
  // paymentFees.ts. Members consent to this when accepting the payment
  // terms & conditions while saving a payment method.
  const { amountInSmallestUnit, breakdown } = await computeContributionFeeBreakdown(contribution, group);
  const totalChargeInSmallestUnit = amountInSmallestUnit + breakdown.totalFee;

  const result = await provider.chargeContribution({
    customerId,
    paymentMethodId,
    amount:         totalChargeInSmallestUnit,
    currency:       group.currency,
    countryCode:    group.country,
    contributionId,
    description:    `PadiHub contribution — ${group.name} cycle ${contribution.cycle_number}`,
  });

  const feeBreakdownStrings = {
    feeAmount:                  (breakdown.totalFee / 100).toFixed(2),
    cardFeeAmount:              (breakdown.cardFee / 100).toFixed(2),
    cardFeeVatAmount:           (breakdown.cardFeeVat / 100).toFixed(2),
    payoutFeeShareAmount:       (breakdown.payoutFeeShare / 100).toFixed(2),
    payoutFeeShareVatAmount:    (breakdown.payoutFeeShareVat / 100).toFixed(2),
  };
  if (result.status === 'succeeded') {
    await contributionService.markPaid(contributionId, result.providerReference, undefined, feeBreakdownStrings);
  } else if (result.status === 'failed') {
    await contributionService.markFailed(contributionId);
  }

  await createAuditLog({
    userId,
    action: 'CONTRIBUTION_CHARGE_INITIATED',
    entity: 'contributions',
    entityId: contributionId,
    metadata: { ...result, ...feeBreakdownStrings } as unknown as Record<string, unknown>,
  });

  return result;
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
      const { payment_method_id, terms_accepted } = req.body as { payment_method_id?: string; terms_accepted?: boolean };
      if (!payment_method_id) throw new AppError('payment_method_id is required.', 400);
      if (terms_accepted !== true) {
        throw new AppError('You must accept the payment terms & conditions to save a payment method.', 400, 'TERMS_NOT_ACCEPTED');
      }

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

      if (!customerId) {
        throw new AppError('Stripe did not attach this payment method to your customer record. Start setup again.', 400, 'PAYMENT_METHOD_NOT_ATTACHED');
      }

      if (customerId !== user.stripe_customer_id) {
        throw new AppError('This payment method is not attached to your Stripe customer record.', 403, 'PAYMENT_METHOD_MISMATCH');
      }

      await getStripeProvider().setCustomerDefaultPaymentMethod({
        customerId: user.stripe_customer_id,
        paymentMethodId: payment_method_id,
      });

      await db.update(schema.users)
        .set({
          stripe_payment_method_id: payment_method_id,
          payment_method_verified_at: new Date(),
          payment_terms_accepted_at: new Date(),
        })
        .where(eq(schema.users.id, userId));

      await createAuditLog({
        userId,
        action: 'STRIPE_PAYMENT_METHOD_SAVED',
        entity: 'users',
        entityId: userId,
        metadata: { paymentMethodId: payment_method_id },
      });

      // The platform subscription is intentionally NOT created/charged here.
      // For UK members, the card is only ever saved (never charged) at this
      // point — the subscription is only created once Stripe Identity
      // verification succeeds, via identityVerificationService, so the
      // member is never billed before their identity is confirmed. The
      // frontend should trigger identity verification next.
      res.json({
        success: true,
        data: { payment_method_id, next_step: 'verify_identity' },
      });
    } catch (e) { next(e); }
  },

  /** POST /api/payments/create-flutterwave-payment-link — redirect to hosted checkout to save a card token */
  createFlutterwavePaymentLink: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { contribution_id, terms_accepted } = req.body as { contribution_id?: string; terms_accepted?: boolean };
      if (terms_accepted !== true) {
        throw new AppError('You must accept the payment terms & conditions to save a payment method.', 400, 'TERMS_NOT_ACCEPTED');
      }

      let user: Awaited<ReturnType<typeof getUserOrThrow>>;
      let currency: string;
      let country: string;
      let groupName: string | undefined;
      let redirectUrl: URL;

      if (contribution_id) {
        const context = await getContributionContext(userId, contribution_id);
        if (context.group.payment_provider !== 'flutterwave' || context.group.country !== 'NG' || context.group.currency !== 'NGN') {
          throw new AppError('Flutterwave card setup is only available for Nigerian NGN groups.', 400);
        }
        user = context.user;
        currency = context.group.currency;
        country = context.group.country;
        groupName = context.group.name;
        redirectUrl = new URL(`/savings-groups/${context.group.id}/contribute`, getBaseAppUrl());
        redirectUrl.searchParams.set('contribution_id', context.contribution.id);
      } else {
        // Standalone setup — not tied to any contribution/group. Every member
        // needs a payment method to contribute, whether or not they've joined
        // a group yet, so this is derived entirely from the user's own profile.
        user = await getUserOrThrow(userId);
        if (user.country !== 'NG' || user.currency !== 'NGN') {
          throw new AppError('Flutterwave card setup is only available for Nigerian NGN users.', 400);
        }
        currency = user.currency;
        country = user.country;
        redirectUrl = new URL('/payments/methods', getBaseAppUrl());
      }

      const verificationAmount = getFlutterwaveSetupAmount();
      const txRef = buildFlutterwaveSetupTxRef(userId, contribution_id ?? 'standalone');
      redirectUrl.searchParams.set('setup_provider', 'flutterwave');

      const result = await getFlutterwaveProvider().createHostedPaymentLink({
        amount: verificationAmount,
        currency,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        txRef,
        redirectUrl: redirectUrl.toString(),
        title: 'Save card for future contributions',
        description: groupName ? `Save a card for ${groupName}` : 'Save a card for your PadiHub contributions',
        meta: {
          padihub_user_id: userId,
          contribution_id: contribution_id ?? null,
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
          contributionId: contribution_id ?? null,
          verificationAmount,
          currency,
          country,
        },
      });

      res.json({
        success: true,
        data: {
          ...result,
          tx_ref: txRef,
          verification_amount: verificationAmount,
          currency,
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
      if (!tx_ref) throw new AppError('tx_ref is required.', 400);

      const user = await getUserOrThrow(userId);
      const result = await getFlutterwaveProvider().verifyTransaction({
        transactionId: transaction_id.toString(),
      });

      if (!isFlutterwaveSetupTxRefOwnedByUser(result.txRef, userId)) {
        throw new AppError('This Flutterwave transaction does not belong to your payment-method setup flow.', 403, 'PAYMENT_METHOD_MISMATCH');
      }

      if (tx_ref !== result.txRef) {
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
          payment_method_verified_at: new Date(),
          // Reaching this point requires having initiated the hosted
          // checkout via createFlutterwavePaymentLink, which already
          // required terms_accepted === true — record the acceptance here.
          payment_terms_accepted_at: new Date(),
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

      // The platform subscription is intentionally NOT created/charged here.
      // For NG members, this only saves a reusable card token — the
      // subscription is only created once Flutterwave Account Resolve
      // succeeds, via identityVerificationService, mirroring the UK
      // charge-gating pattern exactly. The frontend should trigger the
      // Account Resolve bank-details step next.
      res.json({
        success: true,
        data: {
          transaction_id: result.transactionId,
          tx_ref: result.txRef,
          next_step: 'verify_identity',
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

        let result: { subaccountId: string };
        try {
          result = await getFlutterwaveProvider().createSubaccount({
            userId,
            businessName:   business_name,
            bankCode:       bank_code,
            accountNumber:  account_number,
          });
        } catch (providerErr) {
          throw new AppError(
            describeProviderError(providerErr, 'Could not create your Flutterwave payout account.'),
            502, 'FLUTTERWAVE_SUBACCOUNT_ERROR',
          );
        }

        // Flutterwave subaccounts are usable immediately — there's no separate
        // hosted onboarding step to wait on (unlike Stripe Express), so the
        // payout destination is considered verified as soon as it's created.
        await db.update(schema.users)
          .set({ flutterwave_subaccount_id: result.subaccountId, payout_verified_at: new Date() })
          .where(eq(schema.users.id, userId));

        await createAuditLog({ userId, action: 'FLW_SUBACCOUNT_CREATED', entity: 'users', entityId: userId });
        return res.json({ success: true, data: result });
      }

      // UK — Stripe Express. Bank details collected in-app are attached
      // directly to the connected account via the API so the member doesn't
      // have to re-type them; Stripe's hosted onboarding link is only used
      // for whatever requirements are still outstanding afterwards (normally
      // identity verification), and is skipped entirely if nothing is due.
      const { account_holder_name, sort_code, account_number: uk_account_number } = req.body as {
        account_holder_name?: string; sort_code?: string; account_number?: string;
      };
      if (!account_holder_name || !sort_code || !uk_account_number) {
        throw new AppError('account_holder_name, sort_code, and account_number are required for UK accounts.', 400);
      }

      const stripeProvider = getStripeProvider();
      let accountId = user.stripe_connected_account_id;

      try {
        if (!accountId) {
          const created = await stripeProvider.createConnectedAccount({
            userId, email: user.email, country: user.country,
            firstName: user.first_name, lastName: user.last_name,
          });
          accountId = created.accountId;
          await db.update(schema.users)
            .set({ stripe_connected_account_id: accountId })
            .where(eq(schema.users.id, userId));
          await createAuditLog({ userId, action: 'STRIPE_CONNECT_ACCOUNT_CREATED', entity: 'users', entityId: userId });
        }

        await stripeProvider.attachExternalBankAccount({
          accountId,
          accountHolderName: account_holder_name,
          sortCode:          sort_code,
          accountNumber:     uk_account_number,
          country:           user.country,
          currency:          user.currency.toLowerCase(),
        });
        await createAuditLog({ userId, action: 'STRIPE_EXTERNAL_ACCOUNT_ATTACHED', entity: 'users', entityId: userId });

        const outstanding = await stripeProvider.getOutstandingRequirements(accountId);
        const onboardingUrl = outstanding.length
          ? (await stripeProvider.createOnboardingLink(accountId)).onboardingUrl
          : undefined;

        res.json({ success: true, data: { accountId, onboardingUrl } });
      } catch (providerErr) {
        throw new AppError(
          describeProviderError(providerErr, 'Could not connect your Stripe payout account.'),
          502, 'STRIPE_CONNECT_ERROR',
        );
      }
    } catch (e) { next(e); }
  },

  /** POST /api/payments/verify-payout — force a live re-check of payout destination status */
  verifyPayout: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const user = await getUserOrThrow(userId);

      const hasDestination = user.country === 'NG'
        ? Boolean(user.flutterwave_subaccount_id)
        : Boolean(user.stripe_connected_account_id);
      if (!hasDestination) {
        throw new AppError('Connect a payout destination before verifying it.', 400, 'PAYOUT_NOT_CONNECTED');
      }

      const eligibility = await getPaymentEligibility(userId);
      res.json({
        success: true,
        data: {
          has_payout: eligibility.hasPayout,
          payout_verified: eligibility.payoutVerified,
        },
      });
    } catch (e) { next(e); }
  },

  /** POST /api/payments/charge-contribution — manually trigger a contribution charge */
  chargeContribution: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { contribution_id } = req.body as { contribution_id?: string };
      if (!contribution_id) throw new AppError('contribution_id is required.', 400);

      const result = await chargeContributionForUser(userId, contribution_id);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },

  /**
   * GET /api/payments/contribution-fee-preview?contribution_id=...
   * Returns the itemised fee breakdown a contribution would be charged,
   * without charging anything — used by the contribution page to itemise
   * the card/transaction fee and payout-fee share before the member confirms.
   */
  contributionFeePreview: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const contributionId = qs(req.query.contribution_id);
      if (!contributionId) throw new AppError('contribution_id is required.', 400);

      const { contribution, group } = await getContributionContext(userId, contributionId);
      const { amountInSmallestUnit, breakdown } = await computeContributionFeeBreakdown(contribution, group);

      res.json({
        success: true,
        data: {
          amount_due:            (amountInSmallestUnit / 100).toFixed(2),
          card_fee:              (breakdown.cardFee / 100).toFixed(2),
          card_fee_vat:          (breakdown.cardFeeVat / 100).toFixed(2),
          payout_fee_share:      (breakdown.payoutFeeShare / 100).toFixed(2),
          payout_fee_share_vat:  (breakdown.payoutFeeShareVat / 100).toFixed(2),
          total_fee:             (breakdown.totalFee / 100).toFixed(2),
          total_charge:          ((amountInSmallestUnit + breakdown.totalFee) / 100).toFixed(2),
          currency:              group.currency,
          provider:              group.payment_provider,
        },
      });
    } catch (e) { next(e); }
  },

  /** GET /api/payments/banks — Flutterwave bank list, used to populate the NG payout-setup dropdown */
  listBanks: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const user = await getUserOrThrow(userId);
      if (user.country !== 'NG') {
        throw new AppError('The bank list is only available for Nigerian (NG) accounts.', 400);
      }

      let banks: { code: string; name: string }[];
      try {
        banks = await getFlutterwaveProvider().listBanks('NG');
      } catch (providerErr) {
        throw new AppError(
          describeProviderError(providerErr, 'Could not load the list of banks.'),
          502, 'FLUTTERWAVE_BANK_LIST_ERROR',
        );
      }

      res.json({ success: true, data: banks });
    } catch (e) { next(e); }
  },
};
