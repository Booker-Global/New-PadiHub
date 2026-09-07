/**
 * PadiHub — In-process scheduled job runner (Trigger.dev fallback).
 *
 * Trigger.dev's cron schedules (src/trigger/*.ts) only actually fire once
 * this project has been deployed to Trigger.dev's cloud (`npx trigger.dev
 * deploy`) with a valid TRIGGER_SECRET_KEY/TRIGGER_PROJECT_REF configured.
 * Neither this repo's build/start scripts, nor any CI workflow, perform that
 * deploy step, and no TRIGGER_* env var is referenced anywhere in the
 * codebase — so in a plain `npm run build && npm start` deployment (e.g.
 * Render), the Trigger.dev task definitions are effectively dead code: they
 * exist, but nothing ever registers or invokes them, meaning contribution
 * charges, payouts, subscription renewals, and reminder emails silently
 * never run at all.
 *
 * This module is a self-contained, dependency-free fallback that ticks once
 * a minute and invokes the exact same job functions (from scheduledJobs.ts)
 * at the same UTC times documented in src/trigger/*.ts, so scheduled jobs
 * run reliably from inside the web server process itself — independent of
 * whether Trigger.dev's cloud is ever configured. It is safe to run
 * alongside a properly-configured Trigger.dev deployment too: every job
 * already writes to the `job_runs` table via scheduledJobs.ts's shared
 * runJob() wrapper and only ever mutates rows still in a "not yet processed"
 * status, so a duplicate invocation from two schedulers is always a no-op.
 *
 * Can be disabled (e.g. if Trigger.dev is confirmed working in a given
 * environment and running both would be redundant) by setting
 * DISABLE_IN_PROCESS_SCHEDULER=true.
 */
import { monitoringService } from '../services/monitoringService.js';
import * as jobs from '../services/scheduledJobs.js';

type Cadence = 'daily' | 'weekly' | 'monthly';

interface ScheduleEntry {
  /** Must match the name passed to runJob() in scheduledJobs.ts so job_runs lookups line up. */
  jobName: string;
  hourUtc: number;
  minuteUtc: number;
  cadence: Cadence;
  /** Only used when cadence === 'weekly'. 0 = Sunday, 1 = Monday, ... 6 = Saturday. */
  dayOfWeek?: number;
  /** Only used when cadence === 'monthly'. Defaults to 1 (1st of month). */
  dayOfMonth?: number;
  run: () => Promise<void>;
}

