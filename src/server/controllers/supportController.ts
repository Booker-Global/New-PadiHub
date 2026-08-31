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
  sendSupportTicketSubmissionEmail,
  sendSupportTicketReceivedEmail,
  sendSupportTicketUpdatedEmail,
  sendSupportTicketClosedEmail,
} from '../integrations/email/emailService.js';

const supportCategories = ['payments', 'groups', 'subscriptions', 'technical', 'general'] as const;
const supportPriorities = ['low', 'medium', 'high', 'urgent'] as const;

type SupportCategory = typeof supportCategories[number];
type SupportPriority = typeof supportPriorities[number];

const supportCategoryLabels: Record<SupportCategory, string> = {
  payments: 'Payments',
  groups: 'Savings groups',
  subscriptions: 'Subscription',
  technical: 'Technical support',
  general: 'General question',
};

const createSchema = z.object({
  subject:     z.string().min(5).max(255),
  category:    z.enum(supportCategories),
  description: z.string().min(10),
  priority:    z.enum(supportPriorities).optional(),
});

const publicCreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  email:     z.string().email(),
  subject:   z.string().min(1).max(255),
  category:  z.enum(supportCategories),
  message:   z.string().min(10).max(5000),
  priority:  z.enum(supportPriorities).optional(),
});

const updateSchema = z.object({
  description: z.string().min(10).optional(),
  priority:    z.enum(supportPriorities).optional(),
});

function ticketRefFromId(id: string): string {
  return `TKT-${id.slice(0, 8).toUpperCase()}`;
}

async function notifySupportInbox(data: {
  ticketRef: string;
  requester: { firstName: string; lastName: string; email: string; userId?: string };
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  message: string;
}) {
  await sendSupportTicketSubmissionEmail({
    ticketRef: data.ticketRef,
    firstName: data.requester.firstName,
    lastName: data.requester.lastName,
    email: data.requester.email,
    subject: data.subject,
    ticketAbout: supportCategoryLabels[data.category],
    priority: data.priority,
    message: data.message,
    userId: data.requester.userId,
  });
}

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
        const ticketRef = ticketRefFromId(id);
        const priority  = (req.body.priority as SupportPriority | undefined) ?? 'medium';
        await db.insert(schema.supportTickets).values({
          id,
          user_id:     req.user!.userId,
          subject:     req.body.subject as string,
          category:    req.body.category as SupportCategory,
          description: req.body.description as string,
          priority,
          status:      'open',
        });

        const userRow = await db.select({
          email: schema.users.email,
          first_name: schema.users.first_name,
          last_name: schema.users.last_name,
        })
          .from(schema.users).where(eq(schema.users.id, req.user!.userId)).limit(1);
        if (userRow.length) {
          await notifySupportInbox({
            ticketRef,
            requester: {
              firstName: userRow[0].first_name,
              lastName: userRow[0].last_name,
              email: userRow[0].email,
              userId: req.user!.userId,
            },
            subject: req.body.subject as string,
            category: req.body.category as SupportCategory,
            priority,
            message: req.body.description as string,
          });
          await sendSupportTicketReceivedEmail(userRow[0].email, ticketRef, req.body.subject as string);
        }

        res.status(201).json({ success: true, data: { id, ticketRef } });
      } catch (e) { next(e); }
    },
  ],

  createPublic: [
    validate(publicCreateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = uuidv4();
        const ticketRef = ticketRefFromId(id);
        const priority = (req.body.priority as SupportPriority | undefined) ?? 'medium';

        await notifySupportInbox({
          ticketRef,
          requester: {
            firstName: req.body.firstName as string,
            lastName: req.body.lastName as string,
            email: req.body.email as string,
          },
          subject: req.body.subject as string,
          category: req.body.category as SupportCategory,
          priority,
          message: req.body.message as string,
        });
        await sendSupportTicketReceivedEmail(req.body.email as string, ticketRef, req.body.subject as string);

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
