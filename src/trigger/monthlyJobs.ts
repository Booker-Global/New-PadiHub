/**
 * PadiHub — Monthly scheduled tasks (Trigger.dev v3)
 *
 * Schedules (UTC, 1st of each month):
 *   08:00  generate contribution schedules
 *   08:15  advance pending rotations
 *   08:30  subscription renewal charge (Flutterwave charges card; Stripe self-bills)
 *   02:00  audit log archive
 */
import { schedules } from '@trigger.dev/sdk/v3';
import {
  monthlyGenerateContributionSchedule,
  monthlyAdvanceRotation,
  monthlySubscriptionRenewalCharge,
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

export const monthlySubscriptionRenewalChargeTask = schedules.task({
  id: 'monthly-subscription-renewal-charge',
  cron: '30 8 1 * *',
  run: async () => {
    await monthlySubscriptionRenewalCharge();
    return { ok: true, task: 'monthly-subscription-renewal-charge' };
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
