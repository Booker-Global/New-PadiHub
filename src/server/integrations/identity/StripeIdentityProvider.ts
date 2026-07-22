/**
 * Stripe Identity provider — UK users only.
 * Verification fee: £1.50 added as a pending invoice item on the user's
 * Stripe customer record. It is automatically included in their first
 * subscription invoice (or next invoice if already subscribed).
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

    // Persist session ID on user record
    await db.update(schema.users)
      .set({ stripe_identity_session_id: session.id })
      .where(eq(schema.users.id, userId));

    return {
      sessionId:    session.id,
      clientSecret: session.client_secret ?? undefined,
      url:          session.url ?? undefined,
    };
  }

  async getVerificationStatus(userId: string): Promise<VerificationStatusResult> {
    const rows = await db.select({
      identity_verified:          schema.users.identity_verified,
      identity_verified_at:       schema.users.identity_verified_at,
      stripe_identity_session_id: schema.users.stripe_identity_session_id,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!rows.length) return { verified: false };
    const u = rows[0];
    return {
      verified:   u.identity_verified,
      verifiedAt: u.identity_verified_at ?? undefined,
      sessionId:  u.stripe_identity_session_id ?? undefined,
    };
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

  async addVerificationFeeToFirstInvoice(userId: string): Promise<void> {
    const stripe = getStripe();
    const rows = await db.select({ stripe_customer_id: schema.users.stripe_customer_id })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length || !rows[0].stripe_customer_id) return;

    await stripe.invoiceItems.create({
      customer:    rows[0].stripe_customer_id,
      amount:      150,   // £1.50 in pence
      currency:    'gbp',
      description: 'Identity Verification Fee (one-time)',
    });
  }
}