// Mirrors src/trigger/dailyJobs.ts, weeklyJobs.ts and monthlyJobs.ts. Where a
// job is intentionally run both daily (as the primary/safety-net trigger) and
// monthly (as a redundant Trigger.dev-only backstop), only the daily entry is
// listed here — running it once a day already covers the monthly case.
const SCHEDULE: ScheduleEntry[] = [
  { jobName: 'monthly_generate_contribution_schedule', hourUtc: 5, minuteUtc: 45, cadence: 'daily', run: jobs.monthlyGenerateContributionSchedule },
  { jobName: 'monthly_advance_rotation', hourUtc: 5, minuteUtc: 50, cadence: 'daily', run: jobs.monthlyAdvanceRotation },
  { jobName: 'daily_contribution_reminders', hourUtc: 6, minuteUtc: 0, cadence: 'daily', run: jobs.dailyContributionReminders },
  { jobName: 'daily_overdue_check', hourUtc: 6, minuteUtc: 50, cadence: 'daily', run: jobs.dailyOverdueCheck },
  { jobName: 'daily_trust_score_updates', hourUtc: 7, minuteUtc: 0, cadence: 'daily', run: jobs.dailyTrustScoreUpdates },
  { jobName: 'daily_auto_charge_due_contributions', hourUtc: 7, minuteUtc: 5, cadence: 'daily', run: jobs.dailyAutoChargeDueContributions },
  { jobName: 'daily_failed_payment_check', hourUtc: 7, minuteUtc: 10, cadence: 'daily', run: jobs.dailyFailedPaymentCheck },
  { jobName: 'daily_contribution_default_retry', hourUtc: 7, minuteUtc: 15, cadence: 'daily', run: jobs.dailyContributionDefaultRetry },
  { jobName: 'daily_group_lifecycle_expiry', hourUtc: 7, minuteUtc: 20, cadence: 'daily', run: jobs.dailyGroupLifecycleExpiry },
  { jobName: 'daily_billing_active_group_reconciliation', hourUtc: 7, minuteUtc: 25, cadence: 'daily', run: jobs.dailyBillingActiveGroupReconciliation },
  { jobName: 'daily_governance_vote_expiry', hourUtc: 7, minuteUtc: 30, cadence: 'daily', run: jobs.dailyGovernanceVoteExpiry },
  { jobName: 'daily_subscription_first_charge_retry', hourUtc: 7, minuteUtc: 35, cadence: 'daily', run: jobs.dailySubscriptionFirstChargeRetry },
  { jobName: 'daily_pending_charge_group_join_follow_up', hourUtc: 7, minuteUtc: 40, cadence: 'daily', run: jobs.dailyPendingChargeGroupJoinFollowUp },
  { jobName: 'daily_incomplete_profile_follow_up', hourUtc: 7, minuteUtc: 45, cadence: 'daily', run: jobs.dailyIncompleteProfileFollowUp },
  { jobName: 'daily_resubscribe_follow_up', hourUtc: 7, minuteUtc: 50, cadence: 'daily', run: jobs.dailyResubscribeFollowUp },
  // See dailyJobs.ts comment: subscription renewals must be checked daily —
  // renewal_date lands on each user's own join day, not the 1st of the month.
  { jobName: 'monthly_subscription_renewal_charge', hourUtc: 7, minuteUtc: 55, cadence: 'daily', run: jobs.monthlySubscriptionRenewalCharge },
  { jobName: 'daily_charge_catch_up', hourUtc: 18, minuteUtc: 0, cadence: 'daily', run: jobs.dailyChargeCatchUp },
  { jobName: 'daily_notification_cleanup', hourUtc: 3, minuteUtc: 0, cadence: 'daily', run: jobs.dailyNotificationCleanup },
  { jobName: 'weekly_expired_invitation_cleanup', hourUtc: 7, minuteUtc: 0, cadence: 'weekly', dayOfWeek: 1, run: jobs.weeklyExpiredInvitationCleanup },
  { jobName: 'weekly_subscription_health_check', hourUtc: 7, minuteUtc: 15, cadence: 'weekly', dayOfWeek: 1, run: jobs.weeklySubscriptionHealthCheck },
  { jobName: 'weekly_database_maintenance', hourUtc: 7, minuteUtc: 30, cadence: 'weekly', dayOfWeek: 1, run: jobs.weeklyDatabaseMaintenance },
  { jobName: 'monthly_audit_log_archive', hourUtc: 2, minuteUtc: 0, cadence: 'monthly', dayOfMonth: 1, run: jobs.monthlyAuditLogArchive },
];

const TICK_INTERVAL_MS = 60 * 1000;

