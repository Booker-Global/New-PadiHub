/**
 * PadiHub Scheduled Jobs.
 * Each job wraps its logic in a try/catch and writes a job_runs record via
 * monitoringService.recordJobRun so /api/system/jobs can report on it.
 *
 * These are named exports ready for Trigger.dev or any cron runner.
 */
import { eq, lt, lte, and, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { contributionService } from './contributionService.js';
import { rotationService } from './rotationService.js';
import { notificationService } from './notificationService.js';
import { monitoringService } from './monitoringService.js';
import { chargeContributionForUser } from '../controllers/paymentController.js';
import { getFlutterwaveProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { computeNextPayoutDate } from '../lib/payoutSchedule.js';
import {
  sendContributionReminderEmail,
  sendSubscriptionRenewalReminderEmail,
} from '../integrations/email/emailService.js';

// ₦3,500/month — matches the published price in legalController.ts and the
// renewal-reminder email copy. Configurable via env for future price changes.
const DEFAULT_FLUTTERWAVE_SUBSCRIPTION_AMOUNT_NGN = 3500;

function getFlutterwaveSubscriptionAmount() {
  const parsed = Number.parseFloat(
    process.env.FLUTTERWAVE_SUBSCRIPTION_AMOUNT_NGN ?? `${DEFAULT_FLUTTERWAVE_SUBSCRIPTION_AMOUNT_NGN}`,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FLUTTERWAVE_SUBSCRIPTION_AMOUNT_NGN;
}

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

/**
 * Automatically charge contributions once they become due, using the
 * member's saved payment method — instead of relying solely on the member
 * manually clicking "Confirm contribution". Runs before dailyOverdueCheck so
 * a due contribution gets a real charge attempt before being marked missed.
 */
export async function dailyAutoChargeDueContributions(): Promise<void> {
  await runJob('daily_auto_charge_due_contributions', async () => {
    const due = await db.select().from(schema.contributions)
      .where(eq(schema.contributions.payment_status, 'due'));

    for (const c of due) {
      try {
        await chargeContributionForUser(c.member_id, c.id);
      } catch (err) {
        // Expected failures (no saved payment method, provider decline, etc.)
        // are left for dailyFailedPaymentCheck / dailyOverdueCheck to handle —
        // just log so a single member's failure doesn't stop the whole batch.
        console.warn(
          `[Job] daily_auto_charge_due_contributions: contribution ${c.id} charge attempt failed:`,
          err instanceof Error ? err.message : err,
        );
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
//
// NOTE: monthlyGenerateContributionSchedule and monthlyAdvanceRotation are
// also invoked from the daily job set below (see dailyJobs), not just
// monthly, because a group's own contribution_frequency (daily/weekly/
// monthly) determines its real cadence — the "monthly" trigger.dev cron is
// only a once-a-month safety net. Both functions are idempotent (they check
// existing state before acting), so running them more often is safe.

/** Generate the next cycle's contribution schedule for active groups that don't have one yet. */
export async function monthlyGenerateContributionSchedule(): Promise<void> {
  await runJob('monthly_generate_contribution_schedule', async () => {
    const activeGroups = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.status, 'active'));

    let generated = 0;
    for (const group of activeGroups) {
      const activeMembers = await db.select().from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, group.id), eq(schema.memberships.status, 'active')));
      if (!activeMembers.length) continue;

      // Skip if this group's current cycle already has a schedule generated.
      const existing = await db.select({ id: schema.contributions.id }).from(schema.contributions)
        .where(and(eq(schema.contributions.group_id, group.id), eq(schema.contributions.cycle_number, group.current_cycle)))
        .limit(1);
      if (existing.length) continue;

      const dueDate = computeNextPayoutDate(group.contribution_frequency, group.payout_day, new Date());
      await contributionService.generateCycleSchedule(
        group.id,
        group.current_cycle,
        dueDate,
        activeMembers.map(m => ({ user_id: m.user_id, amount_due: group.contribution_amount })),
      );

      // Ensure a rotation record (recipient + scheduled payout date) exists
      // for the current cycle so /rotations "who's next" data is available.
      const currentRotation = await rotationService.getCurrent(group.id);
      if (!currentRotation) {
        const sorted = [...activeMembers].sort((a, b) => (a.rotation_order ?? 0) - (b.rotation_order ?? 0));
        const recipient = sorted.find(m => m.rotation_order === group.current_rotation_position) ?? sorted[0];
        if (recipient) {
          await rotationService.createForCycle(group.id, group.current_cycle, recipient.user_id, dueDate);
        }
      }
      generated++;
    }
    console.log(`[Job] Contribution schedule generation: ${generated}/${activeGroups.length} active groups scheduled.`);
  });
}

/** Advance rotation for groups whose current cycle is fully paid. */
export async function monthlyAdvanceRotation(): Promise<void> {
  await runJob('monthly_advance_rotation', async () => {
    const activeGroups = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.status, 'active'));

    let advanced = 0;
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
        advanced++;
      }
    }
    console.log(`[Job] Rotation advance: ${advanced}/${activeGroups.length} active groups advanced.`);
  });
}

