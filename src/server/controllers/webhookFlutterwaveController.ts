/**
 * Flutterwave webhook handler.
 * Endpoint must be publicly accessible — no authenticate middleware.
 * Raw body required for HMAC signature verification.
 */
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { contributionService } from '../services/contributionService.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from '../services/notificationService.js';

export async function flutterwaveWebhookHandler(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[FLWWebhook] FLUTTERWAVE_WEBHOOK_SECRET not set.');
    return res.status(500).json({ error: 'Webhook secret not configured.' });
  }

  const signature = req.headers['verif-hash'] as string;
  if (!signature || signature !== secret) {
    console.warn('[FLWWebhook] Invalid webhook signature.');
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  const body = req.body as Record<string, unknown>;

  try {
    await handleFlutterwaveEvent(body);
    res.json({ received: true });
  } catch (err) {
    console.error('[FLWWebhook] Handler error:', err);
    next(err);
  }
}

async function handleFlutterwaveEvent(body: Record<string, unknown>) {
  const event = body.event as string;
  const data  = body.data as Record<string, unknown> | undefined;
  if (!data) return;

  switch (event) {

    case 'charge.completed': {
      const status    = data.status as string;
      const txRef     = data.tx_ref as string;   // this is our contribution_id
      const flwRef    = data.flw_ref as string;
      const token     = (data.card as Record<string, unknown> | undefined)?.token as string | undefined;

      if (!txRef) break;

      if (status === 'successful') {
        await contributionService.markPaid(txRef, flwRef ?? txRef);

        // If a card token was returned, store it on the user record
        if (token) {
          const contribRows = await db.select({ member_id: schema.contributions.member_id })
            .from(schema.contributions).where(eq(schema.contributions.id, txRef)).limit(1);
          if (contribRows.length) {
            await db.update(schema.users)
              .set({ flutterwave_customer_id: token })
              .where(eq(schema.users.id, contribRows[0].member_id));
          }
        }

        await createAuditLog({
          action: 'FLW_CHARGE_SUCCEEDED', entity: 'contributions',
          entityId: txRef, metadata: { flwRef, status },
        });
      } else {
        await contributionService.markFailed(txRef);
        await createAuditLog({
          action: 'FLW_CHARGE_FAILED', entity: 'contributions',
          entityId: txRef, metadata: { flwRef, status },
        });
      }
      break;
    }

    case 'transfer.completed': {
      const reference = data.reference as string;
      const status    = data.status as string;
      const transferId = data.id?.toString() ?? reference;

      // reference is `transfer-{rotationId}` — extract rotationId
      const rotationId = reference?.replace('transfer-', '');
      if (!rotationId) break;

      if (status === 'SUCCESSFUL') {
        await db.update(schema.rotations)
          .set({ payout_status: 'completed', provider_transfer_reference: transferId, completed_date: new Date() })
          .where(eq(schema.rotations.id, rotationId));

        const rotRows = await db.select({ recipient_id: schema.rotations.recipient_id, cycle_number: schema.rotations.cycle_number })
          .from(schema.rotations).where(eq(schema.rotations.id, rotationId)).limit(1);
        if (rotRows.length) {
          await notificationService.create({
            userId: rotRows[0].recipient_id, type: 'payout_complete',
            title: 'Payout Received',
            message: `Your payout for cycle ${rotRows[0].cycle_number} has been transferred to your account.`,
          });
        }
      } else {
        await db.update(schema.rotations)
          .set({ payout_status: 'failed' })
          .where(eq(schema.rotations.id, rotationId));
      }

      await createAuditLog({
        action: 'FLW_TRANSFER_COMPLETED', entity: 'rotations',
        entityId: rotationId, metadata: { transferId, status },
      });
      break;
    }

    default:
      console.log(`[FLWWebhook] Unhandled event: ${event}`);
  }
}
