import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { trustScoreService } from './trustScoreService.js';
import { groupService } from './groupService.js';
import { assertPaymentSetupComplete } from './paymentEligibilityService.js';
import { TRUST_SCORE_DELTA_MEMBER_SUSPENDED, SUBSCRIPTION_TIERS, isSubscriptionTierKey } from '../lib/constants.js';
import {
  sendMemberRemovedEmail,
  sendGroupMemberSuspendedNotificationEmail,
  sendInvitationAcceptedEmail,
  sendGroupJoinRequestEmail,
  sendGroupJoinRequestSubmittedEmail,
  sendGroupJoinApprovedEmail,
  sendGroupJoinRejectedEmail,
  sendGroupNewMemberJoinedEmail,
} from '../integrations/email/emailService.js';

export const membershipService = {
  async getForGroup(groupId: string) {
    return db.select().from(schema.memberships).where(eq(schema.memberships.group_id, groupId));
  },

  async getForUser(userId: string) {
    return db.select().from(schema.memberships).where(eq(schema.memberships.user_id, userId));
  },

  /**
   * Join a group. Two paths:
   *  - Invite-token join: the leader already vetted this person by inviting
   *    them directly, so they become active immediately (existing behaviour).
   *  - Self-service "request to join" (e.g. found via group search): inserted
   *    as `status: 'pending'` and requires the group leader's approval — see
   *    approveJoinRequest/rejectJoinRequest below.
   */
  async join(userId: string, groupId: string, inviteToken?: string, ipAddress?: string) {
    const group = await groupService.getById(groupId);
    if (group.status !== 'active') throw new AppError('Group is not active.', 400);

    // Check capacity (active members only — pending requests don't occupy a seat yet)
    const members = await this.getForGroup(groupId);
    const activeCount = members.filter(m => m.status === 'active').length;
    if (activeCount >= group.maximum_members) throw new AppError('Group is full.', 400, 'GROUP_FULL');

    // Check not already a member or already pending
    const existing = members.find(m => m.user_id === userId && (m.status === 'active' || m.status === 'pending'));
    if (existing) {
      throw new AppError(
        existing.status === 'pending' ? 'You already have a pending request to join this group.' : 'Already a member of this group.',
        409,
      );
    }

    // Every member eventually contributes and receives a payout, so the full
    // onboarding gate (email + identity + subscription tier + payment method
    // + payout destination — all VERIFIED, not just started) applies before
    // joining any group. Only verified members may even request to join.
    await assertPaymentSetupComplete(userId);

    const userRows = await db.select({
      trust_score: schema.users.trust_score,
      subscription_tier: schema.users.subscription_tier,
      first_name: schema.users.first_name,
      last_name: schema.users.last_name,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    // Enforce the member's subscription-tier group-join limit (counts both
    // active memberships and outstanding pending requests).
    const tier = user.subscription_tier;
    if (!isSubscriptionTierKey(tier)) {
      throw new AppError('Select a subscription plan before joining a group.', 403, 'SUBSCRIPTION_TIER_NOT_SELECTED');
    }
    const groupsJoined = await groupService.countGroupsJoined(userId);
    if (groupsJoined >= SUBSCRIPTION_TIERS[tier].maxGroupsJoin) {
      throw new AppError(
        `You've reached your ${SUBSCRIPTION_TIERS[tier].name} plan's limit of ${SUBSCRIPTION_TIERS[tier].maxGroupsJoin} groups`
          + (tier === 'basic' ? ' — upgrade to Premium to join more.' : '.'),
        403,
        'GROUP_JOIN_LIMIT_REACHED',
      );
    }

    // Enforce the group's minimum Trust Score, set by its creator
    if (group.min_trust_score > 0 && user.trust_score < group.min_trust_score) {
      throw new AppError(
        `This group requires a minimum Trust Score of ${group.min_trust_score}. Your current Trust Score is ${user.trust_score}.`,
        403,
        'TRUST_SCORE_TOO_LOW',
      );
    }

    // If invite token provided, validate and mark used — leader already
    // vetted this person, so they join as an active member immediately.
    if (inviteToken) {
      const inv = await groupService.getInvitation(inviteToken);
      if (inv.group_id !== groupId) throw new AppError('Invalid invitation for this group.', 400);
      await db.update(schema.groupInvitations)
        .set({ accepted: true }).where(eq(schema.groupInvitations.token, inviteToken));
      await createAuditLog({ userId, action: 'INVITATION_ACCEPTED', entity: 'savings_groups', entityId: groupId, ipAddress });

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

      const leaderRow = await db.select({ email: schema.users.email, first_name: schema.users.first_name, last_name: schema.users.last_name })
        .from(schema.users).where(eq(schema.users.id, group.leader_id)).limit(1);
      if (leaderRow.length) {
        const memberName = `${user.first_name} ${user.last_name}`;
        const leaderName = `${leaderRow[0].first_name} ${leaderRow[0].last_name}`;
        await sendInvitationAcceptedEmail(leaderRow[0].email, group.name, memberName, leaderName);
      }

      return { success: true, status: 'active' as const, message: 'You have joined the group.' };
    }

    // Self-service request-to-join — requires leader approval.
    const membershipId = uuidv4();
    await db.insert(schema.memberships).values({
      id: membershipId, user_id: userId, group_id: groupId,
      role: 'member', rotation_order: null,
      status: 'pending', strike_count: 0,
    });

    await createAuditLog({ userId, action: 'MEMBERSHIP_REQUESTED', entity: 'savings_groups', entityId: groupId, ipAddress, metadata: { membershipId } });
    await notificationService.create({
      userId, type: 'join_request_submitted',
      title: 'Join Request Submitted',
      message: `Your request to join "${group.name}" has been sent to the group leader.`,
    });

    const [requesterEmailRow, leaderRow] = await Promise.all([
      db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1),
      db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, group.leader_id)).limit(1),
    ]);
    if (requesterEmailRow.length) {
      await sendGroupJoinRequestSubmittedEmail(requesterEmailRow[0].email, group.name);
    }
    if (leaderRow.length) {
      await notificationService.create({
        userId: leaderRow[0].id, type: 'join_request_received',
        title: 'New Group Join Request',
        message: `${user.first_name} ${user.last_name} has requested to join "${group.name}". Review it from your dashboard.`,
      });
      await sendGroupJoinRequestEmail(leaderRow[0].email, group.name, `${user.first_name} ${user.last_name}`, user.trust_score);
    }

    return { success: true, status: 'pending' as const, message: 'Your request to join has been submitted and is awaiting the group leader\'s approval.' };
  },

  /**
   * Group leader approves a pending join request. Assigns the new member the
   * next rotation slot (amending the payout schedule) and emails the new
   * member, the leader, and every other existing active member.
   */
  async approveJoinRequest(leaderId: string, membershipId: string, ipAddress?: string) {
    const membershipRows = await db.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)).limit(1);
    if (!membershipRows.length) throw new AppError('Join request not found.', 404);
    const membership = membershipRows[0];
    if (membership.status !== 'pending') throw new AppError('This join request has already been decided.', 400);

    const group = await groupService.getById(membership.group_id);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can approve join requests.', 403);

    const activeMembers = (await this.getForGroup(group.id)).filter(m => m.status === 'active');
    if (activeMembers.length >= group.maximum_members) throw new AppError('Group is full.', 400, 'GROUP_FULL');

    const nextRotationOrder = activeMembers.length + 1;
    await db.update(schema.memberships)
      .set({ status: 'active', rotation_order: nextRotationOrder })
      .where(eq(schema.memberships.id, membershipId));

    await createAuditLog({ userId: leaderId, action: 'MEMBERSHIP_APPROVED', entity: 'savings_groups', entityId: group.id, ipAddress, metadata: { membershipId, memberId: membership.user_id } });

    const [newMemberRow, leaderRow, otherMembersEmails] = await Promise.all([
      db.select({ email: schema.users.email, first_name: schema.users.first_name, last_name: schema.users.last_name })
        .from(schema.users).where(eq(schema.users.id, membership.user_id)).limit(1),
      db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, leaderId)).limit(1),
      activeMembers.length
        ? db.select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users).where(inArray(schema.users.id, activeMembers.map(m => m.user_id)))
        : Promise.resolve([] as Array<{ id: string; email: string }>),
    ]);

    if (!newMemberRow.length) throw new AppError('User not found.', 404);
    const newMemberName = `${newMemberRow[0].first_name} ${newMemberRow[0].last_name}`;

    await notificationService.create({
      userId: membership.user_id, type: 'join_request_approved',
      title: 'Join Request Approved',
      message: `Your request to join "${group.name}" has been approved.`,
    });
    await sendGroupJoinApprovedEmail(newMemberRow[0].email, group.name);

    if (leaderRow.length) {
      await sendGroupNewMemberJoinedEmail(leaderRow[0].email, group.name, newMemberName);
    }
    for (const other of otherMembersEmails) {
      if (other.id === membership.user_id) continue;
      await sendGroupNewMemberJoinedEmail(other.email, group.name, newMemberName);
      await notificationService.create({
        userId: other.id, type: 'group_new_member',
        title: 'New Group Member',
        message: `${newMemberName} has joined "${group.name}". The payout schedule has been updated.`,
      });
    }

    return { success: true, rotation_order: nextRotationOrder };
  },

  /** Group leader rejects a pending join request. */
  async rejectJoinRequest(leaderId: string, membershipId: string, ipAddress?: string) {
    const membershipRows = await db.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)).limit(1);
    if (!membershipRows.length) throw new AppError('Join request not found.', 404);
    const membership = membershipRows[0];
    if (membership.status !== 'pending') throw new AppError('This join request has already been decided.', 400);

    const group = await groupService.getById(membership.group_id);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can reject join requests.', 403);

    // No 'rejected' enum value exists on memberships.status (adding one would
    // require a schema migration/db:push before it's safe to write) — reuse
    // 'removed', which already means "not part of this group".
    await db.update(schema.memberships).set({ status: 'removed' }).where(eq(schema.memberships.id, membershipId));

    await createAuditLog({ userId: leaderId, action: 'MEMBERSHIP_REJECTED', entity: 'savings_groups', entityId: group.id, ipAddress, metadata: { membershipId, memberId: membership.user_id } });

    const requesterRow = await db.select({ email: schema.users.email })
      .from(schema.users).where(eq(schema.users.id, membership.user_id)).limit(1);
    if (requesterRow.length) {
      await sendGroupJoinRejectedEmail(requesterRow[0].email, group.name);
    }
    await notificationService.create({
      userId: membership.user_id, type: 'join_request_rejected',
      title: 'Join Request Not Approved',
      message: `Your request to join "${group.name}" was not approved.`,
    });

    return { success: true };
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
      const otherMemberIds = otherMembers.map(other => other.user_id).filter(id => id !== memberId);
      const otherUserEmailsById = new Map(
        otherMemberIds.length
          ? (await db.select({ id: schema.users.id, email: schema.users.email })
              .from(schema.users).where(inArray(schema.users.id, otherMemberIds)))
              .map(row => [row.id, row.email] as const)
          : [],
      );
      for (const other of otherMembers) {
        if (other.user_id === memberId) continue;
        const otherEmail = otherUserEmailsById.get(other.user_id);
        if (otherEmail) {
          await sendGroupMemberSuspendedNotificationEmail(otherEmail, group.name, removedName);
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
        const otherMemberIds = otherMembers.map(other => other.user_id).filter(id => id !== userId);
        const otherUserEmailsById = new Map(
          otherMemberIds.length
            ? (await db.select({ id: schema.users.id, email: schema.users.email })
                .from(schema.users).where(inArray(schema.users.id, otherMemberIds)))
                .map(row => [row.id, row.email] as const)
            : [],
        );
        for (const other of otherMembers) {
          if (other.user_id === userId) continue;
          const otherEmail = otherUserEmailsById.get(other.user_id);
          if (otherEmail) {
            await sendGroupMemberSuspendedNotificationEmail(otherEmail, group.name, suspendedName);
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
