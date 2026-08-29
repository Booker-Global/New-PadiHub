import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { trustScoreService } from './trustScoreService.js';
import { membershipService } from './membershipService.js';
import { TRUST_SCORE_DELTA_CONTRIBUTION_PAID, TRUST_SCORE_DELTA_CONTRIBUTION_MISSED } from '../lib/constants.js';
import {
  sendContributionSuccessEmail,
  sendContributionFailedEmail,
  sendContributionOverdueEmail,
} from '../integrations/email/emailService.js';

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

  async markPaid(contributionId: string, providerReference: string, ipAddress?: string, feeAmount?: string) {
    
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
      fee_amount:          feeAmount ?? c.fee_amount,
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
    }
    return true;
  },

  async markFailed(contributionId: string, ipAddress?: string) {
    
    const rows = await db.select().from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId)).limit(1);
    if (!rows.length) throw new AppError('Contribution not found.', 404);
    const c = rows[0];

    // Idempotent — don't downgrade an already-paid contribution, and don't
    // re-notify if it was already marked failed by an earlier attempt.
    if (c.payment_status === 'paid' || c.payment_status === 'failed') return true;

    await db.update(schema.contributions)
      .set({ payment_status: 'failed' })
      .where(eq(schema.contributions.id, contributionId));

    await createAuditLog({ userId: c.member_id, action: 'CONTRIBUTION_FAILED', entity: 'contributions', entityId: contributionId, ipAddress });
    await notificationService.create({
      userId: c.member_id, type: 'contribution_failed',
      title: 'Contribution Failed',
      message: `Your contribution for cycle ${c.cycle_number} failed. Please retry.`,
    });

    const userRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, c.member_id)).limit(1);
    const groupRow = await db.select({ name: schema.savingsGroups.name, currency: schema.savingsGroups.currency }).from(schema.savingsGroups).where(eq(schema.savingsGroups.id, c.group_id)).limit(1);
    if (userRow.length && groupRow.length) {
      const amount = `${groupRow[0].currency} ${parseFloat(c.amount_due).toFixed(2)}`;
      await sendContributionFailedEmail(userRow[0].email, groupRow[0].name, amount);
    }
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
