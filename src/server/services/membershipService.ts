import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray, gt, ne, asc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { trustScoreService } from './trustScoreService.js';
import { groupService } from './groupService.js';
import { assertPaymentSetupComplete } from './paymentEligibilityService.js';
import { TRUST_SCORE_DELTA_MEMBER_SUSPENDED, SUBSCRIPTION_TIERS, isSubscriptionTierKey, countryDisplayName, resolveUserDisplayName, VOTE_REMOVED_ACCOUNT_DELETION_THRESHOLD } from '../lib/constants.js';
import { describeGroupDuration } from './groupService.js';
import {
  sendMemberRemovedEmail,
  sendMemberExitCompressionEmail,
  sendDefaultRetainedNotificationEmail,
  sendInvitationAcceptedEmail,
  sendGroupJoinRequestEmail,
  sendGroupJoinRequestSubmittedEmail,
  sendGroupJoinApprovedEmail,
  sendGroupJoinRejectedEmail,
  sendGroupNewMemberJoinedEmail,
  sendGroupClosedEmail,
  sendMemberJoinedGroupEmail,
} from '../integrations/email/emailService.js';

export const membershipService = {
  async getForGroup(groupId: string) {
    // Every member-list / rotation / voting screen needs a human-readable
    // name for each member (never a raw user ID) — see resolveUserDisplayName.
    const rows = await db.select({
      id:             schema.memberships.id,
      user_id:        schema.memberships.user_id,
      group_id:       schema.memberships.group_id,
      role:           schema.memberships.role,
      rotation_order: schema.memberships.rotation_order,
      join_date:      schema.memberships.join_date,
      status:         schema.memberships.status,
      strike_count:   schema.memberships.strike_count,
      default_count:  schema.memberships.default_count,
      created_at:     schema.memberships.created_at,
      updated_at:     schema.memberships.updated_at,
      display_name:   schema.users.display_name,
      first_name:     schema.users.first_name,
      last_name:      schema.users.last_name,
      email:          schema.users.email,
      // Section 6 — the group page's "Active Members" display card shows
      // each member's Trust Score alongside their name/join date.
      trust_score:    schema.users.trust_score,
    }).from(schema.memberships)
      .leftJoin(schema.users, eq(schema.memberships.user_id, schema.users.id))
      .where(eq(schema.memberships.group_id, groupId));

    return rows.map(({ display_name, first_name, last_name, email, ...membership }) => ({
      ...membership,
      user_name: resolveUserDisplayName({ display_name, first_name, last_name, email }),
    }));
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
    if (group.status === 'closed' || group.status === 'expired') {
      throw new AppError('This group is no longer accepting members.', 400);
    }

    // Check capacity (active members only — pending requests don't occupy a seat yet)
    const members = await this.getForGroup(groupId);
    const activeCount = members.filter(m => m.status === 'active').length;
    if (activeCount >= group.maximum_members) {
      throw new AppError(
        `This group is already at its maximum of ${group.maximum_members} members.`,
        400,
        'GROUP_FULL',
      );
    }

    // Check not already a member or already pending
    const existing = members.find(m => m.user_id === userId && (m.status === 'active' || m.status === 'pending'));
    if (existing) {
      throw new AppError(
        existing.status === 'pending' ? 'You already have a pending request to join this group.' : 'Already a member of this group.',
        409,
      );
    }

    const userRows = await db.select({
      country: schema.users.country,
      trust_score: schema.users.trust_score,
      subscription_tier: schema.users.subscription_tier,
      first_name: schema.users.first_name,
      last_name: schema.users.last_name,
      email: schema.users.email,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    // Groups are strictly single-country — a UK member can never join a
    // Nigeria-based group and vice versa — because contribution charging and
    // payouts run through a single payment provider per group (Stripe/GBP
    // for GB, Flutterwave/NGN for NG) and can't be split per-member.
    if (user.country !== group.country) {
      throw new AppError(
        `This group is based in ${countryDisplayName(group.country)} and only accepts members registered in ${countryDisplayName(group.country)}. Your account is registered in ${countryDisplayName(user.country)}.`,
        403,
        'GROUP_COUNTRY_MISMATCH',
      );
    }

    // Every member eventually contributes and receives a payout, so the full
    // onboarding gate (email + identity + subscription tier + payment method
    // + payout destination — all VERIFIED, not just started) applies before
    // joining any group. Only verified members may even request to join.
    await assertPaymentSetupComplete(userId);

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

    // Resolve whether this user was actually invited by the leader — either
    // via the token in the URL, or (fallback) a still-open invitation the
    // leader sent to this exact account email for this group. The fallback
    // matters because the emailed link's token can expire (7 days) while the
    // invitee is still working through onboarding (payment, subscription,
    // identity verification), or because they clicked "Join" straight from
    // the group page instead of the emailed link — in both cases the leader
    // already vetted them, so it must not be treated as a fresh self-request.
    let invitation: Awaited<ReturnType<typeof groupService.getInvitation>> | null = null;
    if (inviteToken) {
      try {
        const inv = await groupService.getInvitation(inviteToken);
        if (inv.group_id === groupId) invitation = inv;
      } catch {
        // Invalid/expired/used token — fall through to the email-match lookup below.
      }
    }
    if (!invitation) {
      invitation = await groupService.findOpenInvitationForEmail(groupId, user.email);
    }

    // Enforce the group's minimum Trust Score, set by its creator — but ONLY
    // for users requesting to join themselves (e.g. found the group via
    // search). A leader-issued invite means the leader already vetted this
    // specific person, so the entry barrier does not apply to invitees; it
    // would otherwise let a leader's own invited members get blocked by a
    // bar the leader never intended to apply to people they hand-picked.
    if (!invitation && group.min_trust_score > 0 && user.trust_score < group.min_trust_score) {
      throw new AppError(
        `This group requires a minimum Trust Score of ${group.min_trust_score}. Your current Trust Score is ${user.trust_score}.`,
        403,
        'TRUST_SCORE_TOO_LOW',
      );
    }

    // Invited (by token or by matching email) — leader already vetted this
    // person, so they join as an active member immediately, no approval step.
    if (invitation) {
      await db.update(schema.groupInvitations)
        .set({ accepted: true }).where(eq(schema.groupInvitations.token, invitation.token));
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

      const durationSummary = describeGroupDuration(group.group_duration_type, group.group_duration_rotations);
      await sendMemberJoinedGroupEmail(user.email, group.name, durationSummary);

      const leaderRow = await db.select({ email: schema.users.email, first_name: schema.users.first_name, last_name: schema.users.last_name })
        .from(schema.users).where(eq(schema.users.id, group.leader_id)).limit(1);
      if (leaderRow.length) {
        const memberName = `${user.first_name} ${user.last_name}`;
        const leaderName = `${leaderRow[0].first_name} ${leaderRow[0].last_name}`;
        await sendInvitationAcceptedEmail(leaderRow[0].email, group.name, memberName, leaderName);
      }

      // A refill (suspended → active, back to >= min members) is handled
      // here; draft groups only launch via the leader's explicit "Start
      // Group" action (groupService.activateGroup), never automatically.
      await groupService.reevaluateAfterMembershipChange(groupId);
      // Section D.2 — this member just became active in this group; if it's
      // their first active group, resume any deferred billing immediately.
      await groupService.reconcileMemberBilling([userId]);

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

    return this._activatePendingMembership(membershipId, ipAddress);
  },

  /**
   * Shared "admit this pending membership" logic used both by direct
   * leader approval (approveJoinRequest above) and by a unanimous
   * member_admission governance vote passing (voteService). Assigns the
   * next rotation slot — appending mid-cycle admissions to the end of the
   * payout sequence, per Section 4 — and notifies/emails everyone.
   */
  async _activatePendingMembership(membershipId: string, ipAddress?: string) {
    const membershipRows = await db.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)).limit(1);
    if (!membershipRows.length) throw new AppError('Membership not found.', 404);
    const membership = membershipRows[0];
    if (membership.status !== 'pending') return { success: true, rotation_order: membership.rotation_order ?? undefined };

    const group = await groupService.getById(membership.group_id);
    const activeMembers = (await this.getForGroup(group.id)).filter(m => m.status === 'active');
    if (activeMembers.length >= group.maximum_members) {
      throw new AppError(
        `This group is already at its maximum of ${group.maximum_members} members.`,
        400,
        'GROUP_FULL',
      );
    }

    const nextRotationOrder = activeMembers.length + 1;
    await db.update(schema.memberships)
      .set({ status: 'active', rotation_order: nextRotationOrder })
      .where(eq(schema.memberships.id, membershipId));

    await createAuditLog({ userId: membership.user_id, action: 'MEMBERSHIP_APPROVED', entity: 'savings_groups', entityId: group.id, ipAddress, metadata: { membershipId, memberId: membership.user_id } });

    const [newMemberRow, leaderRow, otherMembersEmails] = await Promise.all([
      db.select({ email: schema.users.email, first_name: schema.users.first_name, last_name: schema.users.last_name })
        .from(schema.users).where(eq(schema.users.id, membership.user_id)).limit(1),
      db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, group.leader_id)).limit(1),
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
    await sendGroupJoinApprovedEmail(
      newMemberRow[0].email, group.name,
      describeGroupDuration(group.group_duration_type, group.group_duration_rotations),
    );

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

    await groupService.reevaluateAfterMembershipChange(group.id);
    // Section D.2 — this member just became active in this group; if it's
    // their first active group, resume any deferred billing immediately.
    await groupService.reconcileMemberBilling([membership.user_id]);

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

    return this._invalidatePendingMembership(membershipId, ipAddress, leaderId);
  },

  /**
   * Shared "invalidate this pending membership" logic used by direct
   * leader rejection (rejectJoinRequest above) and by a member_admission
   * governance vote closing as rejected/expired (a single "no" or a 48h
   * timeout both invalidate the invite, per Section 4).
   */
  async _invalidatePendingMembership(membershipId: string, ipAddress?: string, actorId?: string) {
    const membershipRows = await db.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)).limit(1);
    if (!membershipRows.length) throw new AppError('Membership not found.', 404);
    const membership = membershipRows[0];
    if (membership.status !== 'pending') return { success: true };

    const group = await groupService.getById(membership.group_id);

    // No 'rejected' enum value exists on memberships.status (adding one would
    // require a schema migration/db:push before it's safe to write) — reuse
    // 'removed', which already means "not part of this group".
    await db.update(schema.memberships).set({ status: 'removed' }).where(eq(schema.memberships.id, membershipId));

    await createAuditLog({ userId: actorId ?? membership.user_id, action: 'MEMBERSHIP_REJECTED', entity: 'savings_groups', entityId: group.id, ipAddress, metadata: { membershipId, memberId: membership.user_id } });

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

  /**
   * Group leader kicks off unanimous member-admission governance voting
   * (Section 4) for an existing pending join request, instead of deciding
   * unilaterally. Every existing active member (including the leader, who
   * is auto-approved as the proposer) must accept within 48 hours via
   * emailed accept/decline links; a single decline or a timeout invalidates
   * the invite (voteService handles closing/expiry and calls back into
   * _activatePendingMembership / _invalidatePendingMembership above).
   */
  async initiateAdmissionVote(leaderId: string, membershipId: string, ipAddress?: string) {
    const membershipRows = await db.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)).limit(1);
    if (!membershipRows.length) throw new AppError('Join request not found.', 404);
    const membership = membershipRows[0];
    if (membership.status !== 'pending') throw new AppError('This join request has already been decided.', 400);

    const group = await groupService.getById(membership.group_id);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can start an admission vote.', 403);

    const { voteService } = await import('./voteService.js');
    const voteId = await voteService.proposeMemberAdmission(group.id, leaderId, membershipId, ipAddress);
    return { success: true, vote_id: voteId };
  },

  async leave(userId: string, groupId: string, ipAddress?: string) {
    const group = await groupService.getById(groupId);
    if (group.leader_id === userId) {
      return this.departGroupOwner(userId, groupId, 'voluntary', ipAddress);
    }

    return this.departMember(userId, groupId, 'voluntary', ipAddress);
  },

  async remove(leaderId: string, memberId: string, groupId: string, ipAddress?: string) {
    const group = await groupService.getById(groupId);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can remove members.', 403);

    return this.departMember(memberId, groupId, 'removed_by_leader', ipAddress);
  },

  /**
   * Section 15.D — executes a PASSED member-removal vote (voteService owns
   * proposing/tallying the vote itself). Removes the target via the
   * standard Compensated Compression path; if the target was the group's
   * Owner, routes through departGroupOwner instead so tenure-based
   * succession (Section 15.B) also applies.
   */
  async removeMemberByVote(groupId: string, targetUserId: string, ipAddress?: string) {
    const group = await groupService.getById(groupId);
    if (group.leader_id === targetUserId) {
      return this.departGroupOwner(targetUserId, groupId, 'vote_removed', ipAddress);
    }
    return this.departMember(targetUserId, groupId, 'vote_removed', ipAddress);
  },

  /**
   * Section 15.B — Owner departure (voluntary exit, default-suspension, or
   * account deletion). If the group never reached the 3-member launch
   * threshold (still Draft), there's no compression to do — nothing was
   * ever collected, so the draft is simply cancelled and anyone who'd
   * already joined is notified. Otherwise the Owner departs exactly like
   * any other member via the standard Compensated Compression path
   * (departMember), and the Organiser/Owner role transfers to whichever
   * remaining active member has been in the group the LONGEST (earliest
   * join_date — tenure, distinct from Trust Score). Tenure-based succession
   * is never gated by subscription tier, and the inherited group counts
   * toward the new Owner's JOINED total only — never their created total,
   * and it grants no extra group-creation allowance.
   */
  async departGroupOwner(
    userId: string, groupId: string,
    reason: 'voluntary' | 'removed_by_leader' | 'defaulted' | 'vote_removed' | 'subscription_payment_failed',
    ipAddress?: string,
  ) {
    const group = await groupService.getById(groupId);
    if (group.leader_id !== userId) {
      // Ownership already changed hands (or never applied) — a normal departure suffices.
      return this.departMember(userId, groupId, reason, ipAddress);
    }

    if (group.status === 'draft') {
      await db.update(schema.savingsGroups).set({ status: 'closed' }).where(eq(schema.savingsGroups.id, groupId));

      const joinedMembers = await db.select({ user_id: schema.memberships.user_id })
        .from(schema.memberships)
        .where(and(
          eq(schema.memberships.group_id, groupId),
          eq(schema.memberships.status, 'active'),
          ne(schema.memberships.user_id, userId),
        ));
      if (joinedMembers.length) {
        const emailRows = await db.select({ email: schema.users.email })
          .from(schema.users)
          .where(inArray(schema.users.id, joinedMembers.map(member => member.user_id)));
        for (const row of emailRows) {
          await sendGroupClosedEmail(row.email, group.name);
        }
      }

      await createAuditLog({
        userId, action: 'GROUP_DRAFT_CANCELLED_OWNER_DEPARTED', entity: 'savings_groups',
        entityId: groupId, ipAddress, metadata: { reason },
      });
      return true;
    }

    // Longest-tenured remaining active member (earliest join_date) inherits
    // Owner status — tenure, not Trust Score.
    const successorRows = await db.select().from(schema.memberships)
      .where(and(
        eq(schema.memberships.group_id, groupId),
        eq(schema.memberships.status, 'active'),
        ne(schema.memberships.user_id, userId),
      ))
      .orderBy(asc(schema.memberships.join_date))
      .limit(1);
    const successor = successorRows[0];

    let newOwnerName: string | undefined;
    if (successor) {
      await db.update(schema.savingsGroups).set({ leader_id: successor.user_id }).where(eq(schema.savingsGroups.id, groupId));
      await db.update(schema.memberships).set({ role: 'leader' }).where(eq(schema.memberships.id, successor.id));

      const successorUserRows = await db.select({ first_name: schema.users.first_name, last_name: schema.users.last_name })
        .from(schema.users).where(eq(schema.users.id, successor.user_id)).limit(1);
      if (successorUserRows.length) {
        newOwnerName = `${successorUserRows[0].first_name} ${successorUserRows[0].last_name}`.trim();
      }

      await createAuditLog({
        userId: successor.user_id, action: 'GROUP_OWNER_SUCCEEDED', entity: 'savings_groups',
        entityId: groupId, ipAddress, metadata: { previousOwnerId: userId, reason },
      });
    } else {
      // No other active member to inherit Owner status — nobody's left to
      // run the group, so close it (mirrors the pre-existing behaviour for
      // a solo-led group being deleted/departed).
      await db.update(schema.savingsGroups).set({ status: 'closed' }).where(eq(schema.savingsGroups.id, groupId));
    }

    return this.departMember(userId, groupId, reason, ipAddress, newOwnerName ? { newOwnerName } : undefined);
  },

  /**
   * "Compensated Compression" (Section 5) — the single shared path for
   * EVERY member departure, whatever the reason (voluntary leave,
   * leader-initiated removal, default-triggered suspension via
   * flagDefault below, or a passed removal vote — see voteService). Removes
   * the member, deletes their own still-pending ("final") rotation slot
   * from the group's timeline if one exists, keeps every remaining member's
   * contribution amount unchanged, and moves everyone who was behind the
   * departed member up one payout slot — so the future payout pool shrinks
   * by exactly the departed member's share and nobody's position skips or
   * collides.
   */
  async departMember(
    userId: string, groupId: string,
    reason: 'voluntary' | 'removed_by_leader' | 'defaulted' | 'vote_removed' | 'subscription_payment_failed',
    ipAddress?: string,
    succession?: { newOwnerName: string },
  ) {
    const group = await groupService.getById(groupId);

    const memberRows = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.user_id, userId), eq(schema.memberships.group_id, groupId))).limit(1);
    if (!memberRows.length) throw new AppError('Membership not found.', 404);
    const membership = memberRows[0];
    if (membership.status !== 'active') return true; // already departed — idempotent

    const departedOrder = membership.rotation_order;
    // 'defaulted' keeps the existing distinct 'suspended' status (as the
    // strike-threshold flow already did) so history shows *why* someone
    // left; voluntary leaves, leader removals and vote removals use 'removed'.
    const newStatus = reason === 'defaulted' ? 'suspended' : 'removed';

    await db.update(schema.memberships).set({ status: newStatus }).where(eq(schema.memberships.id, membership.id));

    if (departedOrder != null) {
      // Shift everyone behind the departed slot up by one.
      const behind = await db.select().from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active'), gt(schema.memberships.rotation_order, departedOrder)));
      for (const m of behind) {
        await db.update(schema.memberships).set({ rotation_order: (m.rotation_order ?? 1) - 1 }).where(eq(schema.memberships.id, m.id));
      }

      // Delete the final (now-unneeded) period from the group's timeline —
      // any rotation not yet paid out that was scheduled to pay the
      // departed member their turn.
      await db.delete(schema.rotations).where(and(
        eq(schema.rotations.group_id, groupId),
        eq(schema.rotations.recipient_id, userId),
        eq(schema.rotations.payout_status, 'pending'),
      ));

      // Keep the "next recipient" pointer correct after the shift.
      if (group.current_rotation_position > departedOrder) {
        await db.update(schema.savingsGroups)
          .set({ current_rotation_position: group.current_rotation_position - 1 })
          .where(eq(schema.savingsGroups.id, groupId));
      }
    }

    await createAuditLog({
      userId, action: 'MEMBER_DEPARTED_COMPENSATED_COMPRESSION', entity: 'memberships',
      entityId: membership.id, ipAddress, metadata: { groupId, reason, departedOrder },
    });

    // Voluntary departures carry no penalty — leaving a group by choice
    // isn't a trustworthiness signal. Involuntary paths (kicked out by the
    // leader, suspended after breaching the group's default threshold, or
    // removed by a unanimous member vote) recalculate the member's Trust
    // Score downward, per the Trust Score scale (constants.ts). Contribution
    // defaults are already separately penalised per-attempt in
    // contributionService.markFailed (TRUST_SCORE_DELTA_CONTRIBUTION_MISSED)
    // before this suspension-level step runs — this is the additional
    // "removed from the group" penalty.
    if (reason === 'defaulted' || reason === 'removed_by_leader' || reason === 'vote_removed') {
      await trustScoreService.decrease(userId, TRUST_SCORE_DELTA_MEMBER_SUSPENDED, 'MEMBER_SUSPENDED');
    }

    // Section 4 — a member voted out of a group for the 3rd time has their
    // profile deleted outright (distinct from the ordinary per-kick Trust
    // Score penalty above). Uses a dedicated counter rather than re-deriving
    // from audit logs on every kick, for speed; the boot-time self-heal in
    // subscriptionService.ts recomputes it from history for existing accounts.
    let votedOutThreeTimes = false;
    if (reason === 'vote_removed') {
      await db.update(schema.users)
        .set({ vote_removed_count: sql`${schema.users.vote_removed_count} + 1` })
        .where(eq(schema.users.id, userId));
      const countRows = await db.select({ vote_removed_count: schema.users.vote_removed_count })
        .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      votedOutThreeTimes = (countRows[0]?.vote_removed_count ?? 0) >= VOTE_REMOVED_ACCOUNT_DELETION_THRESHOLD;
    }

    const departedUserRow = await db.select({
      email: schema.users.email, first_name: schema.users.first_name, last_name: schema.users.last_name,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    const departedReasonText = reason === 'voluntary'
      ? 'You left the group.'
      : reason === 'removed_by_leader'
        ? 'Removed by group leader.'
        : reason === 'vote_removed'
          ? 'Removed by a unanimous group member vote.'
          : reason === 'subscription_payment_failed'
            ? 'Your subscription payment could not be processed even after a retry, so you have been removed from the group.'
            : 'Suspended after repeated contribution defaults.';

    await notificationService.create({
      userId, type: reason === 'defaulted' ? 'membership_suspended' : 'removed_from_group',
      title: reason === 'defaulted' ? 'Membership Suspended' : 'Removed from Group',
      message: reason === 'voluntary'
        ? `You have left "${group.name}".`
        : `You have been ${reason === 'defaulted' ? 'suspended from' : 'removed from'} "${group.name}". ${departedReasonText}`,
    });

    if (departedUserRow.length) {
      await sendMemberRemovedEmail(departedUserRow[0].email, group.name, departedReasonText);
    }

    // Every remaining member's payout timing and pool size just changed —
    // disclose both explicitly (Section 8's "member-exit notice"), folding
    // in the new-Owner announcement here too when ownership just changed
    // hands, rather than sending a second, separate email.
    const departedName = departedUserRow.length
      ? `${departedUserRow[0].first_name} ${departedUserRow[0].last_name}` : 'A member';
    const otherMembers = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    const otherUserEmailsById = new Map(
      otherMembers.length
        ? (await db.select({ id: schema.users.id, email: schema.users.email })
            .from(schema.users).where(inArray(schema.users.id, otherMembers.map(m => m.user_id))))
            .map(row => [row.id, row.email] as const)
        : [],
    );
    for (const other of otherMembers) {
      const otherEmail = otherUserEmailsById.get(other.user_id);
      if (otherEmail) {
        await sendMemberExitCompressionEmail(otherEmail, group.name, departedName, reason, succession?.newOwnerName);
      }
      await notificationService.create({
        userId: other.user_id, type: 'group_member_suspended',
        title: 'Payout Schedule Updated',
        message: succession?.newOwnerName
          ? `${departedName} has left "${group.name}". ${succession.newOwnerName} is now the group's Organiser/Owner. The remaining payout pool and schedule have been recalculated — check the group page for your updated position.`
          : `${departedName} has left "${group.name}". The remaining payout pool and schedule have been recalculated — check the group page for your updated position.`,
      });
    }

    await groupService.reevaluateAfterMembershipChange(groupId);
    // Section D.2 — the departed member's own active-group-membership count
    // may have just hit zero (if this was their only active group); pause
    // their billing immediately rather than waiting for the nightly sweep.
    await groupService.reconcileMemberBilling([userId]);

    // Section 4 — do this LAST, after the group has been notified of the
    // departure above: deleting the account also departs every OTHER active
    // group this member belongs to (see userService._performAccountDeletion),
    // which must not short-circuit the notifications this group's remaining
    // members are owed for this specific vote-removal.
    if (votedOutThreeTimes) {
      const { userService } = await import('./userService.js');
      await userService.systemDeleteAccount(userId, 'voted_out_three_times');
    }
    return true;
  },

  /**
   * A contribution's single 72h-grace + single-retry both failed (Section
   * 6) — increment the member's default count and compare it against the
   * group's max-permitted-defaults setting (savingsGroups.suspension_threshold,
   * reused). Below the threshold: the member is retained, this cycle's
   * payout amount for other recipients is unaffected (the pot is simply
   * short by the defaulted amount), and recovering that specific shortfall
   * is explicitly the group's own responsibility, not the platform's —
   * every member is told this plainly. At/above the threshold: the member
   * is removed via the same Compensated Compression path as any other
   * departure (departMember above), which itself recalculates the
   * schedule/amount and discloses that change to the group.
   */
  async flagDefault(userId: string, groupId: string, contributionId: string, ipAddress?: string) {
    const group = await groupService.getById(groupId);
    const memberRows = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.user_id, userId), eq(schema.memberships.group_id, groupId))).limit(1);
    if (!memberRows.length) return null;
    const membership = memberRows[0];

    const newDefaultCount = membership.default_count + 1;
    await db.update(schema.memberships).set({ default_count: newDefaultCount }).where(eq(schema.memberships.id, membership.id));
    await createAuditLog({
      userId, action: 'CONTRIBUTION_DEFAULT_FLAGGED', entity: 'memberships',
      entityId: membership.id, ipAddress, metadata: { groupId, contributionId, newDefaultCount, maxPermittedDefaults: group.suspension_threshold },
    });

    if (newDefaultCount >= group.suspension_threshold) {
      await this.departGroupOwner(userId, groupId, 'defaulted', ipAddress);
      return { action: 'compressed' as const, newDefaultCount };
    }

    // Retained — tell everyone (including the defaulting member) the
    // payout amount/schedule is unchanged for now, and that recovering the
    // specific missed amount from the defaulting member is the group's/
    // owner's own responsibility to pursue, not the platform's.
    const contributionRows = await db.select({ amount_due: schema.contributions.amount_due, cycle_number: schema.contributions.cycle_number })
      .from(schema.contributions).where(eq(schema.contributions.id, contributionId)).limit(1);
    const contribution = contributionRows[0];

    const activeMembers = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    const memberUserRow = await db.select({ first_name: schema.users.first_name, last_name: schema.users.last_name })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    const defaultingName = memberUserRow.length ? `${memberUserRow[0].first_name} ${memberUserRow[0].last_name}` : 'A member';

    const emailsById = new Map(
      activeMembers.length
        ? (await db.select({ id: schema.users.id, email: schema.users.email })
            .from(schema.users).where(inArray(schema.users.id, activeMembers.map(m => m.user_id))))
            .map(row => [row.id, row.email] as const)
        : [],
    );
    for (const m of activeMembers) {
      const email = emailsById.get(m.user_id);
      if (email) {
        await sendDefaultRetainedNotificationEmail(
          email, group.name, defaultingName, contribution?.amount_due ?? '0.00', group.currency,
          newDefaultCount, group.suspension_threshold,
        );
      }
      await notificationService.create({
        userId: m.user_id, type: 'contribution_default_retained',
        title: 'Contribution Default',
        message: `${defaultingName} defaulted on their contribution for cycle ${contribution?.cycle_number ?? '?'}. They remain in the group and the payout schedule/amount is unchanged for now. Recovering the missed amount is the group's own responsibility.`,
      });
    }

    return { action: 'retained' as const, newDefaultCount };
  },

  /**
   * Increment a member's strike count and enforce suspension threshold.
   * Called by contributionService.markMissed for contributions that reach
   * their due date without any charge attempt ever completing (e.g. no
   * payment method on file) — a distinct, rarer path from the
   * charge-attempted 72h-grace/single-retry default flow (see flagDefault
   * above), but suspension from either path goes through the same
   * Compensated Compression (departMember).
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

    // Suspension threshold reached — depart via Compensated Compression
    if (newStrikeCount >= group.suspension_threshold) {
      await this.departGroupOwner(userId, groupId, 'defaulted', ipAddress);
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

  /**
   * Section 4 retroactive self-heal, run once at boot (see entry.ts). The
   * per-kick `vote_removed_count` counter was only added in this change, so
   * accounts already voted out 3+ times under the old code have no counter
   * value reflecting their real history. Rebuilds the count from the audit
   * trail (`MEMBER_DEPARTED_COMPENSATED_COMPRESSION` entries with
   * `metadata.reason === 'vote_removed'`) — the only durable record of why
   * a member departed, since `memberships.status` itself doesn't retain a
   * reason. Idempotent: always SETs (never increments) the counter to the
   * true historical total, so re-running on every boot converges to the
   * same value and never double-counts.
   */
  async reconcileVoteRemovedAccountsRetroactively(): Promise<void> {
    try {
      const rows = await db.select({
        user_id: schema.auditLogs.user_id,
        metadata: schema.auditLogs.metadata,
      }).from(schema.auditLogs).where(eq(schema.auditLogs.action, 'MEMBER_DEPARTED_COMPENSATED_COMPRESSION'));

      const voteRemovedCounts = new Map<string, number>();
      for (const row of rows) {
        if (!row.user_id) continue;
        const metadata = row.metadata as { reason?: string } | null;
        if (metadata?.reason !== 'vote_removed') continue;
        voteRemovedCounts.set(row.user_id, (voteRemovedCounts.get(row.user_id) ?? 0) + 1);
      }
      if (!voteRemovedCounts.size) return;

      for (const [userId, actualCount] of voteRemovedCounts) {
        const userRows = await db.select({
          vote_removed_count: schema.users.vote_removed_count,
          account_status: schema.users.account_status,
        }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        if (!userRows.length) continue;
        const user = userRows[0];

        if (user.vote_removed_count !== actualCount) {
          await db.update(schema.users).set({ vote_removed_count: actualCount }).where(eq(schema.users.id, userId));
        }

        if (actualCount >= VOTE_REMOVED_ACCOUNT_DELETION_THRESHOLD && user.account_status !== 'deactivated') {
          console.log(`[PadiHub] Retroactive vote-kick migration: deleting account ${userId} (voted out ${actualCount} times).`);
          const { userService } = await import('./userService.js');
          await userService.systemDeleteAccount(userId, 'voted_out_three_times');
        }
      }
    } catch (err) {
      console.error('[PadiHub] Retroactive vote-kick migration failed:', err instanceof Error ? err.message : err);
    }
  },
};
