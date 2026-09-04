/**
 * PadiHub — Daily scheduled tasks (Trigger.dev v3)
 *
 * Schedules (UTC):
 *   05:45  generate contribution schedules (idempotent — also covers daily/weekly groups)
 *   05:50  advance rotations whose current cycle is fully paid
 *   06:00  contribution reminders
 *   06:10  overdue check
 *   06:20  trust-score status flip (scheduled → due)
 *   06:25  auto-charge newly-due contributions
 *   06:30  failed-payment notifications
 *   06:35  72-hour contribution-default retry (Section 6)
 *   06:40  stuck (draft/suspended) group lifecycle expiry (Section 1)
 *   06:45  Section D.2 billing/active-group-membership reconciliation safety net
 *   06:50  governance vote expiry (Section 4)
 *   06:55  72-hour subscription first-charge-on-join retry/removal (Section 7)
 *   07:00  Pending Charge → no active group joined: 7-day reminders / 30-day expiry (Section 1)
 *   07:05  incomplete profile (steps a-e): 7-day reminders / 60-day account deletion (Section 2)
 *   07:10  cancelled subscription: 7-day re-subscribe reminders / 60-day account deletion (Section 3)
 *   03:00  notification cleanup
 */
import { schedules } from '@trigger.dev/sdk/v3';
import {
  monthlyGenerateContributionSchedule,
  monthlyAdvanceRotation,
  dailyContributionReminders,
  dailyOverdueCheck,
  dailyTrustScoreUpdates,
  dailyAutoChargeDueContributions,
  dailyFailedPaymentCheck,
  dailyNotificationCleanup,
  dailyContributionDefaultRetry,
  dailyGroupLifecycleExpiry,
  dailyBillingActiveGroupReconciliation,
  dailyGovernanceVoteExpiry,
  dailySubscriptionFirstChargeRetry,
  dailyPendingChargeGroupJoinFollowUp,
  dailyIncompleteProfileFollowUp,
  dailyResubscribeFollowUp,
} from '../server/services/scheduledJobs.js';

export const dailyGenerateContributionScheduleTask = schedules.task({
  id: 'daily-generate-contribution-schedule',
  cron: '45 5 * * *',
  run: async () => {
    await monthlyGenerateContributionSchedule();
    return { ok: true, task: 'daily-generate-contribution-schedule' };
  },
});

export const dailyAdvanceRotationTask = schedules.task({
  id: 'daily-advance-rotation',
  cron: '50 5 * * *',
  run: async () => {
    await monthlyAdvanceRotation();
    return { ok: true, task: 'daily-advance-rotation' };
  },
});

export const dailyContributionRemindersTask = schedules.task({
  id: 'daily-contribution-reminders',
  cron: '0 6 * * *',
  run: async () => {
    await dailyContributionReminders();
    return { ok: true, task: 'daily-contribution-reminders' };
  },
});

export const dailyOverdueCheckTask = schedules.task({
  id: 'daily-overdue-check',
  cron: '10 6 * * *',
  run: async () => {
    await dailyOverdueCheck();
    return { ok: true, task: 'daily-overdue-check' };
  },
});

export const dailyTrustScoreUpdatesTask = schedules.task({
  id: 'daily-trust-score-updates',
  cron: '20 6 * * *',
  run: async () => {
    await dailyTrustScoreUpdates();
    return { ok: true, task: 'daily-trust-score-updates' };
  },
});

export const dailyAutoChargeDueContributionsTask = schedules.task({
  id: 'daily-auto-charge-due-contributions',
  cron: '25 6 * * *',
  run: async () => {
    await dailyAutoChargeDueContributions();
    return { ok: true, task: 'daily-auto-charge-due-contributions' };
  },
});

export const dailyFailedPaymentCheckTask = schedules.task({
  id: 'daily-failed-payment-check',
  cron: '30 6 * * *',
  run: async () => {
    await dailyFailedPaymentCheck();
    return { ok: true, task: 'daily-failed-payment-check' };
  },
});

export const dailyNotificationCleanupTask = schedules.task({
  id: 'daily-notification-cleanup',
  cron: '0 3 * * *',
  run: async () => {
    await dailyNotificationCleanup();
    return { ok: true, task: 'daily-notification-cleanup' };
  },
});

export const dailyContributionDefaultRetryTask = schedules.task({
  id: 'daily-contribution-default-retry',
  cron: '35 6 * * *',
  run: async () => {
    await dailyContributionDefaultRetry();
    return { ok: true, task: 'daily-contribution-default-retry' };
  },
});

export const dailyGroupLifecycleExpiryTask = schedules.task({
  id: 'daily-group-lifecycle-expiry',
  cron: '40 6 * * *',
  run: async () => {
    await dailyGroupLifecycleExpiry();
    return { ok: true, task: 'daily-group-lifecycle-expiry' };
  },
});

export const dailyBillingActiveGroupReconciliationTask = schedules.task({
  id: 'daily-billing-active-group-reconciliation',
  cron: '45 6 * * *',
  run: async () => {
    await dailyBillingActiveGroupReconciliation();
    return { ok: true, task: 'daily-billing-active-group-reconciliation' };
  },
});

export const dailyGovernanceVoteExpiryTask = schedules.task({
  id: 'daily-governance-vote-expiry',
  cron: '50 6 * * *',
  run: async () => {
    await dailyGovernanceVoteExpiry();
    return { ok: true, task: 'daily-governance-vote-expiry' };
  },
});

export const dailySubscriptionFirstChargeRetryTask = schedules.task({
  id: 'daily-subscription-first-charge-retry',
  cron: '55 6 * * *',
  run: async () => {
    await dailySubscriptionFirstChargeRetry();
    return { ok: true, task: 'daily-subscription-first-charge-retry' };
  },
});

export const dailyPendingChargeGroupJoinFollowUpTask = schedules.task({
  id: 'daily-pending-charge-group-join-follow-up',
  cron: '0 7 * * *',
  run: async () => {
    await dailyPendingChargeGroupJoinFollowUp();
    return { ok: true, task: 'daily-pending-charge-group-join-follow-up' };
  },
});

export const dailyIncompleteProfileFollowUpTask = schedules.task({
  id: 'daily-incomplete-profile-follow-up',
  cron: '5 7 * * *',
  run: async () => {
    await dailyIncompleteProfileFollowUp();
    return { ok: true, task: 'daily-incomplete-profile-follow-up' };
  },
});

export const dailyResubscribeFollowUpTask = schedules.task({
  id: 'daily-resubscribe-follow-up',
  cron: '10 7 * * *',
  run: async () => {
    await dailyResubscribeFollowUp();
    return { ok: true, task: 'daily-resubscribe-follow-up' };
  },
});
