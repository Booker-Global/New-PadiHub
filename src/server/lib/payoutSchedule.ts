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

/** Inclusive min/max bounds for payout_day, or null if not applicable (daily). */
export function payoutDayBounds(frequency: ContributionFrequency): { min: number; max: number } | null {
  if (frequency === 'weekly') return { min: 0, max: 6 };
  if (frequency === 'monthly') return { min: 1, max: 31 };
  return null;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function monthlyDate(year: number, monthIndex: number, dayOfMonth: number): Date {
  const day = Math.min(dayOfMonth, lastDayOfMonth(year, monthIndex));
  return new Date(year, monthIndex, day, 0, 0, 0, 0);
}

/**
 * Compute the next payout date on/after `from`, based on the group's
 * frequency and payout_day. Falls back to sane defaults if payout_day is
 * missing (shouldn't normally happen for weekly/monthly groups, since
 * groupController requires it at creation time).
 *
 * By default (allowToday: false — the historical behaviour, still used by
 * rotationService.advance() to compute the *next* cycle's date, since the
 * cycle that just completed already used up "today" as its due date), the
 * returned date is strictly after `from`'s calendar day. Pass
 * `{ allowToday: true }` when scheduling a cycle that hasn't started yet
 * (first-cycle generation at group activation, or the safety-net job that
 * generates a cycle's schedule when none exists) — otherwise a group whose
 * payout day is today would incorrectly never get a contribution due today,
 * rolling all the way to next month/week instead.
 */
export function computeNextPayoutDate(
  frequency: ContributionFrequency,
  payoutDay: number | null | undefined,
  from: Date = new Date(),
  options: { allowToday?: boolean } = {},
): Date {
  const allowToday = options.allowToday ?? false;
  const todayStart = new Date(from);
  todayStart.setHours(0, 0, 0, 0);

  if (frequency === 'daily') {
    if (allowToday) return todayStart;
    const next = new Date(todayStart);
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (frequency === 'weekly') {
    const dayOfWeek = payoutDay !== null && payoutDay !== undefined
      ? Math.min(6, Math.max(0, payoutDay))
      : from.getDay();
    if (allowToday && todayStart.getDay() === dayOfWeek) return todayStart;
    const next = new Date(todayStart);
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() !== dayOfWeek);
    return next;
  }

  // monthly
  const dayOfMonth = payoutDay !== null && payoutDay !== undefined
    ? Math.min(31, Math.max(1, payoutDay))
    : from.getDate();
  const candidate = monthlyDate(from.getFullYear(), from.getMonth(), dayOfMonth);
  if (allowToday && candidate.getTime() === todayStart.getTime()) return candidate;
  if (candidate <= from) {
    const nextMonth = from.getMonth() + 1;
    return monthlyDate(from.getFullYear() + Math.floor(nextMonth / 12), nextMonth % 12, dayOfMonth);
  }
  return candidate;
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
