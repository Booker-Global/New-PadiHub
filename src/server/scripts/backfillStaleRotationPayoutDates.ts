/**
 * ONE-OFF DATA CORRECTION — NOT a feature, NOT a general fix.
 *
 * Before "Implement payout schedule amendment with effective dates - Fix 2"
 * (commit 1265d6b) landed, groupService.update's "reschedule the current
 * cycle when an active group's payout_day changes" block only updated
 * `contributions.due_date` for that cycle's still-'scheduled' rows — it
 * never touched `rotations.scheduled_payout_date`. That column is the ONLY
 * source for the "Next payout date" shown on the Group Details page (see
 * groupNextPayoutDate in src/pages/savings-groups/[id].tsx), so any leader
 * who amended their group's payout day/date on an ACTIVE group before that
 * fix shipped is left with a `rotations` row whose `scheduled_payout_date`
 * silently disagrees with the (correctly updated) `contributions.due_date`
 * for the same cycle. Because this is a genuinely stored, incorrect value —
 * not a client-side caching issue — reloading the Group Details page does
 * NOT fix it; the rotation itself must be corrected.
 *
 * This script reconciles that mismatch. For every active group's CURRENT
 * cycle:
 *   - Finds the still-'pending' rotation (a payout already 'processing'/
 *     'completed' is in flight and must never be touched).
 *   - Finds this cycle's still-'scheduled' contributions (contributions
 *     that have already flipped to 'due'/'paid'/etc. are also in flight and
 *     were never touched by the original reschedule code either — nothing
 *     to reconcile there, since no due_date update happened for them).
 *   - Only when every 'scheduled' contribution for that cycle agrees on a
 *     SINGLE due_date that differs from the rotation's scheduled_payout_date
 *     does it correct the rotation to match — this is exactly the ground-
 *     truth value groupService.update already (correctly) wrote to
 *     contributions at the time of the edit, so copying it across never
 *     fabricates a date.
 *   - Any group whose 'scheduled' contributions disagree with each other
 *     (inconsistent data), or where there are no 'scheduled' contributions
 *     left to compare against, is skipped and logged for manual review
 *     rather than guessed at.
 *
 * Idempotent: once a rotation's scheduled_payout_date matches its cycle's
 * contributions due_date, re-running this script is a no-op for that group.
 *
 * Usage (run once, then discard):
 *   DATABASE_URL=... npx tsx src/server/scripts/backfillStaleRotationPayoutDates.ts
 */
import { and, eq } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';
import { createAuditLog } from '../middleware/auditLogger.js';

async function reconcileGroup(group: typeof schema.savingsGroups.$inferSelect): Promise<void> {
  const rotationRows = await db.select()
    .from(schema.rotations)
    .where(and(
      eq(schema.rotations.group_id, group.id),
      eq(schema.rotations.cycle_number, group.current_cycle),
      eq(schema.rotations.payout_status, 'pending'),
    ))
    .limit(1);

  if (!rotationRows.length) {
    console.log(`[SKIP] ${group.name} (${group.id}): no still-pending rotation for cycle ${group.current_cycle} — nothing to reconcile.`);
    return;
  }
  const rotation = rotationRows[0];

  const scheduledContributions = await db.select({ due_date: schema.contributions.due_date })
    .from(schema.contributions)
    .where(and(
      eq(schema.contributions.group_id, group.id),
      eq(schema.contributions.cycle_number, group.current_cycle),
      eq(schema.contributions.payment_status, 'scheduled'),
    ));

  if (!scheduledContributions.length) {
    console.log(`[SKIP] ${group.name} (${group.id}): no still-'scheduled' contributions for cycle ${group.current_cycle} to compare against — nothing to reconcile from.`);
    return;
  }

  const distinctDueDates = new Set(scheduledContributions.map(row => row.due_date.getTime()));
  if (distinctDueDates.size > 1) {
    console.warn(`[SKIP] ${group.name} (${group.id}): cycle ${group.current_cycle} has ${distinctDueDates.size} disagreeing contribution due_dates — needs manual review, not touched.`);
    return;
  }

  const [correctDueDate] = scheduledContributions;
  if (correctDueDate.due_date.getTime() === rotation.scheduled_payout_date.getTime()) {
    console.log(`[OK] ${group.name} (${group.id}): rotation.scheduled_payout_date already matches contributions.due_date — nothing to do.`);
    return;
  }

  console.log(
    `[FIXING] ${group.name} (${group.id}): rotation.scheduled_payout_date `
    + `${rotation.scheduled_payout_date.toISOString()} -> ${correctDueDate.due_date.toISOString()} `
    + `(cycle ${group.current_cycle}).`,
  );

  await db.update(schema.rotations)
    .set({ scheduled_payout_date: correctDueDate.due_date })
    .where(eq(schema.rotations.id, rotation.id));

  await createAuditLog({
    action: 'ROTATION_PAYOUT_DATE_BACKFILLED',
    entity: 'rotations',
    entityId: rotation.id,
    metadata: {
      groupId: group.id,
      cycleNumber: group.current_cycle,
      oldScheduledPayoutDate: rotation.scheduled_payout_date.toISOString(),
      newScheduledPayoutDate: correctDueDate.due_date.toISOString(),
    },
  });
}

async function main(): Promise<void> {
  const activeGroups = await db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.status, 'active'));
  console.log(`[INFO] Checking ${activeGroups.length} active group(s) for stale rotation payout dates...`);

  for (const group of activeGroups) {
    try {
      await reconcileGroup(group);
    } catch (err) {
      console.error(`[ERROR] ${group.name} (${group.id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await closeConnection();
}

main().catch((err) => {
  console.error('[backfillStaleRotationPayoutDates] Unhandled error:', err);
  process.exitCode = 1;
});
