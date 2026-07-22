/**
 * PadiHub — Monthly scheduled tasks (Trigger.dev v3)
 *
 * Schedules (UTC, 1st of each month):
 *   08:00  generate contribution schedules
 *   08:15  advance pending rotations
 *   08:30  subscription renewal validation
 *   02:00  audit log archive
 */
import { schedules } from '@trigger.dev/sdk/v3';
import {
  monthlyGenerateContributionSchedule,
  monthlyAdvanceRotation,
  monthlySubscriptionRenewalValidation,
  monthlyAuditLogArchive,
} from '../server/services/scheduledJobs.js';

export const monthlyGenerateContributionScheduleTask = schedules.task({
  id: 'monthly-generate-contribution-schedule',
  cron: '0 8 1 * *',
  run: async () => {
    await monthlyGenerateContributionSchedule();
    return { ok: true, task: 'monthly-generate-contribution-schedule' };
  },
});

export const monthlyAdvanceRotationTask = schedules.task({
  id: 'monthly-advance-rotation',
  cron: '15 8 1 * *',
  run: async () => {
    await monthlyAdvanceRotation();
    return { ok: true, task: 'monthly-advance-rotation' };
  },
});

export const monthlySubscriptionRenewalValidationTask = schedules.task({
  id: 'monthly-subscription-renewal-validation',
  cron: '30 8 1 * *',
  run: async () => {
    await monthlySubscriptionRenewalValidation();
    return { ok: true, task: 'monthly-subscription-renewal-validation' };
  },
});

export const monthlyAuditLogArchiveTask = schedules.task({
  id: 'monthly-audit-log-archive',
  cron: '0 2 1 * *',
  run: async () => {
    await monthlyAuditLogArchive();
    return { ok: true, task: 'monthly-audit-log-archive' };
  },
});
