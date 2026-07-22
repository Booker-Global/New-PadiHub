/**
 * PadiHub — Daily scheduled tasks (Trigger.dev v3)
 *
 * Schedules (UTC):
 *   06:00  contribution reminders
 *   06:10  overdue check
 *   06:20  trust-score status flip
 *   06:30  failed-payment notifications
 *   03:00  notification cleanup
 */
import { schedules } from '@trigger.dev/sdk/v3';
import {
  dailyContributionReminders,
  dailyOverdueCheck,
  dailyTrustScoreUpdates,
  dailyFailedPaymentCheck,
  dailyNotificationCleanup,
} from '../server/services/scheduledJobs.js';

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
