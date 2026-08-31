/**
 * Identity Verification controller.
 * UK  → Stripe Identity (hosted flow)
 * NG  → Flutterwave BVN (OTP flow)
 */
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { StripeIdentityProvider } from '../integrations/identity/StripeIdentityProvider.js';
import { FlutterwaveIdentityProvider } from '../integrations/identity/FlutterwaveIdentityProvider.js';
import { trustScoreService } from '../services/trustScoreService.js';
import { notificationService } from '../services/notificationService.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import {
  sendIdentityVerifiedEmail,
  sendVerificationFeeChargedEmail,
} from '../integrations/email/emailService.js';
import { ip } from '../lib/reqHelpers.js';
import { TRUST_SCORE_DELTA_IDENTITY_VERIFIED, isSubscriptionTierKey, formatTierPrice } from '../lib/constants.js';

const stripeIdentity      = new StripeIdentityProvider();
const flutterwaveIdentity = new FlutterwaveIdentityProvider();

/**
 * KYC/identity-verification test-mode bypass gate (see section 2.2 of the
 * architecture doc). Real ID verification is intentionally deferred for this
 * testing round so the rest of the flow (groups, payments, payouts, trust
 * score) can be exercised end-to-end without it.
 *
 * This MUST be hard-gated behind an explicit env flag AND never be reachable
 * in production, even if KYC_BYPASS is accidentally left set — the NODE_ENV
 * check is not optional and is evaluated first.
 */
function isKycBypassEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.KYC_BYPASS === 'true';
}

// ── UK: Start Stripe Identity session ────────────────────────────────────────
export async function startStripeIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const userRows = await db.select({ country: schema.users.country })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    if (userRows[0].country === 'NG') throw new AppError('This endpoint is for UK users only.', 403);

    const result = await stripeIdentity.createVerificationSession(userId);
    await createAuditLog({ userId, action: 'IDENTITY_SESSION_STARTED', entity: 'users', entityId: userId, ipAddress: ip(req.ip) });
    res.status(201).json({ success: true, data: result });
  } catch (e) { next(e); }
}

// ── UK: Stripe Identity webhook (public — no auth middleware) ─────────────────
export async function stripeIdentityWebhook(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['stripe-signature'] as string;
  if (!signature) return res.status(400).json({ error: 'Missing stripe-signature header.' });

  let result: { handled: boolean; event?: string; userId?: string };
  try {
    result = await stripeIdentity.handleWebhook(req.body as Buffer, signature);
  } catch (err) {
    console.error('[IdentityWebhook] Signature error:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed.' });
  }

  if (!result.handled || !result.userId) return res.json({ received: true });

  const userId = result.userId;

  try {
    if (result.event === 'identity.verification_session.verified') {
      await db.update(schema.users)
        .set({ identity_verified: true, identity_verified_at: new Date() })
        .where(eq(schema.users.id, userId));

      // Add £1.50 verification fee as pending invoice item
      await stripeIdentity.addVerificationFeeToFirstInvoice(userId);

      await trustScoreService.increase(userId, TRUST_SCORE_DELTA_IDENTITY_VERIFIED, 'IDENTITY_VERIFIED');
      await notificationService.create({
        userId, type: 'identity_verified',
        title: 'Identity Verified',
        message: 'Your identity has been verified. Your Trust Score has increased.',
      });

      const userRow = await db.select({ email: schema.users.email, first_name: schema.users.first_name, subscription_tier: schema.users.subscription_tier, country: schema.users.country })
        .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (userRow.length) {
        await sendIdentityVerifiedEmail(userRow[0].email, userRow[0].first_name);
        const tier = isSubscriptionTierKey(userRow[0].subscription_tier) ? userRow[0].subscription_tier : 'pro';
        await sendVerificationFeeChargedEmail(userRow[0].email, userRow[0].first_name, formatTierPrice(tier, userRow[0].country));
      }

      await createAuditLog({ userId, action: 'IDENTITY_VERIFIED', entity: 'users', entityId: userId });

    } else if (result.event === 'identity.verification_session.requires_input') {
      await notificationService.create({
        userId, type: 'identity_verification_failed',
        title: 'Identity Verification Needs Attention',
        message: 'Identity verification needs attention. Please complete your verification.',
      });
      await createAuditLog({ userId, action: 'IDENTITY_VERIFICATION_FAILED', entity: 'users', entityId: userId });
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[IdentityWebhook] Handler error:', err);
    next(err);
  }
}

