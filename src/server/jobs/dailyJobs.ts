/**
 * Daily scheduled jobs — triggered by Trigger.dev
 */
import { eq, and, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { notificationService } from '../services/notificationService.js';
import { contributionService } from '../services/contributionService.js';

/**
 * Send reminders for contributions due within the next 3 days.
 */
export async function sendContributionReminders() {
  
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const due = await db.select().from(schema.contributions)
    .where(and(
      eq(schema.contributions.payment_status, 'scheduled'),
      lte(schema.contributions.due_date, threeDaysFromNow),
    ));

  for (const c of due) {
    await notificationService.create({
      userId: c.member_id, type: 'contribution_reminder',
      title: 'Contribution Reminder',
      message: `Your contribution for cycle ${c.cycle_number} is due soon.`,
    });
    await db.update(schema.contributions)
      .set({ payment_status: 'due' })
      .where(eq(schema.contributions.id, c.id));
  }
  console.log(`[DailyJobs] Sent ${due.length} contribution reminders.`);
}

/**
 * Flag overdue contributions as missed and update Trust Scores.
 */
export async function checkOverdueContributions() {
  
  const now = new Date();
  const overdue = await db.select().from(schema.contributions)
    .where(and(
      eq(schema.contributions.payment_status, 'due'),
      lte(schema.contributions.due_date, now),
    ));

  for (const c of overdue) {
    await contributionService.markMissed(c.id);
  }
  console.log(`[DailyJobs] Flagged ${overdue.length} overdue contributions as missed.`);
}

/**
 * Recalculate Trust Scores based on recent activity.
 * Placeholder — full logic wired in Prompt 4/5 with payment data.
 */
export async function updateTrustScores() {
  console.log('[DailyJobs] Trust score update job ran (full logic in Prompt 4/5).');
}
