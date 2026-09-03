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
  GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH, GROUP_MAX_MEMBERS, clampGroupMaximumMembers, isDailyFrequencyAllowed,
  countryDisplayName, resolveUserDisplayName,
} from '../lib/constants.js';
import {
  sendGroupInvitationEmail,
  sendGroupClosedEmail,
  sendGroupActivatedEmail,
  sendGroupSuspendedLowMembersEmail,
  sendGroupReactivatedEmail,
  sendGroupCreatedEmail,
  sendGroupSettingsUpdatedEmail,
} from '../integrations/email/emailService.js';
import { payoutDayBounds } from '../lib/payoutSchedule.js';

function assignProvider(country: string) {
  return country === 'NG' ? 'flutterwave' : 'stripe';
}

/**
 * Human-readable summary of a group's lifecycle length, used in the
 * creation notification/email and again whenever anyone joins later — every
 * member is told up front whether the group is fixed-length or indefinite
 * (Section 15.C).
 */
export function describeGroupDuration(durationType: 'fixed' | 'indefinite', rotations: number | null): string {
  return durationType === 'fixed' && rotations
    ? `This group is fixed-length — it will automatically close after ${rotations} complete payout rotation${rotations === 1 ? '' : 's'}.`
    : 'This group runs indefinitely — there is no fixed end date unless the Owner later chooses to close it.';
}

function normalizeRotationMethod(rotationMethod: 'manual' | 'random') {
  return rotationMethod === 'manual' ? 'trust_score' : rotationMethod;
}

