import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';

export const notificationService = {
  async create(params: {
    userId: string; type: string; title: string; message: string;
  }) {
    const id = uuidv4();
    await db.insert(schema.notifications).values({
      id,
      user_id: params.userId,
      type:    params.type,
      title:   params.title,
      message: params.message,
      is_read: false,
    });
    return id;
  },

  async getForUser(userId: string, unreadOnly = false, limit = 20, offset = 0) {
    const conditions = unreadOnly
      ? and(eq(schema.notifications.user_id, userId), eq(schema.notifications.is_read, false))
      : eq(schema.notifications.user_id, userId);
    return db.select().from(schema.notifications)
      .where(conditions)
      .orderBy(desc(schema.notifications.created_at))
      .limit(limit)
      .offset(offset);
  },

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.user_id, userId),
        eq(schema.notifications.is_read, false),
      ));
    return Number(result[0]?.count ?? 0);
  },

  async markRead(notificationId: string, userId: string) {
    await db.update(schema.notifications)
      .set({ is_read: true })
      .where(and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.user_id, userId),
      ));
  },

  async markAllRead(userId: string) {
    await db.update(schema.notifications)
      .set({ is_read: true })
      .where(eq(schema.notifications.user_id, userId));
  },
};
