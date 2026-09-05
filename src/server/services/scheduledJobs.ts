/**
 * PadiHub Scheduled Jobs.
 * Each job wraps its logic in a try/catch and writes a job_runs record via
 * monitoringService.recordJobRun so /api/system/jobs can report on it.
 *
 * These are named exports ready for Trigger.dev or any cron runner.
 */
import { eq, lt, lte, and, inArray, isNotNull, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { contributionService } from './contributionService.js';
import { rotationService } from './rotationService.js';
import { notificationService } from './notificationService.js';
import { monitoringService } from './monitoringService.js';
import { groupService } from './groupService.js';
import { chargeContributionForUser } from '../controllers/paymentController.js';
import { getFlutterwaveProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { resolveFirstScheduleDate } from '../lib/payoutSchedule.js';
import {
  SUBSCRIPTION_TIERS, isSubscriptionTierKey, getTierMonthlyPrice, formatTierPrice,
  GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH, GROUP_STUCK_BELOW_MIN_EXPIRY_DAYS, GROUP_STUCK_EXPIRY_REMINDER_DAYS_BEFORE,
  ACCOUNT_LIFECYCLE_REMINDER_INTERVAL_DAYS, PENDING_CHARGE_GROUP_JOIN_EXPIRY_DAYS,
  INCOMPLETE_PROFILE_EXPIRY_DAYS, CANCELLED_SUBSCRIPTION_EXPIRY_DAYS,
} from '../lib/constants.js';
import { planCode, subscriptionService } from './subscriptionService.js';
import { getOnboardingProgress } from './paymentEligibilityService.js';
import {
  sendContributionReminderEmail,
  sendSubscriptionRenewalReminderEmail,
  sendGroupExpiredEmail,
  sendGroupExpiryReminderEmail,
  sendSubscriptionPaymentFailedEmail,
  sendPendingChargeGroupJoinReminderEmail,
  sendPendingChargeExpiredEmail,
  sendIncompleteProfileReminderEmail,
  sendResubscribeReminderEmail,
} from '../integrations/email/emailService.js';

// Nigeria "Basic" tier price is the default fallback if a user somehow has no
// recognised subscription_tier recorded — see SUBSCRIPTION_TIERS in
// ../lib/constants.ts for the authoritative tier pricing/limits.
const DEFAULT_FLUTTERWAVE_SUBSCRIPTION_AMOUNT_NGN = SUBSCRIPTION_TIERS.basic.priceNGN;

function getFlutterwaveSubscriptionAmount(subscriptionTier?: string | null) {
  if (isSubscriptionTierKey(subscriptionTier)) {
    return getTierMonthlyPrice(subscriptionTier, 'NG');
  }
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

/**
 * Idempotent catch-up run for the primary 07:00 UTC charge trigger.
 *
 * Runs a few hours later (18:00 UTC) purely to retry accounts that were not
 * yet successfully charged in the morning — e.g. a transient provider outage,
 * or a contribution that only became "due" mid-morning because its group was
 * activated after the primary run. It simply re-invokes the same
 * scheduled→due flip and charge-due-contributions logic, both of which are
 * naturally idempotent (they only ever act on rows still in 'scheduled'/'due'
 * status — a contribution already charged via markPaid/markFailed is no
 * longer in that state), so re-running this later in the day can never
 * double-charge a member who was already successfully charged this morning.
 */
export async function dailyChargeCatchUp(): Promise<void> {
  await runJob('daily_charge_catch_up', async () => {
    await dailyTrustScoreUpdates();
    await dailyAutoChargeDueContributions();
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

/**
 * Section 6 — the single automatic retry at the end of a contribution's
 * 72-hour grace period. Finds every 'pending_default' contribution whose
 * grace_period_ends_at has passed and hasn't been retried yet, attempts
 * the charge exactly once more, and lets contributionService.markFailed /
 * membershipService.flagDefault decide retain-vs-Compensated-Compression
 * if it fails again. No further retries ever happen after this.
 */
export async function dailyContributionDefaultRetry(): Promise<void> {
  await runJob('daily_contribution_default_retry', async () => {
    const now = new Date();
    const due = await db.select().from(schema.contributions)
      .where(and(
        eq(schema.contributions.payment_status, 'pending_default'),
        eq(schema.contributions.retry_attempted, false),
        lte(schema.contributions.grace_period_ends_at, now),
      ));

    for (const c of due) {
      try {
        await chargeContributionForUser(c.member_id, c.id, true);
      } catch (err) {
        // Whether the provider threw (e.g. a hard card decline) or simply
        // never got the chance to call markFailed, make sure the single
        // retry is always recorded as attempted — this is the one and only
        // retry, so it must not silently repeat on the next run.
        console.warn(
          `[Job] daily_contribution_default_retry: contribution ${c.id} retry failed:`,
          err instanceof Error ? err.message : err,
        );
        await contributionService.markFailed(c.id, undefined, true);
      }
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

/**
 * Section 1 — any group stuck below GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH for
 * GROUP_STUCK_BELOW_MIN_EXPIRY_DAYS (30) auto-expires, whether it's a
 * never-launched Draft (anchored on created_at) or a launched-then-dropped
 * Suspended group (anchored on suspended_at). Sends reminder nudges at
 * 7/3/1 days before the deadline so the leader has a chance to refill it.
 */
export async function dailyGroupLifecycleExpiry(): Promise<void> {
  await runJob('daily_group_lifecycle_expiry', async () => {
    const stuckGroups = await db.select().from(schema.savingsGroups)
      .where(inArray(schema.savingsGroups.status, ['draft', 'suspended']));

    const now = Date.now();
    for (const group of stuckGroups) {
      const activeCount = await groupService.countActiveMembers(group.id);
      if (activeCount >= GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH) continue;

      const anchor = (group.status === 'suspended' ? group.suspended_at : null) ?? group.created_at;
      const daysStuck = (now - new Date(anchor).getTime()) / (24 * 60 * 60 * 1000);
      const daysRemaining = Math.ceil(GROUP_STUCK_BELOW_MIN_EXPIRY_DAYS - daysStuck);

      if (daysStuck >= GROUP_STUCK_BELOW_MIN_EXPIRY_DAYS) {
        await db.update(schema.savingsGroups).set({ status: 'expired' }).where(eq(schema.savingsGroups.id, group.id));
        await createAuditLog({ action: 'GROUP_AUTO_EXPIRED', entity: 'savings_groups', entityId: group.id, metadata: { activeCount, daysStuck } });
        await notificationService.create({
          userId: group.leader_id, type: 'group_expired',
          title: 'Group Expired',
          message: `"${group.name}" remained below ${GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH} members for 30 days and has expired.`,
        });
        const leaderRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, group.leader_id)).limit(1);
        if (leaderRow.length) await sendGroupExpiredEmail(leaderRow[0].email, group.name);
        continue;
      }

      if (GROUP_STUCK_EXPIRY_REMINDER_DAYS_BEFORE.includes(daysRemaining)) {
        await notificationService.create({
          userId: group.leader_id, type: 'group_expiry_reminder',
          title: 'Group Expiring Soon',
          message: `"${group.name}" will expire in ${daysRemaining} day(s) unless it reaches ${GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH} active members.`,
        });
        const leaderRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, group.leader_id)).limit(1);
        if (leaderRow.length) await sendGroupExpiryReminderEmail(leaderRow[0].email, group.name, daysRemaining);
      }
    }
  });
}

/**
 * Section D.2 — subscription billing only stays "live" while a user's
 * active-group-membership count is above zero; pause it the moment that
 * count hits exactly zero, and resume it automatically once they're a
 * verified member of an active group again. Every membership/group-status
 * change that could affect this now reconciles billing immediately at the
 * call site (groupService.activateGroup/reevaluateAfterMembershipChange,
 * membershipService.join/_activatePendingMembership/departMember) — this
 * daily sweep is just the safety net in case any of those individual call
 * sites is ever missed. See subscriptionService.reconcileBillingForActiveGroupMembership
 * for the real provider-level pause_collection/resume mechanics.
 */
export async function dailyBillingActiveGroupReconciliation(): Promise<void> {
  await runJob('daily_billing_active_group_reconciliation', async () => {
    const subs = await db.select({ user_id: schema.subscriptions.user_id })
      .from(schema.subscriptions)
      .where(inArray(schema.subscriptions.billing_status, ['active', 'paused']));

    for (const sub of subs) {
      await subscriptionService.reconcileBillingForActiveGroupMembership(sub.user_id);
    }
  });
}

/**
 * Section 7 — the one-and-only 72-hour retry for a Flutterwave "first
 * charge on joining an active group" that failed synchronously (see
 * subscriptionService.reconcileBillingForActiveGroupMembership). Finds
 * every subscription whose first_charge_failed_at is 72+ hours old and
 * hands it to subscriptionService.retryFirstChargeOrRemoveOnFailure, which
 * either resumes billing (retry succeeded) or removes the member from
 * every active group they're in and notifies them (retry failed again).
 */
export async function dailySubscriptionFirstChargeRetry(): Promise<void> {
  await runJob('daily_subscription_first_charge_retry', async () => {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const due = await db.select({ user_id: schema.subscriptions.user_id })
      .from(schema.subscriptions)
      .where(and(
        eq(schema.subscriptions.billing_status, 'past_due'),
        isNotNull(schema.subscriptions.first_charge_failed_at),
        lte(schema.subscriptions.first_charge_failed_at, cutoff),
      ));

    for (const sub of due) {
      try {
        await subscriptionService.retryFirstChargeOrRemoveOnFailure(sub.user_id);
      } catch (err) {
        console.error(`[Job] daily_subscription_first_charge_retry: failed for user ${sub.user_id}:`, err instanceof Error ? err.message : err);
      }
    }
  });
}

/**
 * Section 4 — governance votes (member_admission, contribution_claim,
 * payout_swap) must auto-resolve once their 48h voting_deadline passes,
 * since checkAndClose is otherwise only invoked reactively when a member
 * casts a response. Without this sweep, a vote nobody responds to would
 * stay 'open' forever instead of invalidating per the "timeout invalidates"
 * rule.
 */
export async function dailyGovernanceVoteExpiry(): Promise<void> {
  await runJob('daily_governance_vote_expiry', async () => {
    const { voteService } = await import('./voteService.js');
    await voteService.expireOverdueVotes();
  });
}

/**
 * Section 1 — a member whose profile is 100% complete (steps a-e) but who
 * hasn't yet joined/launched an active (3+ member) group sits in
 * "Pending Charge" (billing_status 'paused', activeGroupCount 0) — their
 * card is validated but never charged while in this state. Nudges them
 * every ACCOUNT_LIFECYCLE_REMINDER_INTERVAL_DAYS (7) to go join a group,
 * anchored on users.onboarding_completed_email_sent_at (the moment steps
 * a-e finished). After PENDING_CHARGE_GROUP_JOIN_EXPIRY_DAYS (30) with no
 * active group joined, the subscription is cancelled and the plan
 * selection cleared — the profile becomes incomplete again ("subscription
 * plan pending") and the member must re-select a plan and join a group
 * from scratch. They are never charged in this entire flow.
 */
export async function dailyPendingChargeGroupJoinFollowUp(): Promise<void> {
  await runJob('daily_pending_charge_group_join_follow_up', async () => {
    const candidates = await db.select({
      id:                                schema.users.id,
      email:                             schema.users.email,
      first_name:                        schema.users.first_name,
      onboarding_completed_email_sent_at: schema.users.onboarding_completed_email_sent_at,
      group_join_reminder_last_sent_at:  schema.users.group_join_reminder_last_sent_at,
    })
      .from(schema.users)
      .innerJoin(schema.subscriptions, eq(schema.subscriptions.user_id, schema.users.id))
      .where(and(
        eq(schema.subscriptions.billing_status, 'paused'),
        isNotNull(schema.users.onboarding_completed_email_sent_at),
        eq(schema.users.active, true),
      ));

    const now = Date.now();
    const expiryMs = PENDING_CHARGE_GROUP_JOIN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const reminderMs = ACCOUNT_LIFECYCLE_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

    for (const user of candidates) {
      if (!user.onboarding_completed_email_sent_at) continue;
      // Only genuinely "no active group" members qualify — a member who has
      // since joined one is no longer in this cohort even if the nightly
      // billing-reconciliation sweep hasn't flipped billing_status yet.
      const activeGroupCount = await groupService.countActiveGroupMembershipsForUser(user.id);
      if (activeGroupCount > 0) continue;

      const anchorMs = new Date(user.onboarding_completed_email_sent_at).getTime();
      const elapsedMs = now - anchorMs;

      if (elapsedMs >= expiryMs) {
        await subscriptionService.expirePendingChargeWithoutGroup(user.id);
        await sendPendingChargeExpiredEmail(user.email, user.first_name);
        continue;
      }

      const lastSentMs = user.group_join_reminder_last_sent_at ? new Date(user.group_join_reminder_last_sent_at).getTime() : null;
      const dueForReminder = elapsedMs >= reminderMs && (lastSentMs === null || (now - lastSentMs) >= reminderMs);
      if (!dueForReminder) continue;

      const daysRemaining = Math.max(1, Math.ceil((expiryMs - elapsedMs) / (24 * 60 * 60 * 1000)));
      await sendPendingChargeGroupJoinReminderEmail(user.email, user.first_name, daysRemaining);
      await db.update(schema.users).set({ group_join_reminder_last_sent_at: new Date() }).where(eq(schema.users.id, user.id));
    }
  });
}

/**
 * Section 2 — a member who hasn't finished every onboarding step (email,
 * plan, verified card, verified payout, identity) yet. Subscription stays
 * inactive and they cannot join a group at all while incomplete — no
 * payment has ever been attempted, so this NEVER sends a payment-failure
 * email, only a friendly reminder of what's outstanding, anchored on
 * users.created_at (account age). Account is deleted after
 * INCOMPLETE_PROFILE_EXPIRY_DAYS (60) — see userService.systemDeleteAccount,
 * which (unlike self-service deletion) leaves the email free for a fresh
 * sign-up.
 */
export async function dailyIncompleteProfileFollowUp(): Promise<void> {
  await runJob('daily_incomplete_profile_follow_up', async () => {
    const candidates = await db.select({
      id:                                             schema.users.id,
      email:                                          schema.users.email,
      first_name:                                     schema.users.first_name,
      created_at:                                      schema.users.created_at,
      onboarding_incomplete_reminder_last_sent_at:      schema.users.onboarding_incomplete_reminder_last_sent_at,
    })
      .from(schema.users)
      // subscription_status only ever becomes 'active' once every onboarding
      // step (including plan selection) succeeds — see subscriptionService
      // .createSubscription — so excluding it here cheaply narrows to
      // exactly this cohort (steps a-e not yet finished) without needing to
      // run the full eligibility check against every single user.
      .where(and(eq(schema.users.active, true), ne(schema.users.subscription_status, 'active')));

    const now = Date.now();
    const expiryMs = INCOMPLETE_PROFILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const reminderMs = ACCOUNT_LIFECYCLE_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

    for (const user of candidates) {
      const progress = await getOnboardingProgress(user.id);
      if (progress.complete) continue; // steps a-e already done — not this cohort

      const anchorMs = new Date(user.created_at).getTime();
      const elapsedMs = now - anchorMs;

      if (elapsedMs >= expiryMs) {
        const { userService } = await import('./userService.js');
        try {
          await userService.systemDeleteAccount(user.id, 'incomplete_profile_60_days');
        } catch (err) {
          console.error(`[Job] daily_incomplete_profile_follow_up: failed to delete account ${user.id}:`, err instanceof Error ? err.message : err);
        }
        continue;
      }

      const lastSentMs = user.onboarding_incomplete_reminder_last_sent_at ? new Date(user.onboarding_incomplete_reminder_last_sent_at).getTime() : null;
      const dueForReminder = elapsedMs >= reminderMs && (lastSentMs === null || (now - lastSentMs) >= reminderMs);
      if (!dueForReminder) continue;

      const missingSteps = progress.steps.filter(step => !step.complete).map(step => step.label);
      const daysRemaining = Math.max(1, Math.ceil((expiryMs - elapsedMs) / (24 * 60 * 60 * 1000)));
      await sendIncompleteProfileReminderEmail(user.email, user.first_name, missingSteps, daysRemaining);
      await db.update(schema.users).set({ onboarding_incomplete_reminder_last_sent_at: new Date() }).where(eq(schema.users.id, user.id));
    }
  });
}

/**
 * Section 3 — a member who was previously subscribed and cancelled (their
 * subscription_status/billing_status both went to 'cancelled' via
 * subscriptionService.cancelSubscription, which also already departs them
 * from every group they were in). Nudged every 7 days to re-subscribe,
 * anchored on subscriptions.cancelled_at; deleted after
 * CANCELLED_SUBSCRIPTION_EXPIRY_DAYS (60) if they never do.
 */
export async function dailyResubscribeFollowUp(): Promise<void> {
  await runJob('daily_resubscribe_follow_up', async () => {
    const candidates = await db.select({
      id:                                schema.users.id,
      email:                             schema.users.email,
      first_name:                        schema.users.first_name,
      resubscribe_reminder_last_sent_at: schema.users.resubscribe_reminder_last_sent_at,
      cancelled_at:                      schema.subscriptions.cancelled_at,
    })
      .from(schema.users)
      .innerJoin(schema.subscriptions, eq(schema.subscriptions.user_id, schema.users.id))
      .where(and(
        eq(schema.subscriptions.billing_status, 'cancelled'),
        eq(schema.users.subscription_status, 'cancelled'),
        isNotNull(schema.subscriptions.cancelled_at),
        eq(schema.users.active, true),
      ));

    const now = Date.now();
    const expiryMs = CANCELLED_SUBSCRIPTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const reminderMs = ACCOUNT_LIFECYCLE_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

    for (const user of candidates) {
      if (!user.cancelled_at) continue;
      const anchorMs = new Date(user.cancelled_at).getTime();
      const elapsedMs = now - anchorMs;

      if (elapsedMs >= expiryMs) {
        const { userService } = await import('./userService.js');
        try {
          await userService.systemDeleteAccount(user.id, 'inactive_after_cancellation_60_days');
        } catch (err) {
          console.error(`[Job] daily_resubscribe_follow_up: failed to delete account ${user.id}:`, err instanceof Error ? err.message : err);
        }
        continue;
      }

      const lastSentMs = user.resubscribe_reminder_last_sent_at ? new Date(user.resubscribe_reminder_last_sent_at).getTime() : null;
      const dueForReminder = elapsedMs >= reminderMs && (lastSentMs === null || (now - lastSentMs) >= reminderMs);
      if (!dueForReminder) continue;

      const daysRemaining = Math.max(1, Math.ceil((expiryMs - elapsedMs) / (24 * 60 * 60 * 1000)));
      await sendResubscribeReminderEmail(user.email, user.first_name, daysRemaining);
      await db.update(schema.users).set({ resubscribe_reminder_last_sent_at: new Date() }).where(eq(schema.users.id, user.id));
    }
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

      const { dueDate } = resolveFirstScheduleDate(group.contribution_frequency, group.payout_day, new Date());
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
      let user = userRows[0];

      // A mid-cycle downgrade request keeps the member on their current
      // tier's limits/price until this renewal — apply it now, before
      // computing the charge amount, so the correct (new, lower) price is
      // what actually gets charged going forward. See subscriptionService's
      // switchPlan for where pending_tier is set.
      if (sub.pending_tier && isSubscriptionTierKey(sub.pending_tier) && sub.pending_tier !== user.subscription_tier) {
        await db.update(schema.users).set({ subscription_tier: sub.pending_tier }).where(eq(schema.users.id, user.id));
        await db.update(schema.subscriptions).set({ plan: planCode(user.country, sub.pending_tier), pending_tier: null }).where(eq(schema.subscriptions.id, sub.id));
        await createAuditLog({ userId: user.id, action: 'SUBSCRIPTION_TIER_SWITCHED', entity: 'subscriptions', entityId: sub.id, metadata: { from: user.subscription_tier, to: sub.pending_tier, appliedAtRenewal: true } });
        user = { ...user, subscription_tier: sub.pending_tier };
      }

      if (!user.flutterwave_card_token) {
        await notificationService.create({
          userId: user.id, type: 'subscription_payment_failed',
          title: 'Subscription Renewal Failed',
          message: 'We could not renew your PadiHub subscription — no saved card on file. Please add a payment method.',
        });
        await db.update(schema.subscriptions).set({ billing_status: 'past_due' }).where(eq(schema.subscriptions.id, sub.id));
        await db.update(schema.users).set({ subscription_status: 'expired' }).where(eq(schema.users.id, user.id));
        // Item 7 — payment failure emails are sent for a genuine failed
        // charge attempt against monthly contribution due; a missing card
        // means the charge could never even be attempted, but the member
        // still needs to know their subscription lapsed and why.
        await sendSubscriptionPaymentFailedEmail(
          user.email,
          isSubscriptionTierKey(user.subscription_tier) ? formatTierPrice(user.subscription_tier, user.country) : '',
        );
        continue;
      }

      const amountInSmallestUnit = Math.round(getFlutterwaveSubscriptionAmount(user.subscription_tier) * 100);
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
          // Item 7 — genuine failed charge attempt for the monthly
          // contribution due.
          await sendSubscriptionPaymentFailedEmail(
            user.email,
            isSubscriptionTierKey(user.subscription_tier) ? formatTierPrice(user.subscription_tier, user.country) : '',
          );
        }

        await createAuditLog({
          userId: user.id, action: 'FLW_SUBSCRIPTION_RENEWAL_CHARGED', entity: 'subscriptions',
          entityId: sub.id,
          metadata: {
            ...(result as unknown as Record<string, unknown>),
            tier: isSubscriptionTierKey(user.subscription_tier) ? user.subscription_tier : null,
            amount_display: isSubscriptionTierKey(user.subscription_tier) ? formatTierPrice(user.subscription_tier, user.country) : null,
          },
        });
      } catch (err) {
        await db.update(schema.subscriptions).set({ billing_status: 'past_due' }).where(eq(schema.subscriptions.id, sub.id));
        await db.update(schema.users).set({ subscription_status: 'expired' }).where(eq(schema.users.id, user.id));
        await sendSubscriptionPaymentFailedEmail(
          user.email,
          isSubscriptionTierKey(user.subscription_tier) ? formatTierPrice(user.subscription_tier, user.country) : '',
        );
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
  // Flip scheduled → due *before* auto-charging so a contribution that
  // becomes due today gets charged today, not delayed until tomorrow's run.
  dailyTrustScoreUpdates,
  dailyAutoChargeDueContributions,
  dailyOverdueCheck,
  dailyContributionDefaultRetry,
  dailyFailedPaymentCheck,
  dailyGroupLifecycleExpiry,
  dailyBillingActiveGroupReconciliation,
  dailyGovernanceVoteExpiry,
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
