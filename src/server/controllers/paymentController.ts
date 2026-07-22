/**
 * Payment controller — setup intent, Connect onboarding, manual charge trigger.
 */
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { getPaymentProvider, getStripeProvider, getFlutterwaveProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { createAuditLog } from '../middleware/auditLogger.js';

export const paymentController = {
  /** POST /api/payments/setup-intent — returns client_secret for Stripe.js */
  setupIntent: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!userRows.length) throw new AppError('User not found.', 404);
      const user = userRows[0];

      if (!user.stripe_customer_id) throw new AppError('No Stripe customer record. Complete onboarding first.', 400);

      const result = await getStripeProvider().savePaymentMethod({
        customerId: user.stripe_customer_id,
        userId,
      });
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },

  /** POST /api/payments/connect-onboard — create Stripe Express account for group leader */
  connectOnboard: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!userRows.length) throw new AppError('User not found.', 404);
      const user = userRows[0];

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
      const { contribution_id } = req.body as { contribution_id: string };
      if (!contribution_id) throw new AppError('contribution_id is required.', 400);

      const contribRows = await db.select().from(schema.contributions)
        .where(eq(schema.contributions.id, contribution_id)).limit(1);
      if (!contribRows.length) throw new AppError('Contribution not found.', 404);
      const contrib = contribRows[0];
      if (contrib.member_id !== userId) throw new AppError('Not your contribution.', 403);

      const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!userRows.length) throw new AppError('User not found.', 404);
      const user = userRows[0];

      const groupRows = await db.select().from(schema.savingsGroups)
        .where(eq(schema.savingsGroups.id, contrib.group_id)).limit(1);
      if (!groupRows.length) throw new AppError('Group not found.', 404);
      const group = groupRows[0];

      const provider = getPaymentProvider(user.country);
      const customerId  = user.country === 'NG' ? user.email : (user.stripe_customer_id ?? '');
      const paymentMethodId = user.country === 'NG'
        ? (user.flutterwave_customer_id ?? '')
        : (user.stripe_customer_id ?? ''); // frontend stores pm_xxx via setup intent

      const amountInSmallestUnit = Math.round(parseFloat(contrib.amount_due) * 100);

      const result = await provider.chargeContribution({
        customerId,
        paymentMethodId,
        amount:         amountInSmallestUnit,
        currency:       group.currency,
        contributionId: contribution_id,
        description:    `PadiHub contribution — ${group.name} cycle ${contrib.cycle_number}`,
      });

      await createAuditLog({
        userId, action: 'CONTRIBUTION_CHARGE_INITIATED', entity: 'contributions',
        entityId: contribution_id, metadata: result as unknown as Record<string, unknown>,
      });
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },
};
