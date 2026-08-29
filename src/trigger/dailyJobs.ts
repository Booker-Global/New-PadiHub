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
