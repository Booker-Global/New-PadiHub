import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { BCRYPT_ROUNDS, TRUST_SCORE_MAX, TRUST_SCORE_MIN, SUBSCRIPTION_TIERS, isSubscriptionTierKey, resolveSubscriptionStatusDisplay } from '../lib/constants.js';
import { getPaymentProvider } from '../integrations/payments/PaymentProviderFactory.js';
import { hashEmail } from '../lib/emailBlocklist.js';
import { sendAccountDeletedEmail, type AccountDeletionReason } from '../integrations/email/emailService.js';
import { membershipService } from './membershipService.js';

function getDeletedEmail(userId: string): string {
  return `deleted-${userId}@padihub.invalid`;
}

function getDeletedDisplayName(user: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return user.display_name?.trim()
    || `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
    || 'PadiHub member';
}

function isForeignKeyReferenceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const mysqlError = error as Error & { code?: string; errno?: number };
  return mysqlError.code === 'ER_ROW_IS_REFERENCED_2'
    || mysqlError.errno === 1451
    || /foreign key constraint fails/i.test(mysqlError.message);
}

async function countRows(query: Promise<Array<{ value: number | bigint }>>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.value ?? 0);
}

export const userService = {
  async getProfile(userId: string) {
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length) throw new AppError('User not found.', 404);
    const safe = { ...rows[0] };
    delete (safe as { password_hash?: string }).password_hash;

    // Non-technical status label (Section 7 / item 1) — a deferred-billing
    // ("Pending Charge") member has subscription_status='active' in the DB
    // just like a fully-active one, so the raw column alone would mislead
    // the dashboard. Resolve against the subscription's billing_status too.
    const subRows = await db.select({ billing_status: schema.subscriptions.billing_status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, userId))
      .orderBy(desc(schema.subscriptions.created_at))
      .limit(1);
    const subscription_status_display = resolveSubscriptionStatusDisplay({
      subscription_status: safe.subscription_status,
      billing_status: subRows[0]?.billing_status ?? null,
    });

    return { ...safe, subscription_status_display };
  },

  /**
   * Real, per-user Trust Score™ stats derived from actual activity —
   * no mock/fabricated figures. Fields are `null` where the user genuinely
   * has no relevant activity yet, so the frontend can render an empty state
   * instead of a fake number.
   */
  async getStats(userId: string) {
    const userRows = await db.select({
      trust_score:          schema.users.trust_score,
      identity_verified:    schema.users.identity_verified,
      identity_verified_at: schema.users.identity_verified_at,
      created_at:           schema.users.created_at,
      role:                 schema.users.role,
      subscription_tier:    schema.users.subscription_tier,
      country:              schema.users.country,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    const memberships = await db.select().from(schema.memberships).where(eq(schema.memberships.user_id, userId));
    const activeMemberships = memberships.filter(m => m.status === 'active');
    const activeGroupIds = [...new Set(activeMemberships.map(m => m.group_id))];
    const isGroupLeader = user.role === 'group_leader' || activeMemberships.some(m => m.role === 'leader');

    const firstMembership = memberships
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

    const contributions = await db.select().from(schema.contributions).where(eq(schema.contributions.member_id, userId));
    const decidedContributions = contributions.filter(c => c.payment_status !== 'scheduled' && c.payment_status !== 'due');
    const paidContributions = contributions.filter(c => c.payment_status === 'paid');
    const contributionReliability = decidedContributions.length
      ? Math.round((paidContributions.length / decidedContributions.length) * 100)
      : null;
    const firstPaidContribution = paidContributions
      .slice()
      .sort((a, b) => new Date(a.paid_date ?? a.due_date).getTime() - new Date(b.paid_date ?? b.due_date).getTime())[0];

    let governanceParticipation: number | null = null;
    let votesCastCount = 0;
    let firstVoteAt: Date | null = null;
    const communityTrust: Array<{ group_id: string; group_name: string; average_trust_score: number | null; member_count: number }> = [];

    if (activeGroupIds.length) {
      const groupVotes = await db.select().from(schema.votes).where(inArray(schema.votes.group_id, activeGroupIds));
      if (groupVotes.length) {
        const voteIds = groupVotes.map(v => v.id);
        const myResponses = await db.select().from(schema.voteResponses)
          .where(and(inArray(schema.voteResponses.vote_id, voteIds), eq(schema.voteResponses.member_id, userId)));
        votesCastCount = myResponses.length;
        governanceParticipation = Math.round((myResponses.length / groupVotes.length) * 100);
        if (myResponses.length) {
          firstVoteAt = myResponses
            .map(r => r.created_at)
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
        }
      }

      const groupRows = await db.select({ id: schema.savingsGroups.id, name: schema.savingsGroups.name })
        .from(schema.savingsGroups).where(inArray(schema.savingsGroups.id, activeGroupIds));
      const allActiveMembers = await db.select({ group_id: schema.memberships.group_id, user_id: schema.memberships.user_id })
        .from(schema.memberships)
        .where(and(inArray(schema.memberships.group_id, activeGroupIds), eq(schema.memberships.status, 'active')));
      const memberUserIds = [...new Set(allActiveMembers.map(m => m.user_id))];
      const memberTrustRows = memberUserIds.length
        ? await db.select({ id: schema.users.id, trust_score: schema.users.trust_score })
          .from(schema.users).where(inArray(schema.users.id, memberUserIds))
        : [];
      const trustById = Object.fromEntries(memberTrustRows.map(r => [r.id, r.trust_score]));

      for (const group of groupRows) {
        const memberIds = allActiveMembers.filter(m => m.group_id === group.id).map(m => m.user_id);
        const scores = memberIds.map(id => trustById[id]).filter((v): v is number => typeof v === 'number');
        communityTrust.push({
          group_id:            group.id,
          group_name:          group.name,
          average_trust_score: scores.length ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length) : null,
          member_count:        memberIds.length,
        });
      }
    }

    // Group-membership usage against the member's tier limit (counts both
    // active memberships and outstanding pending join requests, matching
    // groupService.countGroupsJoined() — the same figure enforced server-side
    // when creating/joining a group) so the dashboard can show "2 of 3 groups
    // joined" without drifting from what the backend actually allows.
    const pendingMemberships = memberships.filter(m => m.status === 'pending');
    const groupsJoinedCount = activeMemberships.length + pendingMemberships.length;
    const groupsLedCount = activeMemberships.filter(m => m.role === 'leader').length;
    const tierLimits = isSubscriptionTierKey(user.subscription_tier)
      ? SUBSCRIPTION_TIERS[user.subscription_tier]
      : null;

    return {
      trust_score:               user.trust_score,
      trust_score_max:           TRUST_SCORE_MAX,
      trust_score_min:           TRUST_SCORE_MIN,
      identity_verified:         user.identity_verified,
      subscription_tier:         user.subscription_tier,
      country:                   user.country,
      communities_count:         activeGroupIds.length,
      is_group_leader:           isGroupLeader,
      groups_joined_count:       groupsJoinedCount,
      groups_joined_limit:       tierLimits?.maxGroupsJoin ?? null,
      groups_created_count:      groupsLedCount,
      groups_created_limit:      tierLimits?.maxGroupsCreate ?? null,
      contribution_reliability: contributionReliability,
      contributions_paid_count: paidContributions.length,
      governance_participation: governanceParticipation,
      votes_cast_count:          votesCastCount,
      milestones: {
        joined_at:             user.created_at,
        first_community_at:    firstMembership ? firstMembership.created_at : null,
        first_contribution_at: firstPaidContribution ? (firstPaidContribution.paid_date ?? firstPaidContribution.due_date) : null,
        first_vote_at:         firstVoteAt,
        identity_verified_at:  user.identity_verified_at,
      },
      community_trust: communityTrust,
    };
  },

  /** Real Trust Score™ change history, sourced from the audit log. */
  async getTrustHistory(userId: string, limit = 20) {
    const rows = await db.select({
      id:         schema.auditLogs.id,
      metadata:   schema.auditLogs.metadata,
      created_at: schema.auditLogs.created_at,
    })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.user_id, userId), eq(schema.auditLogs.action, 'TRUST_SCORE_UPDATED')))
      .orderBy(desc(schema.auditLogs.created_at))
      .limit(limit);

    return rows.map(row => {
      const metadata = (row.metadata ?? {}) as { reason?: string; delta?: number; newScore?: number };
      return {
        id:         row.id,
        reason:     metadata.reason ?? 'TRUST_SCORE_UPDATED',
        delta:      metadata.delta ?? 0,
        new_score:  metadata.newScore ?? null,
        created_at: row.created_at,
      };
    });
  },

  async updateProfile(userId: string, data: {
    display_name?: string;
    phone_number?: string;
    notification_preferences?: Record<string, unknown>;
  }, ipAddress?: string) {
    const allowed: Record<string, unknown> = {};
    if (data.display_name !== undefined)             allowed.display_name = data.display_name;
    if (data.phone_number !== undefined)             allowed.phone_number = data.phone_number;
    if (data.notification_preferences !== undefined) allowed.notification_preferences = data.notification_preferences;

    await db.update(schema.users).set(allowed).where(eq(schema.users.id, userId));
    await createAuditLog({ userId, action: 'PROFILE_UPDATED', entity: 'users', entityId: userId, ipAddress });
    return this.getProfile(userId);
  },

  /** Self-initiated deletion (member clicked "Delete my account"). Permanently blocks the email — see emailBlocklist.ts. */
  async deleteAccount(userId: string, ipAddress?: string) {
    return this._performAccountDeletion(userId, { reason: 'user_requested', permanentlyBlockEmail: true, ipAddress });
  },

  /**
   * Section 2/3/4 — SYSTEM-initiated deletion: 60 days of an incomplete
   * profile, 60 days cancelled/inactive without re-subscribing, or removed
   * from a group by member vote for the 3rd time. Unlike deleteAccount
   * above, this deliberately does NOT permanently block the email — the
   * member may sign up again with the same address (they just can't log
   * back in to this account) — see scheduledJobs.ts /
   * membershipService.departMember.
   */
  async systemDeleteAccount(userId: string, reason: Exclude<AccountDeletionReason, 'user_requested'>) {
    return this._performAccountDeletion(userId, { reason, permanentlyBlockEmail: false });
  },

  async _performAccountDeletion(
    userId: string,
    options: { reason: AccountDeletionReason; permanentlyBlockEmail: boolean; ipAddress?: string },
  ) {
    const { reason, permanentlyBlockEmail, ipAddress } = options;
    const userRows = await db.select({
      id:                        schema.users.id,
      first_name:                schema.users.first_name,
      last_name:                 schema.users.last_name,
      display_name:              schema.users.display_name,
      email:                     schema.users.email,
      country:                   schema.users.country,
      flutterwave_customer_id:   schema.users.flutterwave_customer_id,
      stripe_customer_id:        schema.users.stripe_customer_id,
      subscription_tier:         schema.users.subscription_tier,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!userRows.length) throw new AppError('User not found.', 404);
    const user = userRows[0];

    // Section 15.B — account deletion triggers the same departure logic
    // (Compensated Compression + tenure-based Owner succession, or draft
    // cancellation) for EVERY active group the member is currently in —
    // never require manually leaving each group first. Must run before the
    // anonymization transaction below, since it still needs the member's
    // real name/email for the departure notifications it sends.
    const activeMemberships = await db.select({
      group_id: schema.memberships.group_id,
      leader_id: schema.savingsGroups.leader_id,
    })
      .from(schema.memberships)
      .innerJoin(schema.savingsGroups, eq(schema.memberships.group_id, schema.savingsGroups.id))
      .where(and(eq(schema.memberships.user_id, userId), eq(schema.memberships.status, 'active')));

    for (const membership of activeMemberships) {
      if (membership.leader_id === userId) {
        await membershipService.departGroupOwner(userId, membership.group_id, 'voluntary', ipAddress);
      } else {
        await membershipService.departMember(userId, membership.group_id, 'voluntary', ipAddress);
      }
    }

    const subscriptionRows = await db.select({
      provider:                 schema.subscriptions.provider,
      provider_subscription_id: schema.subscriptions.provider_subscription_id,
      billing_status:           schema.subscriptions.billing_status,
    }).from(schema.subscriptions).where(eq(schema.subscriptions.user_id, userId)).limit(1);
    const subscription = subscriptionRows[0];

    let providerSubscriptionCancelled = false;
    if (subscription?.provider_subscription_id && subscription.billing_status !== 'cancelled') {
      try {
        const provider = getPaymentProvider(subscription.provider === 'flutterwave' ? 'NG' : 'GB');
        const result = await provider.cancelSubscription({ subscriptionId: subscription.provider_subscription_id });
        providerSubscriptionCancelled = Boolean(result.cancelled);
      } catch (error) {
        console.error('[UserService] Failed to cancel provider subscription during account deletion:', error);
      }
    }

    const accountHolderName = getDeletedDisplayName(user);

    const dependencyCounts = {
      savings_groups_leader: await countRows(
        db.select({ value: count() }).from(schema.savingsGroups).where(eq(schema.savingsGroups.leader_id, userId))
      ),
      group_invitations_invited_by: await countRows(
        db.select({ value: count() }).from(schema.groupInvitations).where(eq(schema.groupInvitations.invited_by, userId))
      ),
      memberships: await countRows(
        db.select({ value: count() }).from(schema.memberships).where(eq(schema.memberships.user_id, userId))
      ),
      contributions: await countRows(
        db.select({ value: count() }).from(schema.contributions).where(eq(schema.contributions.member_id, userId))
      ),
      rotations: await countRows(
        db.select({ value: count() }).from(schema.rotations).where(eq(schema.rotations.recipient_id, userId))
      ),
      votes_proposed: await countRows(
        db.select({ value: count() }).from(schema.votes).where(eq(schema.votes.proposer_id, userId))
      ),
      vote_responses: await countRows(
        db.select({ value: count() }).from(schema.voteResponses).where(eq(schema.voteResponses.member_id, userId))
      ),
      notifications: await countRows(
        db.select({ value: count() }).from(schema.notifications).where(eq(schema.notifications.user_id, userId))
      ),
      subscriptions: await countRows(
        db.select({ value: count() }).from(schema.subscriptions).where(eq(schema.subscriptions.user_id, userId))
      ),
      support_tickets_opened: await countRows(
        db.select({ value: count() }).from(schema.supportTickets).where(eq(schema.supportTickets.user_id, userId))
      ),
      support_tickets_assigned: await countRows(
        db.select({ value: count() }).from(schema.supportTickets).where(eq(schema.supportTickets.assigned_admin, userId))
      ),
      audit_logs: await countRows(
        db.select({ value: count() }).from(schema.auditLogs).where(eq(schema.auditLogs.user_id, userId))
      ),
    };

    const hasRetainedDependencies = Object.values(dependencyCounts).some(value => value > 0);
    const deletedPasswordHash = await bcrypt.hash(`deleted-account-${userId}-${Date.now()}`, BCRYPT_ROUNDS);
    const deletedEmail = getDeletedEmail(userId);
    let hardDeleted = false;

    await db.transaction(async (tx) => {
      await tx.delete(schema.emailVerificationTokens).where(eq(schema.emailVerificationTokens.user_id, userId));
      await tx.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.user_id, userId));

      // Only a self-initiated deletion permanently blocks the ORIGINAL email
      // before it's overwritten below — see src/server/lib/emailBlocklist.ts
      // (prevents evading default/suspension history via delete-then-
      // re-register). A SYSTEM-initiated deletion (incomplete onboarding,
      // inactivity after cancellation, voted out 3 times) deliberately frees
      // the email up for a fresh sign-up instead — see systemDeleteAccount.
      if (permanentlyBlockEmail) {
        const emailHash = hashEmail(user.email);
        const alreadyBlocked = await tx.select({ id: schema.emailBlocklist.id }).from(schema.emailBlocklist)
          .where(eq(schema.emailBlocklist.email_hash, emailHash)).limit(1);
        if (!alreadyBlocked.length) {
          await tx.insert(schema.emailBlocklist).values({ id: uuidv4(), email_hash: emailHash, reason: 'account_deleted' });
        }
      }

      // Groups the member led/joined have already had their departure logic
      // (Compensated Compression, Owner succession, or draft cancellation)
      // applied above — nothing further to close here.

      await tx.update(schema.subscriptions)
        .set({
          billing_status:           'cancelled',
          provider_subscription_id: null,
          renewal_date:             null,
        })
        .where(eq(schema.subscriptions.user_id, userId));

      await tx.update(schema.users)
        .set({
          first_name:                  'Deleted',
          last_name:                   'User',
          display_name:                'Deleted user',
          email:                       deletedEmail,
          password_hash:               deletedPasswordHash,
          phone_number:                null,
          subscription_status:         'cancelled',
          subscription_tier:           null,
          stripe_customer_id:          null,
          stripe_payment_method_id:    null,
          stripe_connected_account_id: null,
          flutterwave_customer_id:     null,
          flutterwave_card_token:      null,
          flutterwave_subaccount_id:   null,
          payment_method_verified_at:  null,
          payout_verified_at:          null,
          payment_terms_accepted_at:   null,
          notification_preferences:    null,
          account_status:              'deactivated',
          email_verified:              false,
          identity_verified:           false,
          identity_verified_at:        null,
          stripe_identity_session_id:  null,
          bvn_verification_reference:  null,
          last_login_at:               null,
          active:                      false,
        })
        .where(eq(schema.users.id, userId));

      if (!hasRetainedDependencies) {
        try {
          await tx.delete(schema.users).where(eq(schema.users.id, userId));
          hardDeleted = true;
        } catch (error) {
          if (!isForeignKeyReferenceError(error)) throw error;
        }
      }
    });

    await createAuditLog({
      action: reason === 'user_requested' ? 'ACCOUNT_DELETED' : 'ACCOUNT_SYSTEM_DELETED',
      entity: 'users',
      entityId: userId,
      ipAddress,
      metadata: {
        deletionReason: reason,
        permanentlyBlockedEmail: permanentlyBlockEmail,
        accountDeletionOutcome: hardDeleted ? 'hard_deleted' : 'anonymized',
        groupsDeparted: activeMemberships.map(membership => membership.group_id),
        dependencyCounts,
        providerSubscriptionCancelled,
        previousCountry: user.country,
        previousSubscriptionTier: user.subscription_tier,
        previousCustomerIdsCleared: Boolean(user.flutterwave_customer_id || user.stripe_customer_id),
      },
    });

    await sendAccountDeletedEmail(user.email, accountHolderName, reason);

    return { hardDeleted };
  },

  async deactivate(userId: string, ipAddress?: string) {
    await db.update(schema.users)
      .set({ active: false, account_status: 'deactivated' })
      .where(eq(schema.users.id, userId));
    await createAuditLog({ userId, action: 'ACCOUNT_DEACTIVATED', entity: 'users', entityId: userId, ipAddress });
    return true;
  },

  async updatePreferences(userId: string, preferences: Record<string, unknown>) {
    await db.update(schema.users)
      .set({ notification_preferences: preferences })
      .where(eq(schema.users.id, userId));
    return true;
  },
};
