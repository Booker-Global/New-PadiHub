import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';

export const userService = {
  async getProfile(userId: string) {
    
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length) throw new AppError('User not found.', 404);
    const { password_hash: _, ...safe } = rows[0];
    return safe;
  },

  async updateProfile(userId: string, data: {
    display_name?: string;
    phone_number?: string;
    notification_preferences?: Record<string, unknown>;
  }, ipAddress?: string) {
    
    const allowed: Record<string, unknown> = {};
    if (data.display_name !== undefined)             allowed.display_name = data.display_name;
    if (data.phone_number !== undefined)             allowed.phone_number = data.phone_number;
    if (data.notification_preferences !== undefined) allowed.notification_preferences = data.notification_preferences;

    await db.update(schema.users).set(allowed).where(eq(schema.users.id, userId));
    await createAuditLog({ userId, action: 'PROFILE_UPDATED', entity: 'users', entityId: userId, ipAddress });
    return this.getProfile(userId);
  },

  async deactivate(userId: string, ipAddress?: string) {
    
    await db.update(schema.users)
      .set({ active: false, account_status: 'deactivated' })
      .where(eq(schema.users.id, userId));
    await createAuditLog({ userId, action: 'ACCOUNT_DEACTIVATED', entity: 'users', entityId: userId, ipAddress });
    return true;
  },

  async updatePreferences(userId: string, preferences: Record<string, unknown>) {
    
    await db.update(schema.users)
      .set({ notification_preferences: preferences })
      .where(eq(schema.users.id, userId));
    return true;
  },
};
