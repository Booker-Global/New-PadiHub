import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { assertPaymentSetupComplete } from './paymentEligibilityService.js';
import { INVITE_TTL, GROUP_DEFAULT_STRIKE_THRESHOLD, GROUP_DEFAULT_SUSPENSION_THRESHOLD, GROUP_DEFAULT_VOTING_THRESHOLD } from '../lib/constants.js';
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

  async create(data: {
    name: string; description?: string; leader_id: string;
    country: string; currency: string;
    contribution_amount: string; contribution_frequency: 'daily' | 'weekly' | 'monthly';
    payout_day?: number;
    maximum_members: number; rotation_method: 'manual' | 'random';
    strike_threshold?: number; suspension_threshold?: number;
    voting_threshold?: number; allow_payout_swaps?: boolean;
  }, ipAddress?: string) {
    // Identity verification is required to create a group
    const leaderRows = await db.select({
      identity_verified: schema.users.identity_verified,
      country: schema.users.country,
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
    // payment-method + payout-destination gate applies to them too.
    await assertPaymentSetupComplete(data.leader_id);

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
    name: string; description: string; maximum_members: number;
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
};
