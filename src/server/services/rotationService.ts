import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { trustScoreService } from './trustScoreService.js';
import { TRUST_SCORE_DELTA_CYCLE_COMPLETED } from '../lib/constants.js';
import {
  sendUpcomingPayoutEmail,
  sendPayoutCompleteEmail,
} from '../integrations/email/emailService.js';

export const rotationService = {
  async getCurrent(groupId: string) {
    const group = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!group.length) throw new AppError('Group not found.', 404);

    const rows = await db.select().from(schema.rotations)
      .where(and(
        eq(schema.rotations.group_id, groupId),
        eq(schema.rotations.cycle_number, group[0].current_cycle),
      )).limit(1);
    return rows[0] ?? null;
  },

  async getNext(groupId: string) {
    const group = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!group.length) throw new AppError('Group not found.', 404);
    const g = group[0];

    // Next recipient = member at (current_rotation_position % member_count) + 1
    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    if (!members.length) return null;
    members.sort((a, b) => (a.rotation_order ?? 0) - (b.rotation_order ?? 0));

    const nextPosition = (g.current_rotation_position % members.length) + 1;
    const nextMember = members.find(m => m.rotation_order === nextPosition) ?? members[0];

    return {
      cycle_number:    g.current_cycle + 1,
      recipient_id:    nextMember.user_id,
      rotation_order:  nextPosition,
    };
  },

  async getPrevious(groupId: string) {
    const group = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!group.length) throw new AppError('Group not found.', 404);
    const g = group[0];

    if (g.current_cycle <= 1) return null; // no previous cycle yet

    const rows = await db.select().from(schema.rotations)
      .where(and(
        eq(schema.rotations.group_id, groupId),
        eq(schema.rotations.cycle_number, g.current_cycle - 1),
      )).limit(1);
    return rows[0] ?? null;
  },

  async getHistory(groupId: string) {
    
    return db.select().from(schema.rotations)
      .where(eq(schema.rotations.group_id, groupId))
      .orderBy(desc(schema.rotations.cycle_number));
  },

  async createForCycle(groupId: string, cycleNumber: number, recipientId: string, payoutDate: Date) {
    
    const id = uuidv4();
    await db.insert(schema.rotations).values({
      id, group_id: groupId, cycle_number: cycleNumber,
      recipient_id: recipientId, scheduled_payout_date: payoutDate,
      payout_status: 'pending',
    });

    await notificationService.create({
      userId: recipientId, type: 'upcoming_payout',
      title: 'Upcoming Payout',
      message: `You are scheduled to receive the payout for cycle ${cycleNumber}.`,
    });

    // Email the upcoming payout recipient
    const userRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, recipientId)).limit(1);
    const groupRow = await db.select({ name: schema.savingsGroups.name, contribution_amount: schema.savingsGroups.contribution_amount, currency: schema.savingsGroups.currency, maximum_members: schema.savingsGroups.maximum_members })
      .from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (userRow.length && groupRow.length) {
      const g = groupRow[0];
      const potAmount = `${g.currency} ${(parseFloat(g.contribution_amount) * g.maximum_members).toFixed(2)}`;
      await sendUpcomingPayoutEmail(userRow[0].email, g.name, potAmount, payoutDate.toLocaleDateString('en-GB'));
    }
    return id;
  },

  async advance(groupId: string, actorId: string, ipAddress?: string) {
    
    const groupRows = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRows.length) throw new AppError('Group not found.', 404);
    const group = groupRows[0];

    // Mark current rotation complete
    const current = await this.getCurrent(groupId);
    if (current) {
      await db.update(schema.rotations)
        .set({ payout_status: 'completed', completed_date: new Date() })
        .where(eq(schema.rotations.id, current.id));

      await notificationService.create({
        userId: current.recipient_id, type: 'payout_completed',
        title: 'Payout Completed',
        message: `Your payout for cycle ${current.cycle_number} has been completed.`,
      });
      await trustScoreService.increase(current.recipient_id, TRUST_SCORE_DELTA_CYCLE_COMPLETED, 'CYCLE_COMPLETED');

      // Email payout complete
      const recipientRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, current.recipient_id)).limit(1);
      const groupRow2 = await db.select({ name: schema.savingsGroups.name, contribution_amount: schema.savingsGroups.contribution_amount, currency: schema.savingsGroups.currency, maximum_members: schema.savingsGroups.maximum_members })
        .from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
      if (recipientRow.length && groupRow2.length) {
        const g2 = groupRow2[0];
        const potAmount = `${g2.currency} ${(parseFloat(g2.contribution_amount) * g2.maximum_members).toFixed(2)}`;
        await sendPayoutCompleteEmail(recipientRow[0].email, g2.name, potAmount, current.provider_transfer_reference ?? current.id);
      }
    }

    // Get active members sorted by rotation_order
    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    members.sort((a, b) => (a.rotation_order ?? 0) - (b.rotation_order ?? 0));

    const nextPosition = (group.current_rotation_position % members.length) + 1;
    const nextCycle = group.current_cycle + 1;
    const nextRecipient = members.find(m => m.rotation_order === nextPosition) ?? members[0];

    await db.update(schema.savingsGroups).set({
      current_rotation_position: nextPosition,
      current_cycle: nextCycle,
    }).where(eq(schema.savingsGroups.id, groupId));

    const payoutDate = new Date();
    payoutDate.setMonth(payoutDate.getMonth() + 1);
    await this.createForCycle(groupId, nextCycle, nextRecipient.user_id, payoutDate);

    await createAuditLog({ userId: actorId, action: 'ROTATION_ADVANCED', entity: 'savings_groups', entityId: groupId, ipAddress, metadata: { nextCycle, nextRecipient: nextRecipient.user_id } });
    return { nextCycle, nextRecipient: nextRecipient.user_id };
  },
};
