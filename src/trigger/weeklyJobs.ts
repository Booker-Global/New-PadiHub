/**
 * PadiHub — Weekly scheduled tasks (Trigger.dev v3)
 *
 * Schedules (UTC, every Monday):
 *   07:00  expired invitation cleanup
 *   07:15  subscription health check + renewal reminders
 *   07:30  database maintenance
 */
import { schedules } from '@trigger.dev/sdk/v3';
import {
  weeklyExpiredInvitationCleanup,
  weeklySubscriptionHealthCheck,
  weeklyDatabaseMaintenance,
} from '../server/services/scheduledJobs.js';

export const weeklyExpiredInvitationCleanupTask = schedules.task({
  id: 'weekly-expired-invitation-cleanup',
  cron: '0 7 * * 1',
  run: async () => {
    await weeklyExpiredInvitationCleanup();
    return { ok: true, task: 'weekly-expired-invitation-cleanup' };
  },
});

export const weeklySubscriptionHealthCheckTask = schedules.task({
  id: 'weekly-subscription-health-check',
  cron: '15 7 * * 1',
  run: async () => {
    await weeklySubscriptionHealthCheck();
    return { ok: true, task: 'weekly-subscription-health-check' };
  },
});

export const weeklyDatabaseMaintenanceTask = schedules.task({
  id: 'weekly-database-maintenance',
  cron: '30 7 * * 1',
  run: async () => {
    await weeklyDatabaseMaintenance();
    return { ok: true, task: 'weekly-database-maintenance' };
  },
});
