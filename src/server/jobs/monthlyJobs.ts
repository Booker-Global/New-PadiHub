/**
 * Monthly scheduled jobs — triggered by Trigger.dev
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { contributionService } from '../services/contributionService.js';
import { rotationService } from '../services/rotationService.js';

/**
 * Generate next cycle contribution schedules for all active groups.
 */
export async function generateContributionSchedules() {
  
  const activeGroups = await db.select().from(schema.savingsGroups)
    .where(eq(schema.savingsGroups.status, 'active'));

  for (const group of activeGroups) {
    const members = await db.select().from(schema.memberships)
      .where(and(
        eq(schema.memberships.group_id, group.id),
        eq(schema.memberships.status, 'active'),
      ));

    const nextCycle = group.current_cycle + 1;
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 1);

    await contributionService.generateCycleSchedule(
      group.id,
      nextCycle,
      dueDate,
      members.map(m => ({ user_id: m.user_id, amount_due: String(group.contribution_amount) })),
    );
  }
  console.log(`[MonthlyJobs] Generated contribution schedules for ${activeGroups.length} groups.`);
}

/**
 * Advance completed rotations for groups where all contributions are paid.
 */
export async function advanceCompletedRotations() {
  
  const activeGroups = await db.select().from(schema.savingsGroups)
    .where(eq(schema.savingsGroups.status, 'active'));

  for (const group of activeGroups) {
    const cycleContributions = await db.select().from(schema.contributions)
      .where(and(
        eq(schema.contributions.group_id, group.id),
        eq(schema.contributions.cycle_number, group.current_cycle),
      ));

    const allPaid = cycleContributions.length > 0 &&
      cycleContributions.every(c => c.payment_status === 'paid');

    if (allPaid) {
      await rotationService.advance(group.id, 'system');
    }
  }
  console.log('[MonthlyJobs] Rotation advancement check complete.');
}
