import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { trustScoreService } from './trustScoreService.js';
import { groupService } from './groupService.js';
import { assertPaymentSetupComplete } from './paymentEligibilityService.js';
import { TRUST_SCORE_DELTA_MEMBER_SUSPENDED } from '../lib/constants.js';
import {
  sendMemberRemovedEmail,
  sendGroupMemberSuspendedNotificationEmail,
  sendInvitationAcceptedEmail,
} from '../integrations/email/emailService.js';

export const membershipService = {
  async getForGroup(groupId: string) {
    return db.select().from(schema.memberships).where(eq(schema.memberships.group_id, groupId));
  },

  async getForUser(userId: string) {
    return db.select().from(schema.memberships).where(eq(schema.memberships.user_id, userId));
  },

  async join(userId: string, groupId: string, inviteToken?: string, ipAddress?: string) {
    const group = await groupService.getById(groupId);
    if (group.status !== 'active') throw new AppError('Group is not active.', 400);

    // Check capacity
    const members = await this.getForGroup(groupId);
    const activeCount = members.filter(m => m.status === 'active').length;
    if (activeCount >= group.maximum_members) throw new AppError('Group is full.', 400, 'GROUP_FULL');

    // Check not already a member
    const existing = members.find(m => m.user_id === userId && m.status === 'active');
    if (existing) throw new AppError('Already a member of this group.', 409);

    // Every member eventually receives a payout when it's their turn, so a
    // verified payment method (to contribute) and a verified payout
    // destination (to be paid out) are both required before joining.
    await assertPaymentSetupComplete(userId);

    // Check identity verification — joining is allowed but a warning is returned if unverified
    const userRows = await db.select({ identity_verified: schema.users.identity_verified })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    const identityVerified = userRows.length ? userRows[0].identity_verified : false;

    // If invite token provided, validate and mark used
    if (inviteToken) {
      const inv = await groupService.getInvitation(inviteToken);
      if (inv.group_id !== groupId) throw new AppError('Invalid invitation for this group.', 400);
      await db.update(schema.groupInvitations)
        .set({ accepted: true }).where(eq(schema.groupInvitations.token, inviteToken));
      await createAuditLog({ userId, action: 'INVITATION_ACCEPTED', entity: 'savings_groups', entityId: groupId, ipAddress });
    }

    const rotationOrder = activeCount + 1;
    await db.insert(schema.memberships).values({
      id: uuidv4(), user_id: userId, group_id: groupId,
      role: 'member', rotation_order: rotationOrder,
      status: 'active', strike_count: 0,
    });

    await createAuditLog({ userId, action: 'MEMBER_JOINED', entity: 'savings_groups', entityId: groupId, ipAddress });
    await notificationService.create({
      userId, type: 'joined_group',
      title: 'Joined Group',
      message: `You have successfully joined "${group.name}".`,
    });

    // Notify the group leader by email when a member accepts an invitation
    if (inviteToken) {
      const [memberRow, leaderRow] = await Promise.all([
        db.select({ first_name: schema.users.first_name, last_name: schema.users.last_name })
          .from(schema.users).where(eq(schema.users.id, userId)).limit(1),
        db.select({ email: schema.users.email, first_name: schema.users.first_name, last_name: schema.users.last_name })
          .from(schema.users).where(eq(schema.users.id, group.leader_id)).limit(1),
      ]);
      if (memberRow.length && leaderRow.length) {
        const memberName  = `${memberRow[0].first_name} ${memberRow[0].last_name}`;
        const leaderName  = `${leaderRow[0].first_name} ${leaderRow[0].last_name}`;
        await sendInvitationAcceptedEmail(leaderRow[0].email, group.name, memberName, leaderName);
      }
    }

    return { success: true, verification_warning: !identityVerified, message: !identityVerified ? 'Complete identity verification to increase your Trust Score and build group confidence.' : undefined };
  },

  async leave(userId: string, groupId: string, ipAddress?: string) {
    const group = await groupService.getById(groupId);
    if (group.leader_id === userId) throw new AppError('Group leader cannot leave. Close the group instead.', 400);

    await db.update(schema.memberships)
      .set({ status: 'removed' })
      .where(and(eq(schema.memberships.user_id, userId), eq(schema.memberships.group_id, groupId)));

    await createAuditLog({ userId, action: 'MEMBER_LEFT', entity: 'savings_groups', entityId: groupId, ipAddress });
    return true;
  },

  async remove(leaderId: string, memberId: string, groupId: string, ipAddress?: string) {
    const group = await groupService.getById(groupId);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can remove members.', 403);

    await db.update(schema.memberships)
      .set({ status: 'removed' })
      .where(and(eq(schema.memberships.user_id, memberId), eq(schema.memberships.group_id, groupId)));

    await createAuditLog({ userId: leaderId, action: 'MEMBER_REMOVED', entity: 'savings_groups', entityId: groupId, ipAddress, metadata: { memberId } });
    await notificationService.create({
      userId: memberId, type: 'removed_from_group',
      title: 'Removed from Group',
      message: `You have been removed from "${group.name}".`,
    });

    // Email the removed member, and notify every other active member — a
    // removal affects the whole rotation, not just the person removed.
    const userRow = await db.select({
      email: schema.users.email, first_name: schema.users.first_name, last_name: schema.users.last_name,
    }).from(schema.users).where(eq(schema.users.id, memberId)).limit(1);
    if (userRow.length) {
      await sendMemberRemovedEmail(userRow[0].email, group.name, 'Removed by group leader.');

      const removedName = `${userRow[0].first_name} ${userRow[0].last_name}`;
      const otherMembers = await db.select().from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
      for (const other of otherMembers) {
        if (other.user_id === memberId) continue;
        const otherUserRow = await db.select({ email: schema.users.email })
          .from(schema.users).where(eq(schema.users.id, other.user_id)).limit(1);
        if (otherUserRow.length) {
          await sendGroupMemberSuspendedNotificationEmail(otherUserRow[0].email, group.name, removedName);
        }
        await notificationService.create({
          userId: other.user_id, type: 'group_member_suspended',
          title: 'Group Membership Update',
          message: `${removedName} has been removed from "${group.name}" by the group leader.`,
        });
      }
    }
    return true;
  },

  /**
   * Increment a member's strike count and enforce suspension threshold.
   * Called by contributionService.markMissed after flagging a missed contribution.
   */
  async applyStrike(userId: string, groupId: string, ipAddress?: string) {
    const group = await groupService.getById(groupId);

    const memberRows = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.user_id, userId), eq(schema.memberships.group_id, groupId))).limit(1);
    if (!memberRows.length) return;
    const membership = memberRows[0];

    const newStrikeCount = membership.strike_count + 1;
    await db.update(schema.memberships)
      .set({ strike_count: newStrikeCount })
      .where(eq(schema.memberships.id, membership.id));

    await createAuditLog({
      userId, action: 'STRIKE_APPLIED', entity: 'memberships',
      entityId: membership.id, ipAddress,
      metadata: { newStrikeCount, groupId },
    });

    // Suspension threshold reached — suspend the member
    if (newStrikeCount >= group.suspension_threshold) {
      await db.update(schema.memberships)
        .set({ status: 'suspended' })
        .where(eq(schema.memberships.id, membership.id));

      await trustScoreService.decrease(userId, TRUST_SCORE_DELTA_MEMBER_SUSPENDED, 'MEMBER_SUSPENDED');
      await createAuditLog({
        userId, action: 'MEMBER_SUSPENDED', entity: 'memberships',
        entityId: membership.id, ipAddress,
        metadata: { groupId, reason: 'strike_threshold_reached' },
      });
      await notificationService.create({
        userId, type: 'membership_suspended',
        title: 'Membership Suspended',
        message: `Your membership in "${group.name}" has been suspended due to repeated missed contributions.`,
      });

      // Email the suspended member, and notify every other active member —
      // a suspension affects the whole rotation, not just the person removed.
      const suspendedUserRow = await db.select({
        email: schema.users.email, first_name: schema.users.first_name, last_name: schema.users.last_name,
      }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (suspendedUserRow.length) {
        await sendMemberRemovedEmail(
          suspendedUserRow[0].email, group.name,
          'Suspended after repeated missed contributions.',
        );

        const suspendedName = `${suspendedUserRow[0].first_name} ${suspendedUserRow[0].last_name}`;
        const otherMembers = await db.select().from(schema.memberships)
          .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
        for (const other of otherMembers) {
          if (other.user_id === userId) continue;
          const otherUserRow = await db.select({ email: schema.users.email })
            .from(schema.users).where(eq(schema.users.id, other.user_id)).limit(1);
          if (otherUserRow.length) {
            await sendGroupMemberSuspendedNotificationEmail(otherUserRow[0].email, group.name, suspendedName);
          }
          await notificationService.create({
            userId: other.user_id, type: 'group_member_suspended',
            title: 'Group Membership Update',
            message: `${suspendedName} has been suspended from "${group.name}" after repeated missed contributions.`,
          });
        }
      }

      return { action: 'suspended' as const, newStrikeCount };
    }

    // Strike warning threshold reached
    if (newStrikeCount >= group.strike_threshold) {
      await notificationService.create({
        userId, type: 'strike_warning',
        title: 'Strike Warning',
        message: `You have received ${newStrikeCount} strike(s) in "${group.name}". One more missed contribution may result in suspension.`,
      });
    }

    return { action: 'warned' as const, newStrikeCount };
  },
};
