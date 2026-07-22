import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { validate } from '../middleware/validate.js';
import { pp } from '../lib/reqHelpers.js';
import { notificationService } from '../services/notificationService.js';
import {
  sendSupportTicketReceivedEmail,
  sendSupportTicketUpdatedEmail,
  sendSupportTicketClosedEmail,
} from '../integrations/email/emailService.js';

const createSchema = z.object({
  subject:     z.string().min(5).max(255),
  category:    z.enum(['payments', 'groups', 'subscriptions', 'technical', 'general']),
  description: z.string().min(10),
  priority:    z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

const updateSchema = z.object({
  description: z.string().min(10).optional(),
  priority:    z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

export const supportController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await db.select().from(schema.supportTickets)
        .where(eq(schema.supportTickets.user_id, req.user!.userId))
        .orderBy(desc(schema.supportTickets.created_at));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  getOne: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tid = pp(req.params.id);
      const rows = await db.select().from(schema.supportTickets)
        .where(eq(schema.supportTickets.id, tid)).limit(1);
      if (!rows.length) return res.status(404).json({ success: false, message: 'Ticket not found.' });
      // Users can only view their own tickets
      if (rows[0].user_id !== req.user!.userId) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      res.json({ success: true, data: rows[0] });
    } catch (e) { next(e); }
  },

  create: [
    validate(createSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id        = uuidv4();
        const ticketRef = `TKT-${id.slice(0, 8).toUpperCase()}`;
        await db.insert(schema.supportTickets).values({
          id,
          user_id:     req.user!.userId,
          subject:     req.body.subject as string,
          category:    req.body.category as 'payments',
          description: req.body.description as string,
          priority:    (req.body.priority as 'medium' | undefined) ?? 'medium',
          status:      'open',
        });

        const userRow = await db.select({ email: schema.users.email })
          .from(schema.users).where(eq(schema.users.id, req.user!.userId)).limit(1);
        if (userRow.length) {
          await sendSupportTicketReceivedEmail(userRow[0].email, ticketRef, req.body.subject as string);
        }

        res.status(201).json({ success: true, data: { id, ticketRef } });
      } catch (e) { next(e); }
    },
  ],

  update: [
    validate(updateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tid = pp(req.params.id);
        const rows = await db.select({ user_id: schema.supportTickets.user_id })
          .from(schema.supportTickets).where(eq(schema.supportTickets.id, tid)).limit(1);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Ticket not found.' });
        if (rows[0].user_id !== req.user!.userId) {
          return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const updates: Record<string, unknown> = {};
        if (req.body.description) updates.description = req.body.description;
        if (req.body.priority)    updates.priority    = req.body.priority;
        // User updating their ticket moves it back to open
        updates.status = 'open';

        await db.update(schema.supportTickets).set(updates).where(eq(schema.supportTickets.id, tid));

        await notificationService.create({
          userId: req.user!.userId, type: 'support_ticket_updated',
          title: 'Support Ticket Updated',
          message: 'Your support ticket has been updated.',
        });

        res.json({ success: true, message: 'Ticket updated.' });
      } catch (e) { next(e); }
    },
  ],
};

// ── Admin helpers (called from adminController) ───────────────────────────────

export async function notifySupportTicketUpdated(ticketId: string, response: string) {
  const ticket = await db.select({ user_id: schema.supportTickets.user_id, subject: schema.supportTickets.subject })
    .from(schema.supportTickets).where(eq(schema.supportTickets.id, ticketId)).limit(1);
  if (!ticket.length) return;
  const userRow = await db.select({ email: schema.users.email })
    .from(schema.users).where(eq(schema.users.id, ticket[0].user_id)).limit(1);
  if (userRow.length) {
    const ticketRef = `TKT-${ticketId.slice(0, 8).toUpperCase()}`;
    await sendSupportTicketUpdatedEmail(userRow[0].email, ticketRef, response);
  }
  await notificationService.create({
    userId: ticket[0].user_id, type: 'support_ticket_updated',
    title: 'Support Ticket Updated',
    message: 'An administrator has responded to your support ticket.',
  });
}

export async function notifySupportTicketClosed(ticketId: string, resolution: string) {
  const ticket = await db.select({ user_id: schema.supportTickets.user_id })
    .from(schema.supportTickets).where(eq(schema.supportTickets.id, ticketId)).limit(1);
  if (!ticket.length) return;
  const userRow = await db.select({ email: schema.users.email })
    .from(schema.users).where(eq(schema.users.id, ticket[0].user_id)).limit(1);
  if (userRow.length) {
    const ticketRef = `TKT-${ticketId.slice(0, 8).toUpperCase()}`;
    await sendSupportTicketClosedEmail(userRow[0].email, ticketRef, resolution);
  }
  await notificationService.create({
    userId: ticket[0].user_id, type: 'support_ticket_closed',
    title: 'Support Ticket Resolved',
    message: 'Your support ticket has been resolved and closed.',
  });
}
