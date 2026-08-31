import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';

export const voteService = {
  async getForGroup(groupId: string) {
    
    return db.select().from(schema.votes).where(eq(schema.votes.group_id, groupId));
  },

  /**
   * Propose swapping payout rotation positions with another member of the
   * same group. Encodes the target member id in `proposal_text` using a
   * machine-readable marker so `executePayoutSwapIfApproved` can act on it
   * once the group votes to approve.
   */
  async proposePayoutSwap(groupId: string, proposerId: string, targetMemberId: string, note: string | undefined, ipAddress?: string) {
    if (proposerId === targetMemberId) throw new AppError('You cannot propose a swap with yourself.', 400);

    const groupRows = await db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRows.length) throw new AppError('Group not found.', 404);
    if (!groupRows[0].allow_payout_swaps) throw new AppError('Payout swaps are not permitted in this group.', 403);

    const memberRows = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    const proposer = memberRows.find(m => m.user_id === proposerId);
    const target = memberRows.find(m => m.user_id === targetMemberId);
    if (!proposer) throw new AppError('You are not an active member of this group.', 403);
    if (!target) throw new AppError('The selected member is not an active member of this group.', 404);
    if (proposer.rotation_order == null || target.rotation_order == null) {
      throw new AppError('Payout rotation positions are not yet assigned for this group.', 400);
    }

    const votingDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days to vote
    const proposalText = `[[PAYOUT_SWAP:${targetMemberId}]] ${note?.trim() || 'Requesting to swap payout rotation position with another member.'}`;

    return this.create({
      group_id: groupId,
      proposal_type: 'payout_swap',
      proposer_id: proposerId,
      proposal_text: proposalText,
      voting_deadline: votingDeadline,
    }, ipAddress);
  },

  /** Parses the target member id out of a payout_swap vote's proposal_text, if present. */
  _parseSwapTarget(proposalText: string): string | null {
    const match = /^\[\[PAYOUT_SWAP:([^\]]+)\]\]/.exec(proposalText);
    return match ? match[1] : null;
  },

  /** Swaps rotation_order between the proposer and the target member once a payout_swap vote is approved. */
  async executePayoutSwapIfApproved(vote: typeof schema.votes.$inferSelect) {
    if (vote.proposal_type !== 'payout_swap') return;
    const targetMemberId = this._parseSwapTarget(vote.proposal_text);
    if (!targetMemberId) return;

    const [proposerMembership] = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.user_id, vote.proposer_id))).limit(1);
    const [targetMembership] = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.user_id, targetMemberId))).limit(1);
    if (!proposerMembership || !targetMembership) return;
    if (proposerMembership.rotation_order == null || targetMembership.rotation_order == null) return;

    const proposerOrder = proposerMembership.rotation_order;
    const targetOrder = targetMembership.rotation_order;

    await db.update(schema.memberships).set({ rotation_order: targetOrder }).where(eq(schema.memberships.id, proposerMembership.id));
    await db.update(schema.memberships).set({ rotation_order: proposerOrder }).where(eq(schema.memberships.id, targetMembership.id));

    await createAuditLog({
      userId: vote.proposer_id, action: 'PAYOUT_SWAP_EXECUTED', entity: 'memberships', entityId: proposerMembership.id,
      metadata: { group_id: vote.group_id, swapped_with: targetMemberId, proposer_new_order: targetOrder, target_new_order: proposerOrder },
    });

    for (const userId of [vote.proposer_id, targetMemberId]) {
      await notificationService.create({
        userId, type: 'payout_swap_completed',
        title: 'Payout Schedule Updated',
        message: 'Your group approved a payout rotation swap — your payout position has been updated.',
      });
    }
  },

  async create(data: {
    group_id: string; proposal_type: 'payout_swap' | 'exceptional_request';
    proposer_id: string; proposal_text: string; voting_deadline: Date;
  }, ipAddress?: string) {
    
    const id = uuidv4();
    await db.insert(schema.votes).values({
      id,
      group_id:        data.group_id,
      proposal_type:   data.proposal_type,
      proposer_id:     data.proposer_id,
      proposal_text:   data.proposal_text,
      voting_deadline: data.voting_deadline,
      status:          'open',
    });

    // Notify all group members
    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, data.group_id), eq(schema.memberships.status, 'active')));
    for (const m of members) {
      if (m.user_id !== data.proposer_id) {
        await notificationService.create({
          userId: m.user_id, type: 'vote_required',
          title: 'Vote Required',
          message: `A new vote has been raised in your group. Please cast your vote before the deadline.`,
        });
      }
    }

    await createAuditLog({ userId: data.proposer_id, action: 'VOTE_CREATED', entity: 'votes', entityId: id, ipAddress });
    return id;
  },

  async castVote(voteId: string, memberId: string, decision: 'approve' | 'reject', ipAddress?: string) {
    
    const voteRows = await db.select().from(schema.votes).where(eq(schema.votes.id, voteId)).limit(1);
    if (!voteRows.length) throw new AppError('Vote not found.', 404);
    const vote = voteRows[0];
    if (vote.status !== 'open') throw new AppError('Voting is closed.', 400);
    if (new Date() > vote.voting_deadline) throw new AppError('Voting deadline has passed.', 400);

    // Check not already voted
    const existing = await db.select().from(schema.voteResponses)
      .where(and(eq(schema.voteResponses.vote_id, voteId), eq(schema.voteResponses.member_id, memberId))).limit(1);
    if (existing.length) throw new AppError('You have already voted.', 409);

    await db.insert(schema.voteResponses).values({
      id: uuidv4(), vote_id: voteId, member_id: memberId, decision,
    });

    await createAuditLog({ userId: memberId, action: 'VOTE_SUBMITTED', entity: 'votes', entityId: voteId, ipAddress });

    // Check if threshold reached
    await this.checkAndClose(voteId, vote.group_id, vote.voting_deadline);
    return true;
  },

  async forceClose(voteId: string, userId: string, ipAddress?: string) {
    const voteRows = await db.select().from(schema.votes).where(eq(schema.votes.id, voteId)).limit(1);
    if (!voteRows.length) throw new AppError('Vote not found.', 404);
    const vote = voteRows[0];
    if (vote.status !== 'open') throw new AppError('Vote is already closed.', 400);

    // Tally current responses to determine outcome
    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.status, 'active')));
    const responses = await db.select().from(schema.voteResponses)
      .where(eq(schema.voteResponses.vote_id, voteId));

    const groupRows = await db.select({ voting_threshold: schema.savingsGroups.voting_threshold })
      .from(schema.savingsGroups).where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
    const threshold = groupRows.length ? groupRows[0].voting_threshold : 51;

    const approvals = responses.filter(r => r.decision === 'approve').length;
    const total = members.length;
    const pct = total > 0 ? (approvals / total) * 100 : 0;
    const newStatus: 'approved' | 'rejected' = pct >= threshold ? 'approved' : 'rejected';

    await db.update(schema.votes).set({ status: newStatus }).where(eq(schema.votes.id, voteId));

    for (const m of members) {
      await notificationService.create({
        userId: m.user_id, type: 'vote_closed',
        title: 'Vote Closed',
        message: `A vote in your group has been ${newStatus}.`,
      });
    }
    await createAuditLog({ userId, action: 'VOTE_FORCE_CLOSED', entity: 'votes', entityId: voteId, ipAddress, metadata: { result: newStatus } });
    if (newStatus === 'approved') await this.executePayoutSwapIfApproved({ ...vote, status: newStatus });
    return { status: newStatus, approvals, total };
  },

  async checkAndClose(voteId: string, groupId: string, deadline: Date) {
    
    const groupRows = await db.select().from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRows.length) return;
    const threshold = groupRows[0].voting_threshold;

    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    const responses = await db.select().from(schema.voteResponses)
      .where(eq(schema.voteResponses.vote_id, voteId));

    const approvals = responses.filter(r => r.decision === 'approve').length;
    const total = members.length;
    const pct = total > 0 ? (approvals / total) * 100 : 0;

    let newStatus: 'approved' | 'rejected' | 'expired' | null = null;
    if (pct >= threshold) newStatus = 'approved';
    else if (new Date() > deadline) newStatus = responses.length === total ? 'rejected' : 'expired';

    if (newStatus) {
      const voteRows = await db.select().from(schema.votes).where(eq(schema.votes.id, voteId)).limit(1);
      await db.update(schema.votes).set({ status: newStatus }).where(eq(schema.votes.id, voteId));
      for (const m of members) {
        await notificationService.create({
          userId: m.user_id, type: 'vote_closed',
          title: 'Vote Closed',
          message: `A vote in your group has been ${newStatus}.`,
        });
      }
      await createAuditLog({ action: 'VOTE_CLOSED', entity: 'votes', entityId: voteId, metadata: { result: newStatus } });
      if (newStatus === 'approved' && voteRows.length) await this.executePayoutSwapIfApproved({ ...voteRows[0], status: newStatus });
    }
  },
};
