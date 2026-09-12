/**
 * Shared payout-scheduling helpers for rotating savings groups.
 *
 * A group's `payout_day` means different things depending on its
 * `contribution_frequency`:
 *   - 'weekly'  → day of week, 0 (Sunday) to 6 (Saturday)
 *   - 'monthly' → day of month, 1 to 31 (clamped to the last day of shorter
 *                 months, e.g. 31 → 28/29 in February)
 *   - 'daily'   → not applicable; payout_day is ignored/null
 *
 * Used by groupController (validating payout_day on create), rotationService
 * (computing the next scheduled payout date instead of a hardcoded
 * "+1 month"), and exposed via the group API so the frontend can show
 * members the group's payout schedule before they join.
 */
export type ContributionFrequency = 'daily' | 'weekly' | 'monthly';

/**
 * The hour (UTC/GMT) at which the platform's primary daily contribution
 * charge run fires — see dailyJobs.ts. Every member of a group whose
 * schedule is due "today" gets charged starting at this time.
 */
export const CONTRIBUTION_CHARGE_HOUR_UTC = 7;

/**
 * The same-day cut-off (UTC/GMT): once this hour has passed, a group whose
 * payout day is today (date-of-month, or day-of-week for weekly groups)
 * can no longer have its first charge/payout scheduled for today — it's
 * pushed to the next occurrence (same date next month, or same weekday
 * next week) instead. This prevents, e.g., a group created/activated at
 * 23:58 from expecting a same-day charge and payout it has no realistic
 * chance of completing. See CONTRIBUTION_CHARGE_CATCHUP_HOUR_UTC for the
 * idempotent retry run that follows the primary charge run within this
 * same cut-off window.
 */
export const CONTRIBUTION_SAME_DAY_CUTOFF_HOUR_UTC = 17;

/**
 * A second, idempotent same-day retry of the charge run — only re-attempts
 * accounts still unresolved (unpaid) from the CONTRIBUTION_CHARGE_HOUR_UTC
 * run (transient provider errors, a card added moments too late, etc.).
 * Never double-charges: dailyAutoChargeDueContributions only ever touches
 * contributions still in 'due' status, and a contribution leaves 'due' the
 * instant it's actually charged (successfully or not). Deliberately set an
 * hour after CONTRIBUTION_SAME_DAY_CUTOFF_HOUR_UTC so every group that was
 * allowed to target "today" has had its charge attempted at least once
 * before this final catch-up sweep.
 */
export const CONTRIBUTION_CHARGE_CATCHUP_HOUR_UTC = 18;

/** True once `date` (UTC) is at/after the same-day charging cut-off. */
export function isPastSameDayChargeCutoff(date: Date = new Date()): boolean {
  return date.getUTCHours() >= CONTRIBUTION_SAME_DAY_CUTOFF_HOUR_UTC;
}

