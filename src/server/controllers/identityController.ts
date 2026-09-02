/**
 * Identity Verification controller.
 * UK  → Stripe Identity, triggered as an embedded modal from our own
 *       dashboard (stripe.verifyIdentity(clientSecret)) — never a redirect
 *       to a Stripe-hosted page.
 * NG  → Flutterwave Account Resolve — a free, interim "bank account
 *       validation" step (confirms a bank account number matches a real
 *       account holder name), NOT full identity/KYC verification. Kept
 *       behind a swappable interface so Dojah/Monnify can replace or
 *       supplement it later — see BankAccountValidationInterface.ts.
 *
 * Both markets mirror the same charge-gating pattern: no subscription
 * charge occurs until the relevant check succeeds — see
 * identityVerificationService.ts, which is the single place that turns a
 * success/failure into the resulting charge (or lack of one).
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
import { identityVerificationService } from '../services/identityVerificationService.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { ip } from '../lib/reqHelpers.js';
import { TRUST_SCORE_DELTA_IDENTITY_VERIFIED } from '../lib/constants.js';

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
      await identityVerificationService.completeIdentityVerification(userId, 'GB');
    } else if (result.event === 'identity.verification_session.requires_input') {
      await identityVerificationService.failIdentityVerification(userId);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[IdentityWebhook] Handler error:', err);
    next(err);
  }
}

// ── NG: Resolve bank account (Flutterwave Account Resolve) ───────────────────
export async function resolveNgBankAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const userRows = await db.select({ country: schema.users.country })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    if (userRows[0].country !== 'NG') throw new AppError('This endpoint is for Nigerian users only.', 403);

    const { account_number, bank_code } = req.body as { account_number?: string; bank_code?: string };
    if (!account_number || !bank_code) {
      throw new AppError('account_number and bank_code are required.', 400);
    }

    const result = await flutterwaveIdentity.validateBankAccount(userId, { accountNumber: account_number, bankCode: bank_code });

    if (result.verified) {
      await identityVerificationService.completeIdentityVerification(userId, 'NG');
      await createAuditLog({ userId, action: 'BANK_ACCOUNT_RESOLVED', entity: 'users', entityId: userId, ipAddress: ip(req.ip) });
    } else {
      await identityVerificationService.failIdentityVerification(userId);
      await createAuditLog({ userId, action: 'BANK_ACCOUNT_RESOLVE_FAILED', entity: 'users', entityId: userId, ipAddress: ip(req.ip) });
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
        .set({ identity_verified: true, identity_verified_at: new Date(), identity_verification_status: 'verified' })
        .where(eq(schema.users.id, userId));

      // Mirrors the real Stripe/Flutterwave verification flows — a verified
      // identity should always raise the Trust Score, even when the
      // verification itself was bypassed for testing. Bypass intentionally
      // does NOT activate/charge a subscription — it only unblocks the
      // group-joining/creation gate for testing those flows in isolation.
      await trustScoreService.increase(userId, TRUST_SCORE_DELTA_IDENTITY_VERIFIED, 'IDENTITY_VERIFIED');

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