// ── NG: Initiate BVN verification ────────────────────────────────────────────
export async function initiateBvn(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const userRows = await db.select({ country: schema.users.country })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    if (userRows[0].country !== 'NG') throw new AppError('This endpoint is for Nigerian users only.', 403);

    const { bvn } = req.body as { bvn?: string };
    if (!bvn || !/^\d{11}$/.test(bvn)) throw new AppError('BVN must be exactly 11 digits.', 400);

    const result = await flutterwaveIdentity.initiateBvnVerification(userId, bvn);
    await createAuditLog({ userId, action: 'BVN_VERIFICATION_INITIATED', entity: 'users', entityId: userId, ipAddress: ip(req.ip) });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
}

// ── NG: Confirm BVN OTP ───────────────────────────────────────────────────────
export async function confirmBvn(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const { otp } = req.body as { otp?: string };
    if (!otp) throw new AppError('OTP is required.', 400);

    const result = await flutterwaveIdentity.confirmBvnOtp(userId, otp);

    if (result.verified) {
      await trustScoreService.increase(userId, TRUST_SCORE_DELTA_IDENTITY_VERIFIED, 'IDENTITY_VERIFIED');
      await notificationService.create({
        userId, type: 'identity_verified',
        title: 'BVN Verified',
        message: 'Your BVN has been verified. Your Trust Score has increased.',
      });

      const userRow = await db.select({ email: schema.users.email, first_name: schema.users.first_name })
        .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (userRow.length) {
        await sendIdentityVerifiedEmail(userRow[0].email, userRow[0].first_name);
      }

      await createAuditLog({ userId, action: 'IDENTITY_VERIFIED', entity: 'users', entityId: userId, ipAddress: ip(req.ip) });
    } else {
      await createAuditLog({ userId, action: 'IDENTITY_VERIFICATION_FAILED', entity: 'users', entityId: userId, ipAddress: ip(req.ip) });
    }

    res.json({ success: true, data: result });
  } catch (e) { next(e); }
}

// ── GET: Verification status ──────────────────────────────────────────────────
export async function getIdentityStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const userRows = await db.select({ country: schema.users.country })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);

    const provider = userRows[0].country === 'NG' ? flutterwaveIdentity : stripeIdentity;
    const status = await provider.getVerificationStatus(userId);
    res.json({ success: true, data: { ...status, bypass_available: isKycBypassEnabled() } });
  } catch (e) { next(e); }
}

// ── POST: Test-mode KYC bypass (never available in production) ────────────────
export async function bypassIdentityVerification(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isKycBypassEnabled()) {
      throw new AppError(
        'KYC bypass is disabled. Set KYC_BYPASS=true in a non-production environment to enable it for testing.',
        403,
        'KYC_BYPASS_DISABLED',
      );
    }

    const userId = req.user!.userId;
    const userRows = await db.select({ identity_verified: schema.users.identity_verified })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);

    if (!userRows[0].identity_verified) {
      await db.update(schema.users)
        .set({ identity_verified: true, identity_verified_at: new Date() })
        .where(eq(schema.users.id, userId));

      await notificationService.create({
        userId, type: 'identity_verified',
        title: 'Identity Verification Bypassed (Test Mode)',
        message: 'Identity verification was bypassed for testing. This only works outside production.',
      });
      await createAuditLog({ userId, action: 'IDENTITY_VERIFICATION_BYPASSED', entity: 'users', entityId: userId, ipAddress: ip(req.ip) });
    }

    res.json({ success: true, message: 'Identity verification bypassed for testing.', data: { identity_verified: true } });
  } catch (e) { next(e); }
}
