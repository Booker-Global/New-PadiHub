import { v4 as uuidv4 } from 'uuid';
import { eq, and, count, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { assertPaymentSetupComplete } from './paymentEligibilityService.js';
import {
  INVITE_TTL, GROUP_DEFAULT_STRIKE_THRESHOLD, GROUP_DEFAULT_SUSPENSION_THRESHOLD,
  GROUP_DEFAULT_VOTING_THRESHOLD, GROUP_DEFAULT_MIN_TRUST_SCORE,
  SUBSCRIPTION_TIERS, isSubscriptionTierKey,
} from '../lib/constants.js';
import {
  sendGroupInvitationEmail,
  sendGroupClosedEmail,
} from '../integrations/email/emailService.js';

function assignProvider(country: string) {
  return country === 'NG' ? 'flutterwave' : 'stripe';
}

export const groupService = {
  async list(filters?: { status?: string; country?: string }) {
    
    return db.select().from(schema.savingsGroups)
      .where(filters?.status ? eq(schema.savingsGroups.status, filters.status as 'active' | 'closed' | 'suspended') : undefined);
  },

  async getById(groupId: string) {
    
    const rows = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!rows.length) throw new AppError('Group not found.', 404);
    return rows[0];
  },

  /** How many active groups a user currently leads. */
  async countGroupsLed(userId: string): Promise<number> {
    const rows = await db.select({ value: count() }).from(schema.memberships)
      .where(and(
        eq(schema.memberships.user_id, userId),
        eq(schema.memberships.role, 'leader'),
        eq(schema.memberships.status, 'active'),
      ));
    return rows[0]?.value ?? 0;
  },

  /** How many groups a user is currently an active or pending member of. */
  async countGroupsJoined(userId: string): Promise<number> {
    const rows = await db.select({ value: count() }).from(schema.memberships)
      .where(and(
        eq(schema.memberships.user_id, userId),
        eq(schema.memberships.status, 'active'),
      ));
    const pendingRows = await db.select({ value: count() }).from(schema.memberships)
      .where(and(
        eq(schema.memberships.user_id, userId),
        eq(schema.memberships.status, 'pending'),
      ));
    return (rows[0]?.value ?? 0) + (pendingRows[0]?.value ?? 0);
  },

  /**
   * Search publicly discoverable groups — always scoped to the visitor's own
   * country (UK or Nigeria) so members only ever see groups they're actually
   * eligible to join. Anonymous visitors can call this too (search itself
   * doesn't require an account — only *requesting to join* does).
   */
  async search(country: string, query?: string) {
    const rows = await db.select({
      id:                     schema.savingsGroups.id,
      name:                   schema.savingsGroups.name,
      description:            schema.savingsGroups.description,
      country:                schema.savingsGroups.country,
      currency:               schema.savingsGroups.currency,
      contribution_amount:    schema.savingsGroups.contribution_amount,
      contribution_frequency: schema.savingsGroups.contribution_frequency,
      maximum_members:        schema.savingsGroups.maximum_members,
      min_trust_score:        schema.savingsGroups.min_trust_score,
      created_at:             schema.savingsGroups.created_at,
    })
      .from(schema.savingsGroups)
      .where(and(
        eq(schema.savingsGroups.status, 'active'),
        eq(schema.savingsGroups.country, country),
      ));

    const memberCounts = await db.select({
      group_id: schema.memberships.group_id,
      value:    count(),
    }).from(schema.memberships)
      .where(eq(schema.memberships.status, 'active'))
      .groupBy(schema.memberships.group_id);
    const memberCountByGroup = Object.fromEntries(memberCounts.map(m => [m.group_id, m.value]));

    const normalizedQuery = query?.trim().toLowerCase();
    return rows
      .filter(g => !normalizedQuery || g.name.toLowerCase().includes(normalizedQuery))
      .map(g => ({
        ...g,
        member_count:    memberCountByGroup[g.id] ?? 0,
        spots_remaining: Math.max(0, g.maximum_members - (memberCountByGroup[g.id] ?? 0)),
      }))
      .filter(g => g.spots_remaining > 0);
  },

  async create(data: {
    name: string; description?: string; leader_id: string;
    country: string; currency: string;
    contribution_amount: string; contribution_frequency: 'daily' | 'weekly' | 'monthly';
    payout_day?: number;
    maximum_members: number; rotation_method: 'manual' | 'random';
    strike_threshold?: number; suspension_threshold?: number;
    voting_threshold?: number; allow_payout_swaps?: boolean;
    min_trust_score?: number;
  }, ipAddress?: string) {
    // Identity verification is required to create a group
    const leaderRows = await db.select({
      identity_verified: schema.users.identity_verified,
      country: schema.users.country,
      subscription_tier: schema.users.subscription_tier,
    }).from(schema.users).where(eq(schema.users.id, data.leader_id)).limit(1);

    if (leaderRows.length && !leaderRows[0].identity_verified) {
      const verificationUrl = leaderRows[0].country === 'NG'
        ? '/api/identity/bvn/verify'
        : '/api/identity/verify/start';
      throw new AppError(
        `Identity verification is required before creating a group. Start verification at: ${verificationUrl}`,
        403,
        'VERIFICATION_REQUIRED',
      );
    }

    // The group creator is the group's first member, so the same
    // onboarding-completeness gate (email + identity + subscription tier +
    // payment method + payout destination) applies to them too.
    await assertPaymentSetupComplete(data.leader_id);

    const tier = leaderRows[0]?.subscription_tier;
    if (!isSubscriptionTierKey(tier)) {
      throw new AppError('Select a subscription plan before creating a group.', 403, 'SUBSCRIPTION_TIER_NOT_SELECTED');
    }
    const groupsLed = await this.countGroupsLed(data.leader_id);
    if (groupsLed >= SUBSCRIPTION_TIERS[tier].maxGroupsCreate) {
      throw new AppError(
        `Your ${SUBSCRIPTION_TIERS[tier].name} plan allows you to create up to ${SUBSCRIPTION_TIERS[tier].maxGroupsCreate} group${SUBSCRIPTION_TIERS[tier].maxGroupsCreate === 1 ? '' : 's'}. Upgrade your plan to create more.`,
        403,
        'GROUP_CREATE_LIMIT_REACHED',
      );
    }

    const id = uuidv4();
    const payment_provider = assignProvider(data.country);

    await db.insert(schema.savingsGroups).values({
      id,
      name:                     data.name,
      description:              data.description,
      leader_id:                data.leader_id,
      country:                  data.country,
      currency:                 data.currency,
      contribution_amount:      data.contribution_amount,
      contribution_frequency:   data.contribution_frequency,
      payout_day:               data.payout_day ?? null,
      maximum_members:          data.maximum_members,
      min_trust_score:          data.min_trust_score ?? GROUP_DEFAULT_MIN_TRUST_SCORE,
      rotation_method:          data.rotation_method,
      current_rotation_position: 1,
      current_cycle:            1,
      strike_threshold:         data.strike_threshold ?? GROUP_DEFAULT_STRIKE_THRESHOLD,
      suspension_threshold:     data.suspension_threshold ?? GROUP_DEFAULT_SUSPENSION_THRESHOLD,
      voting_threshold:         data.voting_threshold ?? GROUP_DEFAULT_VOTING_THRESHOLD,
      allow_payout_swaps:       data.allow_payout_swaps ?? true,
      payment_provider:         payment_provider as 'stripe' | 'flutterwave',
      status:                   'active',
    });

    // Auto-add leader as member
    await db.insert(schema.memberships).values({
      id:             uuidv4(),
      user_id:        data.leader_id,
      group_id:       id,
      role:           'leader',
      rotation_order: 1,
      status:         'active',
      strike_count:   0,
    });

    await createAuditLog({ userId: data.leader_id, action: 'GROUP_CREATED', entity: 'savings_groups', entityId: id, ipAddress });
    await notificationService.create({
      userId: data.leader_id, type: 'group_created',
      title: 'Group Created',
      message: `Your savings group "${data.name}" has been created successfully.`,
    });

    return this.getById(id);
  },

  async update(groupId: string, leaderId: string, data: Partial<{
    name: string; description: string; maximum_members: number; min_trust_score: number;
    strike_threshold: number; suspension_threshold: number;
    voting_threshold: number; allow_payout_swaps: boolean;
  }>, ipAddress?: string) {
    
    const group = await this.getById(groupId);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can update this group.', 403);

    await db.update(schema.savingsGroups).set(data).where(eq(schema.savingsGroups.id, groupId));
    await createAuditLog({ userId: leaderId, action: 'GROUP_UPDATED', entity: 'savings_groups', entityId: groupId, ipAddress });
    return this.getById(groupId);
  },

  async close(groupId: string, leaderId: string, ipAddress?: string) {
    
    const group = await this.getById(groupId);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can close this group.', 403);

    await db.update(schema.savingsGroups)
      .set({ status: 'closed' }).where(eq(schema.savingsGroups.id, groupId));
    await createAuditLog({ userId: leaderId, action: 'GROUP_CLOSED', entity: 'savings_groups', entityId: groupId, ipAddress });

    // Email all active members
    const members = await db.select({ user_id: schema.memberships.user_id })
      .from(schema.memberships)
      .where(eq(schema.memberships.group_id, groupId));
    const memberIds = members.map(m => m.user_id);
    if (memberIds.length) {
      const { inArray } = await import('drizzle-orm');
      const memberUsers = await db.select({ email: schema.users.email })
        .from(schema.users).where(inArray(schema.users.id, memberIds));
      for (const u of memberUsers) {
        await sendGroupClosedEmail(u.email, group.name);
      }
    }
    return true;
  },

  async createInvitation(groupId: string, invitedBy: string, email?: string) {
    
    const group = await this.getById(groupId);
    if (group.status !== 'active') throw new AppError('Group is not active.', 400);

    const token = uuidv4();
    const id = uuidv4();
    await db.insert(schema.groupInvitations).values({
      id, group_id: groupId, invited_by: invitedBy,
      email, token,
      expires_at: new Date(Date.now() + INVITE_TTL),
      accepted: false,
    });

    await createAuditLog({ userId: invitedBy, action: 'INVITATION_SENT', entity: 'savings_groups', entityId: groupId });

    // Send invitation email if an email address was provided
    if (email) {
      const expiresAt = new Date(Date.now() + INVITE_TTL).toLocaleDateString('en-GB');
      const inviteLink = `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups/join?token=${token}`;
      await sendGroupInvitationEmail(email, group.name, inviteLink, expiresAt);
    }
    return { token, inviteLink: `/savings-groups/join?token=${token}` };
  },

  async getInvitation(token: string) {
    
    const rows = await db.select().from(schema.groupInvitations)
      .where(eq(schema.groupInvitations.token, token)).limit(1);
    if (!rows.length) throw new AppError('Invalid invitation.', 404);
    const inv = rows[0];
    if (inv.accepted) throw new AppError('Invitation already used.', 400);
    if (new Date() > inv.expires_at) throw new AppError('Invitation has expired.', 400);
    return inv;
  },

  /**
   * Aggregated data for the "Manage Group" / leader dashboard — the page
   * MUST ONLY reflect groups the requesting user actually leads (leader_id),
   * and every figure returned here must be something PadiHub genuinely
   * tracks (real memberships, contributions, votes) rather than fabricated
   * analytics. Returns `isLeader: false` when the user leads no groups so
   * the frontend can gate the page accordingly.
   */
  async getLeaderDashboard(userId: string) {
    const ledGroups = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.leader_id, userId));

    if (!ledGroups.length) {
      return {
        isLeader: false,
        totals: { groupsLed: 0, totalMembers: 0, avgContributionRate: null, avgTrustScore: null, openProposals: 0 },
        communities: [] as Array<never>,
        pendingActions: [] as Array<never>,
        members: [] as Array<never>,
      };
    }

    const groupIds = ledGroups.map(g => g.id);
    const groupNameById = new Map(ledGroups.map(g => [g.id, g.name]));

    const [allMemberships, allContributions, allVotes] = await Promise.all([
      db.select().from(schema.memberships).where(inArray(schema.memberships.group_id, groupIds)),
      db.select().from(schema.contributions).where(inArray(schema.contributions.group_id, groupIds)),
      db.select().from(schema.votes).where(inArray(schema.votes.group_id, groupIds)),
    ]);

    // Everyone but the leader themselves — the leader already sees their own
    // Trust Score elsewhere, this table is about the members they manage.
    const activeMemberships = allMemberships.filter(m => m.status === 'active' && m.user_id !== userId);
    const memberUserIds = [...new Set(activeMemberships.map(m => m.user_id))];
    const userRows = memberUserIds.length
      ? await db.select({ id: schema.users.id, trust_score: schema.users.trust_score })
        .from(schema.users).where(inArray(schema.users.id, memberUserIds))
      : [];
    const trustById = new Map(userRows.map(u => [u.id, u.trust_score]));

    // Stable, privacy-preserving "Member N" label per group (ordered by join
    // date so it doesn't reshuffle as trust scores change), keyed by
    // `${group_id}:${user_id}` so the same member gets the same label in
    // both the pending-actions feed and the member table below — matching
    // the "Member N" convention already used on the group detail page.
    const memberLabelByGroupAndUser = new Map<string, string>();
    for (const g of ledGroups) {
      const groupActiveMembers = activeMemberships
        .filter(m => m.group_id === g.id)
        .sort((a, b) => new Date(a.join_date).getTime() - new Date(b.join_date).getTime());
      groupActiveMembers.forEach((m, index) => {
        memberLabelByGroupAndUser.set(`${g.id}:${m.user_id}`, `Member ${index + 1}`);
      });
    }
    const labelFor = (groupId: string, userIdToLabel: string) =>
      memberLabelByGroupAndUser.get(`${groupId}:${userIdToLabel}`) ?? 'A member';

    const contributionRate = (rows: (typeof allContributions)) => {
      const paid = rows.filter(c => c.payment_status === 'paid').length;
      const missed = rows.filter(c => c.payment_status === 'missed').length;
      const resolved = paid + missed;
      return resolved > 0 ? Math.round((paid / resolved) * 100) : null;
    };

    const communities = ledGroups.map(g => {
      const groupContributions = allContributions.filter(c => c.group_id === g.id);
      return {
        id: g.id,
        name: g.name,
        currency: g.currency,
        status: g.status,
        memberCount: allMemberships.filter(m => m.group_id === g.id && m.status === 'active').length,
        contributionRate: contributionRate(groupContributions),
        missedCount: groupContributions.filter(c => c.payment_status === 'missed').length,
        openProposalsCount: allVotes.filter(v => v.group_id === g.id && v.status === 'open').length,
      };
    });

    const pendingActions: Array<{ type: 'contribution' | 'proposal' | 'member'; label: string; community: string; time: string; urgency: 'high' | 'medium' | 'low' }> = [];

    for (const c of allContributions.filter(c => c.payment_status === 'missed')) {
      pendingActions.push({
        type: 'contribution',
        label: `${labelFor(c.group_id, c.member_id)} missed contribution — cycle ${c.cycle_number}`,
        community: groupNameById.get(c.group_id) ?? 'Group',
        time: new Date(c.updated_at ?? c.due_date).toISOString(),
        urgency: 'high',
      });
    }
    for (const v of allVotes.filter(v => v.status === 'open')) {
      pendingActions.push({
        type: 'proposal',
        label: `New proposal: ${v.proposal_text}`,
        community: groupNameById.get(v.group_id) ?? 'Group',
        time: new Date(v.created_at).toISOString(),
        urgency: 'medium',
      });
    }
    for (const m of allMemberships.filter(m => m.status === 'pending')) {
      pendingActions.push({
        type: 'member',
        label: 'New join request awaiting approval',
        community: groupNameById.get(m.group_id) ?? 'Group',
        time: new Date(m.created_at).toISOString(),
        urgency: 'low',
      });
    }
    pendingActions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const contributionsByMemberAndGroup = new Map<string, typeof allContributions>();
    for (const c of allContributions) {
      const key = `${c.group_id}:${c.member_id}`;
      const bucket = contributionsByMemberAndGroup.get(key);
      if (bucket) bucket.push(c);
      else contributionsByMemberAndGroup.set(key, [c]);
    }

    const members = activeMemberships
      .map(m => ({
        id: m.id,
        label: labelFor(m.group_id, m.user_id),
        community: groupNameById.get(m.group_id) ?? 'Group',
        trustScore: trustById.get(m.user_id) ?? 0,
        contributionRate: contributionRate(contributionsByMemberAndGroup.get(`${m.group_id}:${m.user_id}`) ?? []),
        status: m.strike_count > 0 ? 'attention' as const : 'active' as const,
        strikeCount: m.strike_count,
      }))
      .sort((a, b) => b.trustScore - a.trustScore);

    return {
      isLeader: true,
      totals: {
        groupsLed: ledGroups.length,
        totalMembers: activeMemberships.length,
        avgContributionRate: contributionRate(allContributions),
        avgTrustScore: trustById.size ? Math.round([...trustById.values()].reduce((sum, v) => sum + v, 0) / trustById.size) : null,
        openProposals: allVotes.filter(v => v.status === 'open').length,
      },
      communities,
      pendingActions: pendingActions.slice(0, 10),
      members: members.slice(0, 20),
    };
  },
};
