import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { TRUST_SCORE_MAX, TRUST_SCORE_MIN } from '../lib/constants.js';
import { createAuditLog } from '../middleware/auditLogger.js';

export const trustScoreService = {
  async increase(userId: string, points: number, reason: string) {
    
    const rows = await db.select({ trust_score: schema.users.trust_score })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length) return;
    const newScore = Math.min(rows[0].trust_score + points, TRUST_SCORE_MAX);
    await db.update(schema.users).set({ trust_score: newScore }).where(eq(schema.users.id, userId));
    await createAuditLog({ userId, action: 'TRUST_SCORE_UPDATED', entity: 'users', entityId: userId, metadata: { reason, delta: +points, newScore } });
  },

  async decrease(userId: string, points: number, reason: string) {
    
    const rows = await db.select({ trust_score: schema.users.trust_score })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length) return;
    const newScore = Math.max(rows[0].trust_score - points, TRUST_SCORE_MIN);
    await db.update(schema.users).set({ trust_score: newScore }).where(eq(schema.users.id, userId));
    await createAuditLog({ userId, action: 'TRUST_SCORE_UPDATED', entity: 'users', entityId: userId, metadata: { reason, delta: -points, newScore } });
  },
};
