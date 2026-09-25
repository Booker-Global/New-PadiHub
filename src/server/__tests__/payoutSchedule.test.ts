import { describe, expect, it } from 'vitest';
import { isPastPayoutDelayNoticeCutoff, PAYOUT_DELAY_NOTICE_EARLIEST_HOUR_UTC } from '../lib/payoutSchedule.js';

describe('isPastPayoutDelayNoticeCutoff', () => {
  it('is false right at midnight UTC of a same-day payout, before charging has been attempted', () => {
    const payoutDate = new Date('2024-05-10T00:00:00.000Z');
    const now = new Date('2024-05-10T02:40:00.000Z'); // e.g. the 02:40 catch-up sweep
    expect(isPastPayoutDelayNoticeCutoff(payoutDate, now)).toBe(false);
  });

  it('is false during the 06:40 catch-up sweep, still before the 07:00/07:05 charge run', () => {
    const payoutDate = new Date('2024-05-10T00:00:00.000Z');
    const now = new Date('2024-05-10T06:40:00.000Z');
    expect(isPastPayoutDelayNoticeCutoff(payoutDate, now)).toBe(false);
  });

  it(`is true once the clock reaches ${PAYOUT_DELAY_NOTICE_EARLIEST_HOUR_UTC}:00 UTC on the payout day`, () => {
    const payoutDate = new Date('2024-05-10T00:00:00.000Z');
    const now = new Date('2024-05-10T08:00:00.000Z'); // the 10:40 catch-up sweep
    expect(isPastPayoutDelayNoticeCutoff(payoutDate, now)).toBe(true);
  });

  it('is false for a payout date still in the future', () => {
    const payoutDate = new Date('2024-05-11T00:00:00.000Z');
    const now = new Date('2024-05-10T20:00:00.000Z');
    expect(isPastPayoutDelayNoticeCutoff(payoutDate, now)).toBe(false);
  });

  it('is true for a payout date that is fully in the past', () => {
    const payoutDate = new Date('2024-05-01T00:00:00.000Z');
    const now = new Date('2024-05-10T00:05:00.000Z');
    expect(isPastPayoutDelayNoticeCutoff(payoutDate, now)).toBe(true);
  });
});
