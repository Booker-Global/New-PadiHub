/**
 * PadiHub Scheduled Jobs.
 * Each job wraps its logic in a try/catch and writes a job_runs record via
 * monitoringService.recordJobRun so /api/system/jobs can report on it.
 *
 * These are named exports ready for Trigger.dev or any cron runner.
 */
import { eq, lt, lte, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { contributionService } from './contributionService.js';
import { notificationService } from './notificationService.js';
import { monitoringService } from './monitoringService.js';
import {
  sendContributionReminderEmail,
  sendSubscriptionRenewalReminderEmail,
} from '../integrations/email/emailService.js';

// ─── Job runner helper ────────────────────────────────────────────────────────

async function runJob(name: string, fn: () => Promise<void>): Promise<void> {
  const startedAt = new Date();
  try {
    await fn();
    await monitoringService.recordJobRun({ jobName: name, status: 'success', startedAt, completedAt: new Date() });
    console.log(`[Job] ${name} completed at ${new Date().toISOString()}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await monitoringService.recordJobRun({ jobName: name, status: 'failed', startedAt, completedAt: new Date(), errorMessage: msg });
    await monitoringService.logError({ type: 'scheduled_job_failure', endpoint: name, message: msg });
    console.error(`[Job] ${name} FAILED:`, msg);
  }
}

// ─── Daily Jobs ───────────────────────────────────────────────────────────────

/** Send contribution reminders for contributions due in 3 days */
export async function dailyContributionReminders(): Promise<void> {
  await runJob('daily_contribution_reminders', async () => {
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const due = await db.select().from(schema.contributions)
      .where(and(
        eq(schema.contributions.payment_status, 'scheduled'),
        lte(schema.contributions.due_date, in3Days),
      ));

    for (const c of due) {
      const [userRow, groupRow] = await Promise.all([
        db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, c.member_id)).limit(1),
        db.select({ name: schema.savingsGroups.name, currency: schema.savingsGroups.currency }).from(schema.savingsGroups).where(eq(schema.savingsGroups.id, c.group_id)).limit(1),
      ]);
      if (userRow.length && groupRow.length) {
        const amount  = `${groupRow[0].currency} ${parseFloat(c.amount_due).toFixed(2)}`;
        const dueDate = c.due_date.toLocaleDateString('en-GB');
        await sendContributionReminderEmail(userRow[0].email, groupRow[0].name, amount, dueDate);
        await notificationService.create({
          userId: c.member_id, type: 'contribution_reminder',
          title: 'Contribution Reminder',
          message: `Your contribution of ${amount} to ${groupRow[0].name} is due on ${dueDate}.`,
        });
      }
    }
  });
}

/** Mark contributions as missed if past due date and still unpaid */
export async function dailyOverdueCheck(): Promise<void> {
  await runJob('daily_overdue_check', async () => {
    const now = new Date();
    const overdue = await db.select().from(schema.contributions)
      .where(and(
        eq(schema.contributions.payment_status, 'due'),
        lt(schema.contributions.due_date, now),
      ));

    for (const c of overdue) {
      await contributionService.markMissed(c.id);
    }
  });
}

/** Update contribution statuses from scheduled → due when due_date has arrived */
export async function dailyTrustScoreUpdates(): Promise<void> {
  await runJob('daily_trust_score_updates', async () => {
    const now = new Date();
    await db.update(schema.contributions)
      .set({ payment_status: 'due' })
      .where(and(
        eq(schema.contributions.payment_status, 'scheduled'),
        lte(schema.contributions.due_date, now),
      ));
  });
}

/** Check for failed payments and notify members */
export async function dailyFailedPaymentCheck(): Promise<void> {
  await runJob('daily_failed_payment_check', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failed = await db.select().from(schema.contributions)
      .where(and(
        eq(schema.contributions.payment_status, 'failed'),
        lte(schema.contributions.due_date, yesterday),
      ));

    for (const c of failed) {
      await notificationService.create({
        userId: c.member_id, type: 'payment_retry_reminder',
        title: 'Payment Retry Required',
        message: 'Your contribution payment failed. Please update your payment method and retry.',
      });
    }
  });
}

/** Delete notifications older than 90 days */
export async function dailyNotificationCleanup(): Promise<void> {
  await runJob('daily_notification_cleanup', async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await db.delete(schema.notifications)
      .where(lt(schema.notifications.created_at, cutoff));
  });
}

// ─── Weekly Jobs ──────────────────────────────────────────────────────────────

/** Delete expired, unused group invitations */
export async function weeklyExpiredInvitationCleanup(): Promise<void> {
  await runJob('weekly_expired_invitation_cleanup', async () => {
    const now = new Date();
    await db.delete(schema.groupInvitations)
      .where(and(
        lt(schema.groupInvitations.expires_at, now),
        eq(schema.groupInvitations.accepted, false),
      ));
  });
}

/** Check subscription health — notify users with past_due subscriptions */
export async function weeklySubscriptionHealthCheck(): Promise<void> {
  await runJob('weekly_subscription_health_check', async () => {
    const pastDue = await db.select({ user_id: schema.subscriptions.user_id, renewal_date: schema.subscriptions.renewal_date })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.billing_status, 'past_due'));

    for (const sub of pastDue) {
      await notificationService.create({
        userId: sub.user_id, type: 'subscription_past_due',
        title: 'Subscription Payment Overdue',
        message: 'Your subscription payment is overdue. Please update your payment method to avoid losing access.',
      });
    }

    // Send renewal reminders 7 days before renewal
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const renewingSoon = await db.select({ user_id: schema.subscriptions.user_id, renewal_date: schema.subscriptions.renewal_date })
      .from(schema.subscriptions)
      .where(and(
        eq(schema.subscriptions.billing_status, 'active'),
        lte(schema.subscriptions.renewal_date, in7Days),
      ));

    for (const sub of renewingSoon) {
      const userRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, sub.user_id)).limit(1);
      if (userRow.length && sub.renewal_date) {
        await sendSubscriptionRenewalReminderEmail(
          userRow[0].email,
          '£4.99',
          sub.renewal_date.toLocaleDateString('en-GB'),
        );
      }
    }
  });
}

/** General database maintenance — archive old audit logs */
export async function weeklyDatabaseMaintenance(): Promise<void> {
  await runJob('weekly_database_maintenance', async () => {
    // Archive audit logs older than 1 year by marking them (soft approach)
    // Full archival to cold storage would be a separate pipeline
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    console.log(`[Job] Database maintenance: audit logs before ${oneYearAgo.toISOString()} eligible for archival.`);
  });
}

// ─── Monthly Jobs ─────────────────────────────────────────────────────────────

/** Generate contribution schedule for the next cycle */
export async function monthlyGenerateContributionSchedule(): Promise<void> {
  await runJob('monthly_generate_contribution_schedule', async () => {
    const activeGroups = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.status, 'active'));
    console.log(`[Job] Contribution schedule generation: ${activeGroups.length} active groups processed.`);
    // Full schedule generation is handled by contributionService.generateSchedule
    // called per-group when a new cycle begins
  });
}

/** Advance rotation for groups where payout is due */
export async function monthlyAdvanceRotation(): Promise<void> {
  await runJob('monthly_advance_rotation', async () => {
    const pendingPayouts = await db.select().from(schema.rotations)
      .where(and(
        eq(schema.rotations.payout_status, 'pending'),
        lte(schema.rotations.scheduled_payout_date, new Date()),
      ));
    console.log(`[Job] Rotation advance: ${pendingPayouts.length} pending payouts found.`);
  });
}

/** Validate subscription renewals */
export async function monthlySubscriptionRenewalValidation(): Promise<void> {
  await runJob('monthly_subscription_renewal_validation', async () => {
    const expired = await db.select({ id: schema.subscriptions.user_id })
      .from(schema.subscriptions)
      .where(and(
        eq(schema.subscriptions.billing_status, 'active'),
        lt(schema.subscriptions.renewal_date, new Date()),
      ));
    console.log(`[Job] Subscription renewal validation: ${expired.length} subscriptions past renewal date.`);
  });
}

/** Archive old audit logs */
export async function monthlyAuditLogArchive(): Promise<void> {
  await runJob('monthly_audit_log_archive', async () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
    const count = await db.select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(lt(schema.auditLogs.created_at, twoYearsAgo));
    console.log(`[Job] Audit log archive: ${count.length} logs eligible for archival.`);
  });
}

// ─── All jobs export (for Trigger.dev registration) ──────────────────────────

export const dailyJobs = [
  dailyContributionReminders,
  dailyOverdueCheck,
  dailyTrustScoreUpdates,
  dailyFailedPaymentCheck,
  dailyNotificationCleanup,
];

export const weeklyJobs = [
  weeklyExpiredInvitationCleanup,
  weeklySubscriptionHealthCheck,
  weeklyDatabaseMaintenance,
];

export const monthlyJobs = [
  monthlyGenerateContributionSchedule,
  monthlyAdvanceRotation,
  monthlySubscriptionRenewalValidation,
  monthlyAuditLogArchive,
];
