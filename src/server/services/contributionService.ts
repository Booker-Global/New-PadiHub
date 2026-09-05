import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { trustScoreService } from './trustScoreService.js';
import { membershipService } from './membershipService.js';
import { TRUST_SCORE_DELTA_CONTRIBUTION_PAID, TRUST_SCORE_DELTA_CONTRIBUTION_MISSED, CONTRIBUTION_DEFAULT_GRACE_PERIOD_MS, resolveUserDisplayName } from '../lib/constants.js';
import {
  sendContributionSuccessEmail,
  sendContributionOverdueEmail,
  sendPaymentGracePeriodStartedEmail,
  sendMemberDefaultSuspensionEmail,
  sendGroupLeaderActivityEmail,
  p, table, detail,
} from '../integrations/email/emailService.js';

/**
 * Section: a group leader is accountable for the whole group's health, so
 * they must be copied on every significant contribution activity event for
 * groups they lead — unless the event is about the leader's OWN
 * contribution (they already get the member-facing email for that).
 * Best-effort/never-throwing: a failed leader-notification email must never
 * block the underlying contribution state transition.
 */
async function notifyGroupLeaderOfContributionActivity(
  groupId: string, memberId: string, headline: string, bodyBuilder: (memberName: string, groupName: string) => string,
): Promise<void> {
  try {
    const groupRow = await db.select({ name: schema.savingsGroups.name, leader_id: schema.savingsGroups.leader_id })
      .from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRow.length || groupRow[0].leader_id === memberId) return;

    const [leaderRow, memberRow] = await Promise.all([
      db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, groupRow[0].leader_id)).limit(1),
      db.select({ display_name: schema.users.display_name, first_name: schema.users.first_name, last_name: schema.users.last_name, email: schema.users.email })
        .from(schema.users).where(eq(schema.users.id, memberId)).limit(1),
    ]);
    if (!leaderRow.length) return;
    const memberName = resolveUserDisplayName(memberRow[0]);
    await sendGroupLeaderActivityEmail(leaderRow[0].email, groupRow[0].name, headline, bodyBuilder(memberName, groupRow[0].name));
  } catch (error) {
    console.error('[ContributionService] Failed to notify group leader of contribution activity:', error);
  }
}