/**
 * Charge monthly platform-subscription renewals that have reached their
 * renewal date. Stripe (UK) subscriptions bill themselves automatically via
 * Stripe's native Subscriptions API — Stripe charges the customer's default
 * payment method off-session and our webhookStripeController already
 * reconciles billing_status/subscription_status from the resulting
 * invoice.payment_succeeded/failed events, so nothing to do here for them.
 * Flutterwave has no native recurring-billing engine, so NG renewals are
 * charged explicitly here against the member's saved card token.
 */
export async function monthlySubscriptionRenewalCharge(): Promise<void> {
  await runJob('monthly_subscription_renewal_charge', async () => {
    const due = await db.select().from(schema.subscriptions)
      .where(and(
        inArray(schema.subscriptions.billing_status, ['active', 'trialing']),
        lte(schema.subscriptions.renewal_date, new Date()),
      ));

    for (const sub of due) {
      if (sub.provider !== 'flutterwave') continue;

      const userRows = await db.select().from(schema.users).where(eq(schema.users.id, sub.user_id)).limit(1);
      if (!userRows.length) continue;
      const user = userRows[0];

      if (!user.flutterwave_card_token) {
        await notificationService.create({
          userId: user.id, type: 'subscription_payment_failed',
          title: 'Subscription Renewal Failed',
          message: 'We could not renew your PadiHub subscription — no saved card on file. Please add a payment method.',
        });
        await db.update(schema.subscriptions).set({ billing_status: 'past_due' }).where(eq(schema.subscriptions.id, sub.id));
        await db.update(schema.users).set({ subscription_status: 'expired' }).where(eq(schema.users.id, user.id));
        continue;
      }

      const amountInSmallestUnit = Math.round(getFlutterwaveSubscriptionAmount() * 100);
      const renewalRef = `sub-renewal-${sub.id}-${sub.renewal_date?.getTime() ?? Date.now()}`;

      try {
        const result = await getFlutterwaveProvider().chargeContribution({
          customerId:      user.email,
          paymentMethodId: user.flutterwave_card_token,
          amount:          amountInSmallestUnit,
          currency:        user.currency,
          countryCode:     user.country,
          contributionId:  renewalRef,
          description:     'PadiHub monthly subscription renewal',
        });

        const nextRenewalDate = sub.renewal_date ? new Date(sub.renewal_date) : new Date();
        nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 1);

        if (result.status === 'succeeded') {
          await db.update(schema.subscriptions)
            .set({ billing_status: 'active', renewal_date: nextRenewalDate })
            .where(eq(schema.subscriptions.id, sub.id));
          await db.update(schema.users).set({ subscription_status: 'active' }).where(eq(schema.users.id, user.id));
        } else {
          await db.update(schema.subscriptions).set({ billing_status: 'past_due' }).where(eq(schema.subscriptions.id, sub.id));
          await db.update(schema.users).set({ subscription_status: 'expired' }).where(eq(schema.users.id, user.id));
          await notificationService.create({
            userId: user.id, type: 'subscription_payment_failed',
            title: 'Subscription Renewal Failed',
            message: 'Your subscription payment failed. Please update your payment method to keep access.',
          });
        }

        await createAuditLog({
          userId: user.id, action: 'FLW_SUBSCRIPTION_RENEWAL_CHARGED', entity: 'subscriptions',
          entityId: sub.id, metadata: result as unknown as Record<string, unknown>,
        });
      } catch (err) {
        await db.update(schema.subscriptions).set({ billing_status: 'past_due' }).where(eq(schema.subscriptions.id, sub.id));
        await db.update(schema.users).set({ subscription_status: 'expired' }).where(eq(schema.users.id, user.id));
        console.warn(
          `[Job] monthly_subscription_renewal_charge: renewal charge failed for subscription ${sub.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
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
  // Run schedule-generation/rotation-advance daily (not just once a month)
  // so daily- and weekly-frequency groups aren't stuck waiting for the
  // monthly cron — both functions are idempotent and safe to run often.
  monthlyGenerateContributionSchedule,
  monthlyAdvanceRotation,
  dailyContributionReminders,
  dailyAutoChargeDueContributions,
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
  monthlySubscriptionRenewalCharge,
  monthlyAuditLogArchive,
];
