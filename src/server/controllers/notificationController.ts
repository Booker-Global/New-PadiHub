import type { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { notificationService } from '../services/notificationService.js';
import { qs, pp } from '../lib/reqHelpers.js';

export const notificationController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const unreadOnly = qs(req.query.unread_only) === 'true';
      const page  = Math.max(1, parseInt(qs(req.query.page) || '1', 10));
      const limit = Math.min(100, parseInt(qs(req.query.limit) || '20', 10));
      const offset = (page - 1) * limit;

      const data = await notificationService.getForUser(req.user!.userId, unreadOnly, limit, offset);
      res.json({ success: true, data, meta: { page, limit } });
    } catch (e) { next(e); }
  },

  count: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await notificationService.getUnreadCount(req.user!.userId);
      res.json({ success: true, data: { unread_count: count } });
    } catch (e) { next(e); }
  },

  markRead: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await notificationService.markRead(pp(req.params.id), req.user!.userId);
      res.json({ success: true, message: 'Notification marked as read.' });
    } catch (e) { next(e); }
  },

  markAllRead: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await notificationService.markAllRead(req.user!.userId);
      res.json({ success: true, message: 'All notifications marked as read.' });
    } catch (e) { next(e); }
  },

  delete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db.delete(schema.notifications)
        .where(and(
          eq(schema.notifications.id, pp(req.params.id)),
          eq(schema.notifications.user_id, req.user!.userId),
        ));
      res.json({ success: true, message: 'Notification deleted.' });
    } catch (e) { next(e); }
  },
};