/** Start of the current period (UTC) that a run of this cadence "belongs to" — used to detect a run already recorded for the current slot. */
function periodStart(entry: ScheduleEntry, now: Date): Date {
  if (entry.cadence === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  }
  if (entry.cadence === 'weekly') {
    const dow = now.getUTCDay();
    const daysSinceWeekStart = (dow - (entry.dayOfWeek ?? 1) + 7) % 7;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    start.setUTCDate(start.getUTCDate() - daysSinceWeekStart);
    return start;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

function matchesSlot(entry: ScheduleEntry, now: Date): boolean {
  if (entry.cadence === 'weekly' && now.getUTCDay() !== (entry.dayOfWeek ?? 1)) return false;
  if (entry.cadence === 'monthly' && now.getUTCDate() !== (entry.dayOfMonth ?? 1)) return false;
  return now.getUTCHours() === entry.hourUtc && now.getUTCMinutes() === entry.minuteUtc;
}

/** Has this scheduled slot already passed for the current period as of `now`? */
function slotAlreadyDueThisPeriod(entry: ScheduleEntry, now: Date): boolean {
  if (entry.cadence === 'weekly') {
    const start = periodStart(entry, now);
    const slot = new Date(start);
    slot.setUTCHours(entry.hourUtc, entry.minuteUtc, 0, 0);
    return now.getTime() >= slot.getTime();
  }
  if (entry.cadence === 'monthly') {
    if (now.getUTCDate() < (entry.dayOfMonth ?? 1)) return false;
    if (now.getUTCDate() > (entry.dayOfMonth ?? 1)) return true;
    return now.getUTCHours() > entry.hourUtc
      || (now.getUTCHours() === entry.hourUtc && now.getUTCMinutes() >= entry.minuteUtc);
  }
  return now.getUTCHours() > entry.hourUtc
    || (now.getUTCHours() === entry.hourUtc && now.getUTCMinutes() >= entry.minuteUtc);
}

const runningNow = new Set<string>();

async function runIfNotAlreadyDone(entry: ScheduleEntry, now: Date, reason: 'slot' | 'startup-catchup'): Promise<void> {
  if (runningNow.has(entry.jobName)) return;
  const since = periodStart(entry, now);
  try {
    if (await monitoringService.hasRunSince(entry.jobName, since)) return;
  } catch (err) {
    console.error(`[InProcessScheduler] Failed to check job_runs for ${entry.jobName}:`, err instanceof Error ? err.message : err);
    return;
  }

  runningNow.add(entry.jobName);
  console.log(`[InProcessScheduler] Running ${entry.jobName} (${reason}) at ${now.toISOString()}`);
  try {
    await entry.run();
  } catch (err) {
    // entry.run() (scheduledJobs.ts's runJob wrapper) already swallows and
    // records job errors — this catch is only a last-resort safety net.
    console.error(`[InProcessScheduler] Unexpected error running ${entry.jobName}:`, err instanceof Error ? err.message : err);
  } finally {
    runningNow.delete(entry.jobName);
  }
}

async function tick(): Promise<void> {
  const now = new Date();
  for (const entry of SCHEDULE) {
    if (matchesSlot(entry, now)) {
      void runIfNotAlreadyDone(entry, now, 'slot');
    }
  }
}

/**
 * Sweep every job once at startup: anything whose slot has already passed
 * for the current period (day/week/month) and has no recorded run yet is
 * fired immediately, staggered slightly to avoid a startup thundering herd.
 * This self-heals a deploy/restart that lands mid-day after a scheduled slot.
 */
async function startupCatchUp(): Promise<void> {
  const now = new Date();
  const due = SCHEDULE.filter((entry) => slotAlreadyDueThisPeriod(entry, now));
  for (const [index, entry] of due.entries()) {
    setTimeout(() => {
      void runIfNotAlreadyDone(entry, new Date(), 'startup-catchup');
    }, index * 2000);
  }
}

let started = false;

/** Call once at server boot (after DB connectivity is confirmed). Idempotent. */
export function startInProcessScheduler(): void {
  if (started) return;
  if (String(process.env.DISABLE_IN_PROCESS_SCHEDULER).toLowerCase() === 'true') {
    console.log('[InProcessScheduler] Disabled via DISABLE_IN_PROCESS_SCHEDULER.');
    return;
  }
  started = true;
  console.log(`[InProcessScheduler] Starting — ${SCHEDULE.length} scheduled jobs registered.`);
  void startupCatchUp();
  setInterval(() => { void tick(); }, TICK_INTERVAL_MS).unref();
}
