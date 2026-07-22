/**
 * Weekly scheduled jobs — triggered by Trigger.dev
 */
import { eq, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';

/**
 * Remove expired, unused group invitations.
 */
export async function removeExpiredInvitations() {
  
  const now = new Date();
  await db.delete(schema.groupInvitations)
    .where(lte(schema.groupInvitations.expires_at, now));
  console.log('[WeeklyJobs] Expired invitations removed.');
}

/**
 * Close expired votes.
 */
export async function closeExpiredVotes() {
  
  const now = new Date();
  const openVotes = await db.select().from(schema.votes)
    .where(eq(schema.votes.status, 'open'));

  for (const v of openVotes) {
    if (new Date(v.voting_deadline) <= now) {
      await db.update(schema.votes)
        .set({ status: 'expired' })
        .where(eq(schema.votes.id, v.id));
    }
  }
  console.log('[WeeklyJobs] Expired votes closed.');
}
