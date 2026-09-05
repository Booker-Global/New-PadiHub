import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { trustScoreService } from './trustScoreService.js';
import { monitoringService } from './monitoringService.js';
import { groupService } from './groupService.js';
import { getStripeProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { TRUST_SCORE_DELTA_CYCLE_COMPLETED, clampGroupMaximumMembers, resolveUserDisplayName } from '../lib/constants.js';
import { computeNextPayoutDate } from '../lib/payoutSchedule.js';
import {
  sendUpcomingPayoutEmail,
  sendPayoutCompleteEmail,
  sendGroupClosedEmail,
  sendGroupLeaderActivityEmail,
  p, table, detail,
} from '../integrations/email/emailService.js';

type SavingsGroupRow = typeof schema.savingsGroups.$inferSelect;
type RotationRow = typeof schema.rotations.$inferSelect;

/**
 * Move a completed cycle's collected pot from the platform's Stripe balance
 * (where every contribution charge lands — see StripeProvider.chargeContribution,
 * which never sets on_behalf_of/transfer_data) to that cycle's recipient's
 * Express connected account, via a separate Transfer. NG/Flutterwave payouts
 * are unaffected by this — that wiring is tracked separately.
 */
async function transferCyclePotToStripeRecipient(
  group: SavingsGroupRow, rotation: RotationRow,
): Promise<{ success: boolean; reference?: string }> {
  const recipientRows = await db.select({
    stripe_connected_account_id: schema.users.stripe_connected_account_id,
    payout_verified_at:          schema.users.payout_verified_at,
  }).from(schema.users).where(eq(schema.users.id, rotation.recipient_id)).limit(1);
  const recipient = recipientRows[0];

  if (!recipient?.stripe_connected_account_id || !recipient.payout_verified_at) {
    await recordTransferFailure(group, rotation, 'Recipient has no verified Stripe Express payout account.');
    return { success: false };
  }

  const cycleContributions = await db.select({
    amount_paid: schema.contributions.amount_paid,
    amount_due:  schema.contributions.amount_due,
  }).from(schema.contributions).where(and(
    eq(schema.contributions.group_id, group.id),
    eq(schema.contributions.cycle_number, rotation.cycle_number),
  ));
  const potMinorUnits = Math.round(cycleContributions.reduce(
    (sum, c) => sum + parseFloat(c.amount_paid ?? c.amount_due), 0,
  ) * 100);

  if (potMinorUnits <= 0) {
    await recordTransferFailure(group, rotation, 'Cycle pot total was zero — nothing to transfer.');
    return { success: false };
  }

  try {
    const result = await getStripeProvider().createTransfer({
      recipientAccountId: recipient.stripe_connected_account_id,
      amount:              potMinorUnits,
      currency:            group.currency,
      rotationId:          rotation.id,
      description:         `PadiHub payout — ${group.name} cycle ${rotation.cycle_number}`,
    });
    return { success: true, reference: result.providerTransferReference };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordTransferFailure(group, rotation, message);
    return { success: false };
  }
}

async function recordTransferFailure(group: SavingsGroupRow, rotation: RotationRow, message: string) {
  await db.update(schema.rotations)
    .set({ payout_status: 'failed' })
    .where(eq(schema.rotations.id, rotation.id));

  await monitoringService.logError({
    type: 'payment_error', endpoint: 'rotationService.advance',
    message: `Payout transfer failed for group ${group.id} cycle ${rotation.cycle_number}: ${message}`,
  });
  await notificationService.create({
    userId: rotation.recipient_id, type: 'payout_failed',
    title: 'Payout Delayed',
    message: `Your payout for cycle ${rotation.cycle_number} could not be sent yet. Our team has been notified and it will be retried automatically.`,
  });
  await createAuditLog({
    action: 'STRIPE_PAYOUT_TRANSFER_FAILED', entity: 'rotations', entityId: rotation.id,
    metadata: { groupId: group.id, cycleNumber: rotation.cycle_number, message },
  });
}

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

  /** Every rotation payout a user has ever been the recipient of, across all
   * of their groups — powers the cross-group "Contributions & Payouts at a
   * glance" summary on the Savings Groups list page. Mirrors
   * contributionService.getForMember()'s member-scoped (not group-scoped)
   * query shape. */
  async getForUser(userId: string) {
    return db.select().from(schema.rotations)
      .where(eq(schema.rotations.recipient_id, userId))
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
      const potAmount = `${g.currency} ${(parseFloat(g.contribution_amount) * clampGroupMaximumMembers(g.maximum_members)).toFixed(2)}`;
      await sendUpcomingPayoutEmail(userRow[0].email, g.name, potAmount, payoutDate.toLocaleDateString('en-GB'));
    }
    return id;
  },

  async advance(groupId: string, actorId: string, ipAddress?: string) {
    
    const groupRows = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRows.length) throw new AppError('Group not found.', 404);
    const group = groupRows[0];

    // Mark current rotation complete — for Stripe (UK) groups, a Transfer
    // must actually move the collected pot to the recipient's Express
    // account first; the platform never holds the transferred funds.
    const current = await this.getCurrent(groupId);
    if (current) {
      let transferReference: string | undefined;
      if (group.payment_provider === 'stripe' && current.payout_status !== 'completed') {
        const transfer = await transferCyclePotToStripeRecipient(group, current);
        if (!transfer.success) {
          // Leave this cycle's rotation un-advanced so the daily job retries
          // the transfer tomorrow — createTransfer's idempotency key is the
          // rotation ID, so retries can never double-pay the recipient.
          return { nextCycle: group.current_cycle, nextRecipient: current.recipient_id, transferFailed: true };
        }
        transferReference = transfer.reference;
      }

      await db.update(schema.rotations)
        .set({
          payout_status: 'completed',
          completed_date: new Date(),
          ...(transferReference ? { provider_transfer_reference: transferReference } : {}),
        })
        .where(eq(schema.rotations.id, current.id));

      await notificationService.create({
        userId: current.recipient_id, type: 'payout_completed',
        title: 'Payout Completed',
        message: `Your payout for cycle ${current.cycle_number} has been completed.`,
      });
      await trustScoreService.increase(current.recipient_id, TRUST_SCORE_DELTA_CYCLE_COMPLETED, 'CYCLE_COMPLETED');

      // Email payout complete
      const recipientRow = await db.select({ email: schema.users.email, display_name: schema.users.display_name, first_name: schema.users.first_name, last_name: schema.users.last_name })
        .from(schema.users).where(eq(schema.users.id, current.recipient_id)).limit(1);
      const groupRow2 = await db.select({ name: schema.savingsGroups.name, contribution_amount: schema.savingsGroups.contribution_amount, currency: schema.savingsGroups.currency, maximum_members: schema.savingsGroups.maximum_members, leader_id: schema.savingsGroups.leader_id })
        .from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
      if (recipientRow.length && groupRow2.length) {
        const g2 = groupRow2[0];
        const reference = transferReference ?? current.provider_transfer_reference ?? current.id;
        const potAmount = `${g2.currency} ${(parseFloat(g2.contribution_amount) * clampGroupMaximumMembers(g2.maximum_members)).toFixed(2)}`;
        await sendPayoutCompleteEmail(recipientRow[0].email, g2.name, potAmount, reference);

        // Leader must know every payout as it happens, unless they're the recipient.
        if (g2.leader_id !== current.recipient_id) {
          const leaderRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, g2.leader_id)).limit(1);
          if (leaderRow.length) {
            const recipientName = resolveUserDisplayName(recipientRow[0]);
            await sendGroupLeaderActivityEmail(leaderRow[0].email, g2.name, 'Payout completed', `
              ${p(`The cycle ${current.cycle_number} payout for <strong>${g2.name}</strong> has been sent to <strong>${recipientName}</strong>.`)}
              ${table(detail('Recipient', recipientName) + detail('Cycle', String(current.cycle_number)) + detail('Amount', potAmount) + detail('Reference', reference))}
            `);
          }
        }
      }
    }

    // Get active members sorted by rotation_order
    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    members.sort((a, b) => (a.rotation_order ?? 0) - (b.rotation_order ?? 0));

    const nextPosition = (group.current_rotation_position % members.length) + 1;
    const nextCycle = group.current_cycle + 1;

    // nextPosition wrapping back to 1 means every currently-active member has
    // now received exactly one payout this rotation — a full rotation just
    // completed (Section 15.C). This is the trigger point for: (a) checking
    // whether a fixed-length group has now run its full course, (b) an
    // indefinite group's scheduled "Close Group" taking effect, and
    // (c) re-applying the "first 3 slots reserved for Organiser/highest
    // Trust Score" rule for the new rotation that's about to start.
    if (nextPosition === 1) {
      const fullRotationsCompleted = group.full_rotations_completed + 1;
      const shouldCloseFixed = group.group_duration_type === 'fixed'
        && group.group_duration_rotations !== null
        && fullRotationsCompleted >= group.group_duration_rotations;
      const shouldCloseScheduled = group.group_duration_type === 'indefinite' && group.closure_scheduled;

      if (shouldCloseFixed || shouldCloseScheduled) {
        await db.update(schema.savingsGroups).set({
          status: 'closed',
          full_rotations_completed: fullRotationsCompleted,
          closure_scheduled: false,
        }).where(eq(schema.savingsGroups.id, groupId));

        await createAuditLog({
          userId: actorId, action: 'GROUP_CLOSED_LIFECYCLE_COMPLETE', entity: 'savings_groups', entityId: groupId, ipAddress,
          metadata: { fullRotationsCompleted, reason: shouldCloseFixed ? 'fixed_length_reached' : 'closure_scheduled' },
        });

        const memberUsers = await db.select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users).where(inArray(schema.users.id, members.map(m => m.user_id)));
        for (const u of memberUsers) {
          await notificationService.create({
            userId: u.id, type: 'group_closed',
            title: 'Group Closed',
            message: shouldCloseFixed
              ? `"${group.name}" has completed its planned ${group.group_duration_rotations} payout rotation(s) and is now closed.`
              : `"${group.name}" has closed as scheduled, now that the current payout rotation has finished.`,
          });
          await sendGroupClosedEmail(u.email, group.name);
        }

        return { nextCycle: group.current_cycle, nextRecipient: null, groupClosed: true };
      }

      // Not closing — re-sort rotation_order for the rotation that's about
      // to start, then re-read the (now reordered) active members.
      await groupService.reorderRotationByTrustScore(groupId, group.leader_id);
      const reordered = await db.select().from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
      reordered.sort((a, b) => (a.rotation_order ?? 0) - (b.rotation_order ?? 0));
      members.length = 0;
      members.push(...reordered);

      await db.update(schema.savingsGroups)
        .set({ full_rotations_completed: fullRotationsCompleted })
        .where(eq(schema.savingsGroups.id, groupId));
    }

    const nextRecipient = members.find(m => m.rotation_order === nextPosition) ?? members[0];

    await db.update(schema.savingsGroups).set({
      current_rotation_position: nextPosition,
      current_cycle: nextCycle,
    }).where(eq(schema.savingsGroups.id, groupId));

    const payoutDate = computeNextPayoutDate(group.contribution_frequency, group.payout_day, new Date());
    await this.createForCycle(groupId, nextCycle, nextRecipient.user_id, payoutDate);

    await createAuditLog({ userId: actorId, action: 'ROTATION_ADVANCED', entity: 'savings_groups', entityId: groupId, ipAddress, metadata: { nextCycle, nextRecipient: nextRecipient.user_id } });
    return { nextCycle, nextRecipient: nextRecipient.user_id };
  },

  /**
   * Section 7/10 — trigger the payout the SAME DAY every member's
   * contribution for a cycle is collected, instead of waiting for the next
   * calendar day's monthlyAdvanceRotation safety-net sweep. Called inline,
   * right after contributionService.markPaid() marks what may be the last
   * unpaid contribution in a cycle — so a group whose payout day is "today"
   * gets both the charge AND the payout confirmed today, matching what the
   * group leader is told to expect.
   *
   * Concurrency-safe: contributionService.markPaid() can call this from
   * several near-simultaneous charge confirmations (webhook + auto-charge
   * job, or two members' cards clearing within milliseconds of each other),
   * and monthlyAdvanceRotation's daily cron can ALSO call this for the same
   * group/cycle as a safety net. The conditional UPDATE below
   * (payout_status: 'pending' -> 'processing') is an atomic claim — only
   * the caller whose UPDATE actually matches a row proceeds to call
   * advance(), so the cycle can never be advanced/paid out twice. If the
   * payout transfer itself fails, the claim is released back to 'pending'
   * so the next attempt (daily catch-up) can retry it.
   */
  async advanceIfCycleComplete(groupId: string, cycleNumber: number, actorId = 'system') {
    const cycleContributions = await db.select().from(schema.contributions)
      .where(and(eq(schema.contributions.group_id, groupId), eq(schema.contributions.cycle_number, cycleNumber)));
    const allPaid = cycleContributions.length > 0 && cycleContributions.every(c => c.payment_status === 'paid');
    if (!allPaid) return null;

    const claimResult = await db.update(schema.rotations)
      .set({ payout_status: 'processing' })
      .where(and(
        eq(schema.rotations.group_id, groupId),
        eq(schema.rotations.cycle_number, cycleNumber),
        eq(schema.rotations.payout_status, 'pending'),
      ));
    const claimedRows = (claimResult as unknown as { affectedRows?: number }[])[0]?.affectedRows
      ?? (claimResult as unknown as { affectedRows?: number }).affectedRows ?? 0;
    if (!claimedRows) return null;

    try {
      const result = await this.advance(groupId, actorId);
      if (result.transferFailed) {
        await db.update(schema.rotations).set({ payout_status: 'pending' })
          .where(and(eq(schema.rotations.group_id, groupId), eq(schema.rotations.cycle_number, cycleNumber)));
      }
      return result;
    } catch (error) {
      await db.update(schema.rotations).set({ payout_status: 'pending' })
        .where(and(eq(schema.rotations.group_id, groupId), eq(schema.rotations.cycle_number, cycleNumber)));
      throw error;
    }
  },
};
