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
 * Compute the next payout date strictly after `from`, based on the group's
 * frequency and payout_day. Falls back to sane defaults if payout_day is
 * missing (shouldn't normally happen for weekly/monthly groups, since
 * groupController requires it at creation time).
 */
export function computeNextPayoutDate(
  frequency: ContributionFrequency,
  payoutDay: number | null | undefined,
  from: Date = new Date(),
): Date {
  if (frequency === 'daily') {
    const next = new Date(from);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  if (frequency === 'weekly') {
    const dayOfWeek = payoutDay !== null && payoutDay !== undefined
      ? Math.min(6, Math.max(0, payoutDay))
      : from.getDay();
    const next = new Date(from);
    next.setHours(0, 0, 0, 0);
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() !== dayOfWeek);
    return next;
  }

  // monthly
  const dayOfMonth = payoutDay !== null && payoutDay !== undefined
    ? Math.min(31, Math.max(1, payoutDay))
    : from.getDate();
  let candidate = monthlyDate(from.getFullYear(), from.getMonth(), dayOfMonth);
  if (candidate <= from) {
    const nextMonth = from.getMonth() + 1;
    candidate = monthlyDate(from.getFullYear() + Math.floor(nextMonth / 12), nextMonth % 12, dayOfMonth);
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