/** Inclusive min/max bounds for payout_day, or null if not applicable (daily). */
export function payoutDayBounds(frequency: ContributionFrequency): { min: number; max: number } | null {
  if (frequency === 'weekly') return { min: 0, max: 6 };
  if (frequency === 'monthly') return { min: 1, max: 31 };
  return null;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function monthlyDate(year: number, monthIndex: number, dayOfMonth: number): Date {
  const day = Math.min(dayOfMonth, lastDayOfMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}

/**
 * Compute the next payout date on/after `from`, based on the group's
 * frequency and payout_day. Falls back to sane defaults if payout_day is
 * missing (shouldn't normally happen for weekly/monthly groups, since
 * groupController requires it at creation time).
 *
 * All calendar-day comparisons are done in UTC (== GMT for this platform's
 * purposes — see CONTRIBUTION_SAME_DAY_CUTOFF_HOUR_UTC), independent of the
 * server process's local timezone.
 *
 * By default (allowToday: false — the historical behaviour, still used by
 * rotationService.advance() to compute the *next* cycle's date, since the
 * cycle that just completed already used up "today" as its due date), the
 * returned date is strictly after `from`'s calendar day. Pass
 * `{ allowToday: true }` when scheduling a cycle that hasn't started yet
 * (first-cycle generation at group activation, or the safety-net job that
 * generates a cycle's schedule when none exists) — otherwise a group whose
 * payout day is today would incorrectly never get a contribution due today,
 * rolling all the way to next month/week instead. Prefer
 * `resolveFirstScheduleDate` over calling this directly with
 * `allowToday: true`, since that also applies the same-day cut-off.
 */
export function computeNextPayoutDate(
  frequency: ContributionFrequency,
  payoutDay: number | null | undefined,
  from: Date = new Date(),
  options: { allowToday?: boolean } = {},
): Date {
  const allowToday = options.allowToday ?? false;
  const todayStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));

  if (frequency === 'daily') {
    if (allowToday) return todayStart;
    const next = new Date(todayStart);
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (frequency === 'weekly') {
    const dayOfWeek = payoutDay !== null && payoutDay !== undefined
      ? Math.min(6, Math.max(0, payoutDay))
      : from.getUTCDay();
    if (allowToday && todayStart.getUTCDay() === dayOfWeek) return todayStart;
    const next = new Date(todayStart);
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (next.getUTCDay() !== dayOfWeek);
    return next;
  }

  // monthly
  const dayOfMonth = payoutDay !== null && payoutDay !== undefined
    ? Math.min(31, Math.max(1, payoutDay))
    : from.getUTCDate();
  const candidate = monthlyDate(from.getUTCFullYear(), from.getUTCMonth(), dayOfMonth);
  if (allowToday && candidate.getTime() === todayStart.getTime()) return candidate;
  if (candidate <= from) {
    const nextMonth = from.getUTCMonth() + 1;
    return monthlyDate(from.getUTCFullYear() + Math.floor(nextMonth / 12), nextMonth % 12, dayOfMonth);
  }
  return candidate;
}

/**
 * Resolve the due/payout date for a cycle that hasn't been scheduled yet
 * (group activation's first cycle, or the safety-net job backfilling a
 * missing schedule) — the one place `allowToday` should ever be combined
 * with the same-day charging cut-off (Section 7/10): if the group's payout
 * day is today but CONTRIBUTION_SAME_DAY_CUTOFF_HOUR_UTC has already
 * passed, "today" is deliberately NOT used — there isn't a realistic
 * window left for the 07:00/18:00 GMT charge runs to collect and pay out
 * today, so the date rolls to the same date/weekday next month/week
 * instead. `cutoffApplied` tells the caller whether that happened, so the
 * group leader/creator can be told why their first charge isn't today.
 */
export function resolveFirstScheduleDate(
  frequency: ContributionFrequency,
  payoutDay: number | null | undefined,
  from: Date = new Date(),
): { dueDate: Date; cutoffApplied: boolean } {
  const pastCutoff = isPastSameDayChargeCutoff(from);
  const ifAllowedToday = computeNextPayoutDate(frequency, payoutDay, from, { allowToday: true });
  const todayStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const targetsToday = ifAllowedToday.getTime() === todayStart.getTime();

  if (targetsToday && pastCutoff) {
    return { dueDate: computeNextPayoutDate(frequency, payoutDay, from, { allowToday: false }), cutoffApplied: true };
  }
  return { dueDate: ifAllowedToday, cutoffApplied: false };
}

/** Human-readable summary of a group's payout schedule, e.g. "Every Monday" or "Monthly on the 15th". */
export function describePayoutSchedule(frequency: ContributionFrequency, payoutDay: number | null | undefined): string {
  if (frequency === 'daily') return 'Every day';
  if (frequency === 'weekly') {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const idx = payoutDay !== null && payoutDay !== undefined ? Math.min(6, Math.max(0, payoutDay)) : 0;
    return `Every ${names[idx]}`;
  }
  const day = payoutDay !== null && payoutDay !== undefined ? Math.min(31, Math.max(1, payoutDay)) : 1;
  const suffix = day % 10 === 1 && day !== 11 ? 'st'
    : day % 10 === 2 && day !== 12 ? 'nd'
    : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `Monthly on the ${day}${suffix}`;
}
