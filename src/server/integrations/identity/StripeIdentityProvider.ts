/**
 * Stripe Identity provider — UK users only.
 * Triggered from our own dashboard via Stripe.js's embedded modal
 * (`stripe.verifyIdentity(clientSecret)`) — never a redirect to a
 * Stripe-hosted page. `createVerificationSession` returns the `clientSecret`
 * the frontend needs for that call; `url`/`return_url` are populated too but
 * are only ever used as a fallback if a member opens the link outside the
 * modal (e.g. from an email), not as the primary flow.
 *
 * Verification fee: the first 50 successfully-verified users platform-wide
 * are free; the 51st onward gets a £1 fee added as a pending invoice item on
 * the user's Stripe customer record, picked up by their first subscription
 * invoice. See identityVerificationService.ts for the atomic counter.
 */
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import type {
  IIdentityVerificationProvider,
  VerificationSessionResult,
  VerificationStatusResult,
  IdentityWebhookResult,
} from './IdentityVerificationInterface.js';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY environment variable is not set.');
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

export class StripeIdentityProvider implements IIdentityVerificationProvider {
  async createVerificationSession(userId: string): Promise<VerificationSessionResult> {
    const stripe = getStripe();
    const appUrl = process.env.APP_URL ?? 'https://padihub.com';

    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { padihub_user_id: userId },
      options: {
        document: {
          allowed_types: ['driving_license', 'passport', 'id_card'],
          require_id_number: false,
          require_live_capture: true,
          require_matching_selfie: true,
        },
      },
      return_url: `${appUrl}/dashboard?identity_verified=1`,
    });

    // Persist session ID + flip status to 'pending' so the profile shows
    // "Pending" while the embedded modal (or webhook) resolves the result.
    await db.update(schema.users)
      .set({ stripe_identity_session_id: session.id, identity_verification_status: 'pending' })
      .where(eq(schema.users.id, userId));

    return {
      sessionId:    session.id,
      clientSecret: session.client_secret ?? undefined,
      url:          session.url ?? undefined,
    };
  }

  async getVerificationStatus(userId: string): Promise<VerificationStatusResult> {
    const rows = await db.select({
      identity_verified:            schema.users.identity_verified,
      identity_verified_at:         schema.users.identity_verified_at,
      identity_verification_status: schema.users.identity_verification_status,
      stripe_identity_session_id:   schema.users.stripe_identity_session_id,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!rows.length) return { verified: false, status: 'not_started' };
    const u = rows[0];
    return {
      verified:   u.identity_verified,
      status:     u.identity_verification_status,
      verifiedAt: u.identity_verified_at ?? undefined,
      sessionId:  u.stripe_identity_session_id ?? undefined,
    };
  }

  /**
   * Ask Stripe directly what happened to this member's VerificationSession.
   *
   * The terminal verified/requires_input result normally arrives by webhook,
   * but a webhook can be missing (endpoint not configured in a sandbox),
   * delayed, or lost — which would otherwise leave the member stuck on
   * "Pending" forever with no way to finish onboarding. Callers use this to
   * reconcile our stored status with Stripe's on demand (same self-heal
   * pattern as refreshStripePayoutVerification for Connect accounts).
   *
   * Returns `null` when there's nothing to reconcile (no session on file, or
   * Stripe could not be reached — never throws, so a status poll can't 500).
   */
  async getRemoteSessionStatus(userId: string): Promise<Stripe.Identity.VerificationSession.Status | null> {
    const rows = await db.select({ stripe_identity_session_id: schema.users.stripe_identity_session_id })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    const sessionId = rows[0]?.stripe_identity_session_id;
    if (!sessionId) return null;

    try {
      const session = await getStripe().identity.verificationSessions.retrieve(sessionId);
      return session.status;
    } catch (err) {
      console.warn('[StripeIdentityProvider] Could not retrieve verification session:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<IdentityWebhookResult> {
    const stripe = getStripe();
    const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_IDENTITY_WEBHOOK_SECRET environment variable is not set.');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      return { handled: false };
    }

    const session = event.data.object as Stripe.Identity.VerificationSession;
    const userId  = session.metadata?.padihub_user_id;
    if (!userId) return { handled: false };

    return { handled: true, event: event.type, userId };
  }

  async addVerificationFeeToFirstInvoice(userId: string, amountPence: number): Promise<void> {
    if (amountPence <= 0) return;

    const stripe = getStripe();
    const rows = await db.select({ stripe_customer_id: schema.users.stripe_customer_id })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length || !rows[0].stripe_customer_id) return;

    await stripe.invoiceItems.create({
      customer:    rows[0].stripe_customer_id,
      amount:      amountPence,
      currency:    'gbp',
      description: 'Identity Verification Fee (one-time)',
    });
  }
}