export const groupService = {
  async list(filters?: { status?: string; country?: string }) {
    
    const rows = await db.select().from(schema.savingsGroups)
      .where(filters?.status ? eq(schema.savingsGroups.status, filters.status as 'draft' | 'active' | 'closed' | 'suspended' | 'expired') : undefined);
    return rows.map(row => ({
      ...row,
      maximum_members: clampGroupMaximumMembers(row.maximum_members),
      rotation_method: normalizeRotationMethod(row.rotation_method),
    }));
  },

  async getById(groupId: string) {
    
    const rows = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!rows.length) throw new AppError('Group not found.', 404);

    const leaderRows = await db.select({
      display_name: schema.users.display_name,
      first_name:   schema.users.first_name,
      last_name:    schema.users.last_name,
      email:        schema.users.email,
    }).from(schema.users).where(eq(schema.users.id, rows[0].leader_id)).limit(1);

    return {
      ...rows[0],
      maximum_members: clampGroupMaximumMembers(rows[0].maximum_members),
      rotation_method: normalizeRotationMethod(rows[0].rotation_method),
      // Every screen must show the leader's name, never their raw user ID —
      // see resolveUserDisplayName doc comment.
      leader_name: resolveUserDisplayName(leaderRows[0]),
    };
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

  /** How many active (verified) members a group currently has. */
  async countActiveMembers(groupId: string): Promise<number> {
    const rows = await db.select({ value: count() }).from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    return rows[0]?.value ?? 0;
  },

  /**
   * How many groups a user is a verified (active) member of that are
   * themselves in the 'active' lifecycle status (Section 3) — this is the
   * gate for subscription billing: billing stays inert/paused until this
   * is > 0, and a daily job pauses it again if this hits exactly 0.
   */
  async countActiveGroupMembershipsForUser(userId: string): Promise<number> {
    const rows = await db.select({ value: count() })
      .from(schema.memberships)
      .innerJoin(schema.savingsGroups, eq(schema.memberships.group_id, schema.savingsGroups.id))
      .where(and(
        eq(schema.memberships.user_id, userId),
        eq(schema.memberships.status, 'active'),
        eq(schema.savingsGroups.status, 'active'),
      ));
    return rows[0]?.value ?? 0;
  },

  /**
   * Re-checks a group's member count against the Draft/Active/Suspended
   * lifecycle rules (Section 1) after ANY membership change (join, approve,
   * leave, remove, Compensated Compression). An 'active' group that drops
   * below GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH is suspended (collection
   * pauses automatically — the contribution-schedule/rotation-advance jobs
   * only ever touch 'active' groups); a 'suspended' group that gets
   * refilled back up to the minimum is reactivated automatically. Never
   * touches 'draft' (handled by activateGroup), 'closed', or 'expired'
   * groups.
   */
  /**
   * Section D.2 — fire subscription-billing reconciliation immediately for
   * a set of user IDs whenever their active-group-membership count could
   * have just changed (group launched/suspended/reactivated, or an
   * individual member's own status flips to/from 'active'). Dynamically
   * imported to avoid a static circular dependency (subscriptionService
   * already imports groupService) — same pattern used elsewhere in this
   * codebase (see membershipService/voteService). Best-effort: a failure
   * here must never fail the group/membership action that triggered it —
   * scheduledJobs.dailyBillingActiveGroupReconciliation is the safety net.
   */
  async reconcileMemberBilling(userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    try {
      const { subscriptionService } = await import('./subscriptionService.js');
      for (const userId of userIds) {
        await subscriptionService.reconcileBillingForActiveGroupMembership(userId);
      }
    } catch (error) {
      console.error('[GroupService] Failed to reconcile subscription billing for active group membership:', error);
    }
  },

  async reevaluateAfterMembershipChange(groupId: string): Promise<void> {
    const group = await this.getById(groupId);
    if (group.status !== 'active' && group.status !== 'suspended') return;

    const activeCount = await this.countActiveMembers(groupId);

    if (group.status === 'active' && activeCount < GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH) {
      const memberUserIds = (await db.select({ user_id: schema.memberships.user_id }).from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')))).map(m => m.user_id);

      await db.update(schema.savingsGroups)
        .set({ status: 'suspended', suspended_at: new Date() })
        .where(eq(schema.savingsGroups.id, groupId));
      await createAuditLog({ action: 'GROUP_SUSPENDED_LOW_MEMBERS', entity: 'savings_groups', entityId: groupId, metadata: { activeCount } });
      await notificationService.create({
        userId: group.leader_id, type: 'group_suspended_low_members',
        title: 'Group Suspended',
        message: `"${group.name}" dropped below ${GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH} active members and has been suspended. Collection is paused — invite more members to reactivate it.`,
      });
      const leaderRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, group.leader_id)).limit(1);
      if (leaderRow.length) await sendGroupSuspendedLowMembersEmail(leaderRow[0].email, group.name, activeCount, GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH);
      await this.reconcileMemberBilling(memberUserIds);
      return;
    }

    if (group.status === 'suspended' && activeCount >= GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH) {
      await db.update(schema.savingsGroups)
        .set({ status: 'active', suspended_at: null })
        .where(eq(schema.savingsGroups.id, groupId));
      await createAuditLog({ action: 'GROUP_REACTIVATED', entity: 'savings_groups', entityId: groupId, metadata: { activeCount } });
      await notificationService.create({
        userId: group.leader_id, type: 'group_reactivated',
        title: 'Group Reactivated',
        message: `"${group.name}" is back to ${activeCount} active members and collection has resumed.`,
      });
      const leaderRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, group.leader_id)).limit(1);
      if (leaderRow.length) await sendGroupReactivatedEmail(leaderRow[0].email, group.name);

      const memberUserIds = (await db.select({ user_id: schema.memberships.user_id }).from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')))).map(m => m.user_id);
      await this.reconcileMemberBilling(memberUserIds);
    }
  },

  /**
   * Search publicly discoverable groups — always scoped to the visitor's own
   * country (UK or Nigeria) so members only ever see groups they're actually
   * eligible to join. Anonymous visitors can call this too (search itself
   * doesn't require an account — only *requesting to join* does).
   */
  async getUserCountry(userId: string): Promise<string | null> {
    const rows = await db.select({ country: schema.users.country })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    return rows.length ? rows[0].country : null;
  },

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
        maximum_members: clampGroupMaximumMembers(g.maximum_members),
        member_count:    memberCountByGroup[g.id] ?? 0,
        spots_remaining: Math.max(0, clampGroupMaximumMembers(g.maximum_members) - (memberCountByGroup[g.id] ?? 0)),
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
    group_duration_type?: 'fixed' | 'indefinite'; group_duration_rotations?: number;
  }, ipAddress?: string) {
    // Production payment frequency is Weekly/Monthly only — Daily exists
    // solely to speed up manual/QA testing of rotation logic.
    if (data.contribution_frequency === 'daily' && !isDailyFrequencyAllowed()) {
      throw new AppError(
        'Daily contribution frequency is only available in development/testing. Choose Weekly or Monthly.',
        400,
        'FREQUENCY_NOT_ALLOWED_IN_PRODUCTION',
      );
    }
    if (data.maximum_members > GROUP_MAX_MEMBERS) {
      throw new AppError(
        `Savings groups can have a maximum of ${GROUP_MAX_MEMBERS} members.`,
        400,
        'GROUP_MEMBER_LIMIT_EXCEEDED',
      );
    }

    // Identity verification is required to create a group
    const leaderRows = await db.select({
      identity_verified: schema.users.identity_verified,
      country: schema.users.country,
      subscription_tier: schema.users.subscription_tier,
    }).from(schema.users).where(eq(schema.users.id, data.leader_id)).limit(1);

    if (leaderRows.length && !leaderRows[0].identity_verified) {
      throw new AppError(
        'Identity verification is required before creating a group. Complete verification at /verify-identity.',
        403,
        'VERIFICATION_REQUIRED',
      );
    }

    // A group's country (and therefore its payment provider — Stripe/GBP for
    // GB, Flutterwave/NGN for NG) must match its creator's own account
    // country. Every member added later is held to the same rule (see
    // membershipService.join()/createInvitation() above), so this can never
    // be a mixed-country group.
    if (leaderRows.length && leaderRows[0].country !== data.country) {
      throw new AppError(
        `You can only create a group in ${countryDisplayName(leaderRows[0].country)}, matching your own account's country.`,
        403,
        'GROUP_COUNTRY_MISMATCH',
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
        SUBSCRIPTION_TIERS[tier].maxGroupsCreate === 0
          ? `Your ${SUBSCRIPTION_TIERS[tier].name} plan doesn't allow creating groups — upgrade to Premium to create up to ${SUBSCRIPTION_TIERS.premium.maxGroupsCreate} groups.`
          : `You've reached your ${SUBSCRIPTION_TIERS[tier].name} plan's limit of ${SUBSCRIPTION_TIERS[tier].maxGroupsCreate} created groups.`,
        403,
        'GROUP_CREATE_LIMIT_REACHED',
      );
    }
    // Creating a group also counts as a membership of it, so it must not push
    // the leader past their tier's TOTAL group-membership cap (created +
    // joined groups combined) — see countGroupsJoined(), which counts every
    // membership regardless of role or status.
    const groupsJoined = await this.countGroupsJoined(data.leader_id);
    if (groupsJoined >= SUBSCRIPTION_TIERS[tier].maxGroupsJoin) {
      throw new AppError(
        `You've reached your ${SUBSCRIPTION_TIERS[tier].name} plan's limit of ${SUBSCRIPTION_TIERS[tier].maxGroupsJoin} group memberships. Leave a group to create another.`,
        403,
        'GROUP_MEMBERSHIP_LIMIT_REACHED',
      );
    }

    const id = uuidv4();
    const payment_provider = assignProvider(data.country);
    const durationType = data.group_duration_type ?? 'indefinite';
    if (durationType === 'fixed' && (!data.group_duration_rotations || data.group_duration_rotations < 1)) {
      throw new AppError('Choose how many payout rotations this group should run for (1 or more).', 400, 'GROUP_DURATION_REQUIRED');
    }

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
      maximum_members:          clampGroupMaximumMembers(data.maximum_members),
      min_trust_score:          data.min_trust_score ?? GROUP_DEFAULT_MIN_TRUST_SCORE,
      rotation_method:          data.rotation_method,
      current_rotation_position: 1,
      current_cycle:            1,
      strike_threshold:         data.strike_threshold ?? GROUP_DEFAULT_STRIKE_THRESHOLD,
      suspension_threshold:     data.suspension_threshold ?? GROUP_DEFAULT_SUSPENSION_THRESHOLD,
      voting_threshold:         data.voting_threshold ?? GROUP_DEFAULT_VOTING_THRESHOLD,
      allow_payout_swaps:       data.allow_payout_swaps ?? true,
      payment_provider:         payment_provider as 'stripe' | 'flutterwave',
      status:                   'draft',
      group_duration_type:      durationType,
      group_duration_rotations: durationType === 'fixed' ? data.group_duration_rotations : null,
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
    const durationSummary = describeGroupDuration(durationType, durationType === 'fixed' ? (data.group_duration_rotations ?? null) : null);
    await notificationService.create({
      userId: data.leader_id, type: 'group_created',
      title: 'Group Created',
      message: `Your savings group "${data.name}" has been created as a draft. Invite at least ${GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH} members, then use "Start Group" to launch it. ${durationSummary}`,
    });
    const leaderEmailRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, data.leader_id)).limit(1);
    if (leaderEmailRow.length) await sendGroupCreatedEmail(leaderEmailRow[0].email, data.name, durationSummary);

    return this.getById(id);
  },

  async update(groupId: string, leaderId: string, data: Partial<{
    name: string; description: string; maximum_members: number; min_trust_score: number;
    contribution_amount: string; payout_day: number;
    strike_threshold: number; suspension_threshold: number;
    voting_threshold: number; allow_payout_swaps: boolean;
  }>, ipAddress?: string) {
    
    const group = await this.getById(groupId);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can update this group.', 403);

    // Never let the Owner shrink capacity below the members already active
    // in the group — that would silently strand people already admitted.
    if (data.maximum_members !== undefined) {
      const activeCount = await this.countActiveMembers(groupId);
      if (data.maximum_members < activeCount) {
        throw new AppError(
          `This group already has ${activeCount} active members — the maximum can't be set below that.`,
          400,
          'GROUP_MEMBER_LIMIT_BELOW_ACTIVE',
        );
      }
    }

    // payout_day's valid range depends on contribution_frequency, which is
    // fixed at creation and never editable here — re-validate against the
    // group's existing (unchanged) frequency rather than trusting the caller.
    if (data.payout_day !== undefined) {
      const bounds = payoutDayBounds(group.contribution_frequency);
      if (bounds && (data.payout_day < bounds.min || data.payout_day > bounds.max)) {
        throw new AppError(
          `payout_day must be between ${bounds.min} and ${bounds.max} for ${group.contribution_frequency} groups.`,
          400,
          'INVALID_PAYOUT_DAY',
        );
      }
    }

    await db.update(schema.savingsGroups).set(data).where(eq(schema.savingsGroups.id, groupId));
    await createAuditLog({ userId: leaderId, action: 'GROUP_UPDATED', entity: 'savings_groups', entityId: groupId, ipAddress });

    // A permanent contribution-amount or payout-date change materially
    // affects every member's expectations going forward — notify everyone,
    // not just the Owner who made the change.
    if (data.contribution_amount !== undefined || data.payout_day !== undefined || data.maximum_members !== undefined || data.min_trust_score !== undefined) {
      const activeMembers = await db.select({ id: schema.users.id, email: schema.users.email })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.memberships.user_id, schema.users.id))
        .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
      for (const member of activeMembers) {
        if (member.id === leaderId) continue;
        await notificationService.create({
          userId: member.id, type: 'group_settings_updated',
          title: 'Group Settings Updated',
          message: `"${group.name}"'s settings were updated by the group leader — check the group dashboard for the latest contribution amount, payout date, and membership rules.`,
        });
        await sendGroupSettingsUpdatedEmail(member.email, group.name);
      }
    }

    return this.getById(groupId);
  },

  /**
   * "Start Group" — the Creator-triggered Draft → Active transition
   * (Section 1). Requires at least GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH
   * verified active members. Assigns payout rotation slots: the Organiser
   * (group leader) always takes position 1, the rest ordered by Trust
   * Score (highest first, ties broken by earliest join date) — this
   * guarantees the first 3 slots are always the Organiser or the
   * highest-Trust-Score members, exactly as required, while giving every
   * later slot a principled, non-arbitrary order too.
   */
  /**
   * Re-sort every active member's rotation_order — leader always slot 1,
   * everyone else by Trust Score (highest first, ties by earliest join
   * date). Shared by activateGroup (applied once, at launch) and
   * rotationService.advance() (re-applied at the start of every subsequent
   * full rotation — Section 15.C: "the first 3 payout slots reserved for
   * Organiser/highest Trust Score re-applies at the start of each new
   * cycle, not just once").
   */
  async reorderRotationByTrustScore(groupId: string, leaderId: string): Promise<number> {
    const activeMembers = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    if (!activeMembers.length) return 0;

    const memberUserIds = activeMembers.map(m => m.user_id);
    const userRows = await db.select({ id: schema.users.id, trust_score: schema.users.trust_score })
      .from(schema.users).where(inArray(schema.users.id, memberUserIds));
    const trustById = new Map(userRows.map(u => [u.id, u.trust_score]));

    const leaderMembership = activeMembers.find(m => m.user_id === leaderId);
    const others = activeMembers
      .filter(m => m.user_id !== leaderId)
      .sort((a, b) => (trustById.get(b.user_id) ?? 0) - (trustById.get(a.user_id) ?? 0)
        || new Date(a.join_date).getTime() - new Date(b.join_date).getTime());
    const ordered = leaderMembership ? [leaderMembership, ...others] : others;

    for (let i = 0; i < ordered.length; i++) {
      await db.update(schema.memberships).set({ rotation_order: i + 1 }).where(eq(schema.memberships.id, ordered[i].id));
    }
    return ordered.length;
  },

  async activateGroup(groupId: string, leaderId: string, ipAddress?: string) {
    const group = await this.getById(groupId);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can start this group.', 403);
    if (group.status !== 'draft') {
      throw new AppError(
        group.status === 'active' ? 'This group has already been started.' : `This group can't be started from its current status (${group.status}).`,
        400,
      );
    }

    const activeMembers = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    if (activeMembers.length < GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH) {
      throw new AppError(
        `You need at least ${GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH} verified members to start this group — you currently have ${activeMembers.length}.`,
        400,
        'GROUP_MIN_MEMBERS_NOT_MET',
      );
    }

    const memberUserIds = activeMembers.map(m => m.user_id);
    await this.reorderRotationByTrustScore(groupId, leaderId);

    await db.update(schema.savingsGroups).set({
      status: 'active', activated_at: new Date(),
      current_rotation_position: 1, current_cycle: 1,
    }).where(eq(schema.savingsGroups.id, groupId));

    await createAuditLog({ userId: leaderId, action: 'GROUP_ACTIVATED', entity: 'savings_groups', entityId: groupId, ipAddress, metadata: { memberCount: activeMembers.length } });

    const memberUsers = await db.select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users).where(inArray(schema.users.id, memberUserIds));
    for (const u of memberUsers) {
      await notificationService.create({
        userId: u.id, type: 'group_activated',
        title: 'Group Started',
        message: `"${group.name}" has started — contributions and payout rotation are now live.`,
      });
      await sendGroupActivatedEmail(u.email, group.name);
    }

    // Section D.2 — every member just became verified in an active (3+
    // member) group for the first time this cycle; resume any deferred
    // subscription billing immediately rather than waiting for the nightly
    // safety-net job.
    await this.reconcileMemberBilling(memberUserIds);

    return this.getById(groupId);
  },

  /**
   * Owner-triggered "Close Group" for an *indefinite* group — schedules
   * closure for the moment the in-progress rotation finishes (never mid-
   * rotation). rotationService.advance() performs the actual close once
   * every active member has received this rotation's payout.
   */
  async scheduleClosure(groupId: string, leaderId: string, ipAddress?: string) {
    const group = await this.getById(groupId);
    if (group.leader_id !== leaderId) throw new AppError('Only the group leader can close this group.', 403);
    if (group.status !== 'active' && group.status !== 'suspended') {
      throw new AppError(`This group can't be closed from its current status (${group.status}).`, 400);
    }
    if (group.group_duration_type !== 'indefinite') {
      throw new AppError('This group already has a fixed lifecycle length and will close automatically — there\'s nothing to schedule.', 400);
    }
    if (group.closure_scheduled) {
      return { ...await this.getById(groupId), already_scheduled: true };
    }

    await db.update(schema.savingsGroups).set({ closure_scheduled: true }).where(eq(schema.savingsGroups.id, groupId));
    await createAuditLog({ userId: leaderId, action: 'GROUP_CLOSURE_SCHEDULED', entity: 'savings_groups', entityId: groupId, ipAddress });
    await notificationService.create({
      userId: leaderId, type: 'group_closure_scheduled',
      title: 'Closure Scheduled',
      message: `"${group.name}" will close automatically once the current payout rotation finishes — every member will be notified by email at that point.`,
    });

    return { ...await this.getById(groupId), already_scheduled: false };
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
    if (group.status === 'closed' || group.status === 'expired') {
      throw new AppError('This group is no longer accepting members.', 400);
    }
    // Only the group's own leader may invite people into it — otherwise any
    // authenticated user could send PadiHub-branded invitations to arbitrary
    // email addresses on behalf of someone else's group.
    if (group.leader_id !== invitedBy) {
      throw new AppError('Only the group leader can invite members to this group.', 403, 'NOT_GROUP_LEADER');
    }
    const activeCount = await this.countActiveMembers(groupId);
    if (activeCount >= group.maximum_members) {
      throw new AppError(
        `This group is already at its maximum of ${group.maximum_members} members.`,
        400,
        'GROUP_FULL',
      );
    }

    // If the invited address already belongs to a registered PadiHub member,
    // block the invite outright when their account is registered in a
    // different country to this group — groups are strictly single-country
    // (Stripe/GBP for GB, Flutterwave/NGN for NG) and can never mix members
    // across the two payment rails. Brand-new invitees (no account yet)
    // aren't checked here — they choose their own country at sign-up, and
    // the same guard re-applies in membershipService.join() when they
    // actually accept the invite.
    if (email) {
      const invitedUserRows = await db.select({ country: schema.users.country })
        .from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase())).limit(1);
      if (invitedUserRows.length && invitedUserRows[0].country !== group.country) {
        throw new AppError(
          `${email} is registered in ${countryDisplayName(invitedUserRows[0].country)}, but this group is based in ${countryDisplayName(group.country)}. Groups can only include members from the same country.`,
          400,
          'GROUP_COUNTRY_MISMATCH',
        );
      }
    }

    const token = uuidv4();
    const id = uuidv4();
    await db.insert(schema.groupInvitations).values({
      id, group_id: groupId, invited_by: invitedBy,
      email, token,
      expires_at: new Date(Date.now() + INVITE_TTL),
      accepted: false,
    });

    await createAuditLog({ userId: invitedBy, action: 'INVITATION_SENT', entity: 'savings_groups', entityId: groupId });

    // Send invitation email if an email address was provided. The link points
    // at the group's own join page (with the invite token attached) so an
    // existing member can log in and join straight away, and a brand-new
    // invitee is offered sign-up and walked through the onboarding steps
    // before the join completes.
    const invitePath = `/savings-groups/${groupId}/join?invite_token=${token}`;
    if (email) {
      const expiresAt = new Date(Date.now() + INVITE_TTL).toLocaleDateString('en-GB');
      const inviteLink = `${process.env.APP_URL ?? 'https://padihub.com'}${invitePath}`;
      const inviterRows = await db.select({ first_name: schema.users.first_name, last_name: schema.users.last_name })
        .from(schema.users).where(eq(schema.users.id, invitedBy)).limit(1);
      const inviterName = inviterRows.length ? `${inviterRows[0].first_name} ${inviterRows[0].last_name}` : 'A PadiHub member';
      await sendGroupInvitationEmail(email, group.name, inviteLink, expiresAt, inviterName);
    }
    return { token, inviteLink: invitePath };
  },

  /**
   * Invite several people at once — used by the create-group wizard, which
   * collects a comma-separated list of email addresses. One failing address
   * must never abort the rest, so each result is reported individually.
   */
  async createInvitations(groupId: string, invitedBy: string, emails: string[]) {
    const unique = [...new Set(
      emails.map(email => email.trim().toLowerCase()).filter(Boolean),
    )];

    const sent: string[] = [];
    const failed: { email: string; reason: string }[] = [];

    for (const email of unique) {
      try {
        await this.createInvitation(groupId, invitedBy, email);
        sent.push(email);
      } catch (err) {
        failed.push({ email, reason: err instanceof AppError ? err.message : 'Could not send this invitation.' });
      }
    }

    return { sent, failed, invited_count: sent.length };
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
   * Fallback lookup used by membershipService.join(): finds the most recent
   * still-unaccepted invitation the leader sent to this exact email address
   * for this group, regardless of whether its token has expired or the
   * caller even has the token in hand (e.g. they're clicking "Join" straight
   * from the group page rather than the emailed link, or the 7-day link
   * expired while they were completing onboarding — payment, subscription,
   * and identity verification can easily take longer than that). A leader's
   * invite is a standing vetting decision, not a one-shot ticket, so an
   * expired token must never force an already-invited person through the
   * Trust-Score-gated self-request/approval flow instead.
   */
  async findOpenInvitationForEmail(groupId: string, email?: string | null) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    const rows = await db.select().from(schema.groupInvitations)
      .where(and(eq(schema.groupInvitations.group_id, groupId), eq(schema.groupInvitations.accepted, false)));
    const matches = rows.filter(row => (row.email ?? '').trim().toLowerCase() === normalized);
    if (!matches.length) return null;
    return matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  },

  /**
   * Every still-open (unaccepted) invitation addressed to this email, across
   * ALL groups — powers the "you have a pending group invitation" banner
   * that must stay visible on the invitee's dashboard/profile throughout
   * signup and onboarding (Section 0.1), so they never lose sight of it
   * once payment, subscription, and identity verification are complete.
   */
  async getPendingInvitationsForEmail(email?: string | null) {
    if (!email) return [];
    const normalized = email.trim().toLowerCase();
    const rows = await db.select({
      token:      schema.groupInvitations.token,
      group_id:   schema.groupInvitations.group_id,
      email:      schema.groupInvitations.email,
      expires_at: schema.groupInvitations.expires_at,
      created_at: schema.groupInvitations.created_at,
      group_name: schema.savingsGroups.name,
      group_status: schema.savingsGroups.status,
    })
      .from(schema.groupInvitations)
      .innerJoin(schema.savingsGroups, eq(schema.groupInvitations.group_id, schema.savingsGroups.id))
      .where(eq(schema.groupInvitations.accepted, false));

    return rows
      .filter(row => (row.email ?? '').trim().toLowerCase() === normalized)
      .filter(row => row.group_status !== 'closed' && row.group_status !== 'expired')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(row => ({
        token: row.token,
        group_id: row.group_id,
        group_name: row.group_name,
        expired: new Date() > row.expires_at,
        join_link: `/savings-groups/${row.group_id}/join?invite_token=${row.token}`,
      }));
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