export const contributionService = {
  async getForGroup(groupId: string, cycleNumber?: number) {
    
    const condition = cycleNumber
      ? and(eq(schema.contributions.group_id, groupId), eq(schema.contributions.cycle_number, cycleNumber))
      : eq(schema.contributions.group_id, groupId);
    return db.select().from(schema.contributions).where(condition);
  },

  async getForMember(memberId: string) {
    
    return db.select().from(schema.contributions).where(eq(schema.contributions.member_id, memberId));
  },

  async create(data: {
    group_id: string; member_id: string; cycle_number: number;
    amount_due: string; due_date: Date;
  }) {
    
    const id = uuidv4();
    await db.insert(schema.contributions).values({
      id,
      group_id:       data.group_id,
      member_id:      data.member_id,
      cycle_number:   data.cycle_number,
      amount_due:     data.amount_due,
      due_date:       data.due_date,
      payment_status: 'scheduled',
    });
    return id;
  },

  async markPaid(
    contributionId: string,
    providerReference: string,
    ipAddress?: string,
    feeBreakdown?: {
      feeAmount?: string;
      cardFeeAmount?: string;
      cardFeeVatAmount?: string;
      payoutFeeShareAmount?: string;
      payoutFeeShareVatAmount?: string;
    },
  ) {
    
    const rows = await db.select().from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId)).limit(1);
    if (!rows.length) throw new AppError('Contribution not found.', 404);
    const c = rows[0];

    // Idempotent: a contribution may be charged and marked paid synchronously
    // (e.g. by the auto-charge job) and again later by the provider webhook —
    // skip re-processing so trust score / notifications / emails aren't duplicated.
    if (c.payment_status === 'paid') return true;

    await db.update(schema.contributions).set({
      payment_status:     'paid',
      amount_paid:        c.amount_due,
      fee_amount:                  feeBreakdown?.feeAmount ?? c.fee_amount,
      card_fee_amount:             feeBreakdown?.cardFeeAmount ?? c.card_fee_amount,
      card_fee_vat_amount:         feeBreakdown?.cardFeeVatAmount ?? c.card_fee_vat_amount,
      payout_fee_share_amount:     feeBreakdown?.payoutFeeShareAmount ?? c.payout_fee_share_amount,
      payout_fee_share_vat_amount: feeBreakdown?.payoutFeeShareVatAmount ?? c.payout_fee_share_vat_amount,
      paid_date:          new Date(),
      provider_reference: providerReference,
    }).where(eq(schema.contributions.id, contributionId));

    await createAuditLog({ userId: c.member_id, action: 'CONTRIBUTION_PAID', entity: 'contributions', entityId: contributionId, ipAddress });
    await notificationService.create({
      userId: c.member_id, type: 'contribution_paid',
      title: 'Contribution Recorded',
      message: `Your contribution for cycle ${c.cycle_number} has been recorded.`,
    });
    await trustScoreService.increase(c.member_id, TRUST_SCORE_DELTA_CONTRIBUTION_PAID, 'CONTRIBUTION_PAID');

    // Email — look up user email and group name
    const userRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, c.member_id)).limit(1);
    const groupRow = await db.select({ name: schema.savingsGroups.name, currency: schema.savingsGroups.currency }).from(schema.savingsGroups).where(eq(schema.savingsGroups.id, c.group_id)).limit(1);
    if (userRow.length && groupRow.length) {
      const amount = `${groupRow[0].currency} ${parseFloat(c.amount_due).toFixed(2)}`;
      const date = new Date().toLocaleDateString('en-GB');
      await sendContributionSuccessEmail(userRow[0].email, groupRow[0].name, amount, date, providerReference);
      await notifyGroupLeaderOfContributionActivity(c.group_id, c.member_id, 'Member contribution paid', (memberName, groupName) => `
        ${p(`<strong>${memberName}</strong>'s contribution for cycle ${c.cycle_number} in <strong>${groupName}</strong> has been successfully paid.`)}
        ${table(detail('Member', memberName) + detail('Cycle', String(c.cycle_number)) + detail('Amount', amount) + detail('Reference', providerReference))}
      `);
    }
    return true;
  },

  /**
   * A real charge attempt failed (Section 6 — distinct from markMissed,
   * which fires when a contribution reaches its due date without any
   * charge attempt ever completing). First failure: start the single
   * 72-hour grace period (status -> 'pending_default'), notify the member
   * and the group, and stop — NO charge happens again until the grace
   * period ends. `isGraceRetry` is passed by dailyContributionDefaultRetry
   * once, at the end of that grace period; if that single retry also
   * fails, the contribution is marked 'defaulted' and the member is
   * flagged via membershipService.flagDefault (which itself decides,
   * based on the group's max-permitted-defaults setting, whether to retain
   * the member or trigger Compensated Compression). No further retries,
   * continuous payment authority, or substitute-member matching occurs.
   */
  async markFailed(contributionId: string, ipAddress?: string, isGraceRetry = false) {
    
    const rows = await db.select().from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId)).limit(1);
    if (!rows.length) throw new AppError('Contribution not found.', 404);
    const c = rows[0];

    // Idempotent — don't downgrade an already-paid contribution, and don't
    // re-process a contribution that's already been carried past this point.
    if (c.payment_status === 'paid' || c.payment_status === 'defaulted') return true;

    const userRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, c.member_id)).limit(1);
    const groupRow = await db.select({ name: schema.savingsGroups.name, currency: schema.savingsGroups.currency }).from(schema.savingsGroups).where(eq(schema.savingsGroups.id, c.group_id)).limit(1);
    const amount = groupRow.length ? `${groupRow[0].currency} ${parseFloat(c.amount_due).toFixed(2)}` : c.amount_due;

    if (!isGraceRetry && c.payment_status !== 'pending_default') {
      // First failure — start the 72-hour grace period. No default is
      // recorded yet and no further action is taken until the single
      // automatic retry runs at the end of the grace period.
      const graceEndsAt = new Date(Date.now() + CONTRIBUTION_DEFAULT_GRACE_PERIOD_MS);
      await db.update(schema.contributions)
        .set({ payment_status: 'pending_default', grace_period_ends_at: graceEndsAt, retry_attempted: false })
        .where(eq(schema.contributions.id, contributionId));

      await createAuditLog({ userId: c.member_id, action: 'CONTRIBUTION_GRACE_PERIOD_STARTED', entity: 'contributions', entityId: contributionId, ipAddress, metadata: { graceEndsAt } });
      await notificationService.create({
        userId: c.member_id, type: 'contribution_grace_period_started',
        title: 'Payment Failed — Grace Period Started',
        message: `Your contribution for cycle ${c.cycle_number} failed. You have a 72-hour grace period before a single automatic retry on ${graceEndsAt.toLocaleString('en-GB')}.`,
      });

      const activeMembers = await db.select().from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, c.group_id), eq(schema.memberships.status, 'active')));
      for (const m of activeMembers) {
        if (m.user_id === c.member_id) continue;
        await notificationService.create({
          userId: m.user_id, type: 'group_member_payment_grace_period',
          title: 'Member Payment Pending',
          message: `A member's contribution for cycle ${c.cycle_number} failed and is now in a 72-hour grace period before one automatic retry.`,
        });
      }

      if (userRow.length && groupRow.length) {
        await sendPaymentGracePeriodStartedEmail(userRow[0].email, groupRow[0].name, amount, graceEndsAt.toLocaleString('en-GB'));
        await notifyGroupLeaderOfContributionActivity(c.group_id, c.member_id, 'Member payment failed — grace period started', (memberName, groupName) => `
          ${p(`<strong>${memberName}</strong>'s contribution for cycle ${c.cycle_number} in <strong>${groupName}</strong> failed. A 72-hour grace period has started before a single automatic retry.`)}
          ${table(detail('Member', memberName) + detail('Cycle', String(c.cycle_number)) + detail('Amount', amount) + detail('Retry by', graceEndsAt.toLocaleString('en-GB')))}
        `);
      }
      return true;
    }

    // The single automatic retry (or a first attempt already past its own
    // grace deadline) also failed — record the default and hand off to
    // membershipService to decide retain-vs-Compensated-Compression.
    await db.update(schema.contributions)
      .set({ payment_status: 'defaulted', retry_attempted: true })
      .where(eq(schema.contributions.id, contributionId));

    await createAuditLog({ userId: c.member_id, action: 'CONTRIBUTION_DEFAULTED', entity: 'contributions', entityId: contributionId, ipAddress });
    await notificationService.create({
      userId: c.member_id, type: 'contribution_defaulted',
      title: 'Contribution Defaulted',
      message: `Your contribution for cycle ${c.cycle_number} is now in default after the automatic retry also failed.`,
    });
    await trustScoreService.decrease(c.member_id, TRUST_SCORE_DELTA_CONTRIBUTION_MISSED, 'CONTRIBUTION_MISSED');

    if (userRow.length && groupRow.length) {
      await sendMemberDefaultSuspensionEmail(userRow[0].email, groupRow[0].name, amount);
      await notifyGroupLeaderOfContributionActivity(c.group_id, c.member_id, 'Member contribution defaulted', (memberName, groupName) => `
        ${p(`<strong>${memberName}</strong>'s contribution for cycle ${c.cycle_number} in <strong>${groupName}</strong> is now in default after the automatic retry also failed. This may affect the group's rotation order and payout schedule.`)}
        ${table(detail('Member', memberName) + detail('Cycle', String(c.cycle_number)) + detail('Amount', amount))}
      `);
    }

    await membershipService.flagDefault(c.member_id, c.group_id, contributionId, ipAddress);
    return true;
  },

  async markMissed(contributionId: string, ipAddress?: string) {
    
    const rows = await db.select().from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId)).limit(1);
    if (!rows.length) throw new AppError('Contribution not found.', 404);
    const c = rows[0];

    await db.update(schema.contributions)
      .set({ payment_status: 'missed' })
      .where(eq(schema.contributions.id, contributionId));

    // Delegate strike increment + threshold enforcement to membershipService
    await membershipService.applyStrike(c.member_id, c.group_id, ipAddress);

    await createAuditLog({ userId: c.member_id, action: 'CONTRIBUTION_MISSED', entity: 'contributions', entityId: contributionId, ipAddress });
    await notificationService.create({
      userId: c.member_id, type: 'contribution_missed',
      title: 'Missed Contribution',
      message: `You missed your contribution for cycle ${c.cycle_number}. This affects your Trust Score.`,
    });
    await trustScoreService.decrease(c.member_id, TRUST_SCORE_DELTA_CONTRIBUTION_MISSED, 'CONTRIBUTION_MISSED');

    const userRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, c.member_id)).limit(1);
    const groupRow = await db.select({ name: schema.savingsGroups.name, currency: schema.savingsGroups.currency }).from(schema.savingsGroups).where(eq(schema.savingsGroups.id, c.group_id)).limit(1);
    if (userRow.length && groupRow.length) {
      const amount = `${groupRow[0].currency} ${parseFloat(c.amount_due).toFixed(2)}`;
      await sendContributionOverdueEmail(userRow[0].email, groupRow[0].name, amount);
      await notifyGroupLeaderOfContributionActivity(c.group_id, c.member_id, 'Member missed a contribution', (memberName, groupName) => `
        ${p(`<strong>${memberName}</strong> missed their contribution for cycle ${c.cycle_number} in <strong>${groupName}</strong>. This affects their Trust Score and strike count.`)}
        ${table(detail('Member', memberName) + detail('Cycle', String(c.cycle_number)) + detail('Amount', amount))}
      `);
    }
    return true;
  },

  // Generate a full cycle's contribution records for all active members
  async generateCycleSchedule(groupId: string, cycleNumber: number, dueDate: Date, members: { user_id: string; amount_due: string }[]) {
    const ids: string[] = [];
    for (const m of members) {
      const id = await this.create({ group_id: groupId, member_id: m.user_id, cycle_number: cycleNumber, amount_due: m.amount_due, due_date: dueDate });
      ids.push(id);
    }
    return ids;
  },
};
