import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { TRUST_SCORE_MAX, TRUST_SCORE_MIN } from '../lib/constants.js';

export const userService = {
  async getProfile(userId: string) {
    
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length) throw new AppError('User not found.', 404);
    const { password_hash: _, ...safe } = rows[0];
    return safe;
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

    return {
      trust_score:               user.trust_score,
      trust_score_max:           TRUST_SCORE_MAX,
      trust_score_min:           TRUST_SCORE_MIN,
      identity_verified:         user.identity_verified,
      communities_count:         activeGroupIds.length,
      is_group_leader:           isGroupLeader,
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
