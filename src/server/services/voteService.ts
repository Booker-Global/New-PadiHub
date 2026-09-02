import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { GOVERNANCE_VOTE_DEADLINE_MS } from '../lib/constants.js';
import { sendGovernanceVoteEmail, sendVoteOutcomeEmail } from '../integrations/email/emailService.js';

const APP_URL = process.env.APP_URL ?? 'https://padihub.com';

type ProposalType = 'payout_swap' | 'exceptional_request' | 'member_admission' | 'contribution_claim';
type VoteRow = typeof schema.votes.$inferSelect;

/** Human-readable subject line for each governance vote email, by proposal type. */
function subjectFor(type: ProposalType): string {
  switch (type) {
    case 'member_admission':   return 'New Member Admission — Vote Required';
    case 'contribution_claim': return 'Contribution Increase Request — Vote Required';
    case 'payout_swap':        return 'Payout Swap Request';
    default:                   return 'Vote Required';
  }
}

export const voteService = {
  async getForGroup(groupId: string) {
    return db.select().from(schema.votes).where(eq(schema.votes.group_id, groupId));
  },

  /**
   * Propose swapping payout rotation positions with another member of the
   * same group. This is a direct 1:1 accept/decline matter (Section 4) —
   * only the target member's response decides the outcome, emailed to them
   * with accept/decline links; on decline or 48h timeout, nothing changes.
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

    return this.create({
      group_id:           groupId,
      proposal_type:      'payout_swap',
      proposer_id:        proposerId,
      proposal_text:      note?.trim() || 'Requesting to swap payout rotation position with another member.',
      target_member_id:   targetMemberId,
      requires_unanimous: false,
      voting_deadline:    new Date(Date.now() + GOVERNANCE_VOTE_DEADLINE_MS),
    }, ipAddress);
  },

  /**
   * Group leader kicks off a unanimous vote to admit a prospective new
   * member who already has a pending join request (Section 4). Every active
   * member must accept within 48 hours; the proposer (the leader, who
   * already vetted the request) is auto-approved. A single decline or a
   * timeout invalidates the invite.
   */
  async proposeMemberAdmission(groupId: string, proposerId: string, membershipId: string, ipAddress?: string) {
    const membershipRows = await db.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)).limit(1);
    if (!membershipRows.length) throw new AppError('Join request not found.', 404);
    const membership = membershipRows[0];
    if (membership.group_id !== groupId) throw new AppError('This join request does not belong to this group.', 400);
    if (membership.status !== 'pending') throw new AppError('This join request has already been decided.', 400);

    const groupRows = await db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRows.length) throw new AppError('Group not found.', 404);

    const inviteeRows = await db.select({ first_name: schema.users.first_name, last_name: schema.users.last_name })
      .from(schema.users).where(eq(schema.users.id, membership.user_id)).limit(1);
    const inviteeName = inviteeRows.length ? `${inviteeRows[0].first_name} ${inviteeRows[0].last_name}` : 'this prospective member';

    return this.create({
      group_id:           groupId,
      proposal_type:      'member_admission',
      proposer_id:        proposerId,
      proposal_text:      `Admit ${inviteeName} as a new member of "${groupRows[0].name}"? All active members must agree — a single decline or a 48-hour timeout will invalidate the invite.`,
      metadata:           { membership_id: membershipId, invitee_user_id: membership.user_id },
      requires_unanimous: true,
      voting_deadline:    new Date(Date.now() + GOVERNANCE_VOTE_DEADLINE_MS),
    }, ipAddress, { autoApproveProposer: true });
  },

  /**
   * Propose a temporary contribution "claim" (unanimous vote, Section 4).
   * If approved, the increased amount applies until every member has
   * received a payout at that level in the current cycle, then reverts.
   */
  async proposeContributionClaim(groupId: string, proposerId: string, newAmount: number, ipAddress?: string) {
    if (!(newAmount > 0)) throw new AppError('The claimed contribution amount must be greater than zero.', 400);

    const groupRows = await db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRows.length) throw new AppError('Group not found.', 404);
    const group = groupRows[0];

    const memberRows = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    if (!memberRows.some(m => m.user_id === proposerId)) throw new AppError('You are not an active member of this group.', 403);

    return this.create({
      group_id:           groupId,
      proposal_type:      'contribution_claim',
      proposer_id:        proposerId,
      proposal_text:      `Temporarily raise "${group.name}"'s contribution amount to ${newAmount} until every member has received a payout at that level this cycle, then revert to ${group.contribution_amount}. All active members must agree — a single decline or a 48-hour timeout cancels this request.`,
      metadata:           { claimed_amount: newAmount },
      requires_unanimous: true,
      voting_deadline:    new Date(Date.now() + GOVERNANCE_VOTE_DEADLINE_MS),
    }, ipAddress, { autoApproveProposer: true });
  },

  /** Swaps rotation_order between the proposer and the target member once a payout_swap vote is approved. */
  async executePayoutSwapIfApproved(vote: VoteRow) {
    if (vote.proposal_type !== 'payout_swap' || !vote.target_member_id) return;
    const targetMemberId = vote.target_member_id;

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
        message: 'Your payout rotation swap was accepted — your payout position has been updated.',
      });
    }
  },

  async create(data: {
    group_id: string; proposal_type: ProposalType;
    proposer_id: string; proposal_text: string; voting_deadline: Date;
    target_member_id?: string; metadata?: Record<string, unknown>; requires_unanimous?: boolean;
  }, ipAddress?: string, opts?: { autoApproveProposer?: boolean }) {
    const id = uuidv4();
    await db.insert(schema.votes).values({
      id,
      group_id:           data.group_id,
      proposal_type:      data.proposal_type,
      proposer_id:        data.proposer_id,
      proposal_text:      data.proposal_text,
      target_member_id:   data.target_member_id ?? null,
      metadata:           data.metadata ?? null,
      requires_unanimous: data.requires_unanimous ?? false,
      voting_deadline:    data.voting_deadline,
      status:             'open',
    });

    if (opts?.autoApproveProposer) {
      await db.insert(schema.voteResponses).values({ id: uuidv4(), vote_id: id, member_id: data.proposer_id, decision: 'approve' });
    }

    const groupRows = await db.select({ name: schema.savingsGroups.name }).from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, data.group_id)).limit(1);
    const groupName = groupRows.length ? groupRows[0].name : 'your group';

    // Who needs to be asked to respond: the single target member (1:1
    // matters like payout_swap), or every active member except the
    // auto-approved proposer (unanimous / legacy percentage votes).
    let recipientIds: string[];
    if (data.target_member_id) {
      recipientIds = [data.target_member_id];
    } else {
      const members = await db.select().from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, data.group_id), eq(schema.memberships.status, 'active')));
      recipientIds = members.map(m => m.user_id).filter(uid => !(opts?.autoApproveProposer && uid === data.proposer_id));
    }

    if (recipientIds.length) {
      const recipients = await db.select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users).where(inArray(schema.users.id, recipientIds));

      for (const r of recipients) {
        await notificationService.create({
          userId: r.id, type: 'vote_required',
          title: 'Vote Required',
          message: `A new vote has been raised in your group. Please respond before the deadline.`,
        });

        // Email-based accept/decline for the new governance flows (Section
        // 4); the older percentage-threshold 'exceptional_request' keeps
        // its existing in-app-only notification.
        if (data.proposal_type !== 'exceptional_request') {
          const token = crypto.randomBytes(32).toString('hex');
          await db.insert(schema.voteEmailTokens).values({ id: uuidv4(), vote_id: id, member_id: r.id, token });
          const acceptUrl = `${APP_URL}/api/votes/respond?token=${token}&decision=approve`;
          const declineUrl = `${APP_URL}/api/votes/respond?token=${token}&decision=reject`;
          await sendGovernanceVoteEmail(
            r.email, groupName, subjectFor(data.proposal_type), data.proposal_text,
            data.voting_deadline.toISOString(), acceptUrl, declineUrl,
          );
        }
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
    if (new Date() > vote.voting_deadline) {
      await this._tallyAndMaybeClose(vote, true);
      throw new AppError('Voting deadline has passed.', 400);
    }
    if (vote.target_member_id && memberId !== vote.target_member_id) {
      throw new AppError('Only the invited member can respond to this vote.', 403);
    }

    const existing = await db.select().from(schema.voteResponses)
      .where(and(eq(schema.voteResponses.vote_id, voteId), eq(schema.voteResponses.member_id, memberId))).limit(1);
    if (existing.length) throw new AppError('You have already voted.', 409);

    await db.insert(schema.voteResponses).values({
      id: uuidv4(), vote_id: voteId, member_id: memberId, decision,
    });
    await createAuditLog({ userId: memberId, action: 'VOTE_SUBMITTED', entity: 'votes', entityId: voteId, ipAddress });

    if (vote.target_member_id) {
      // Direct 1:1 matter — the target's single response decides it.
      await this._closeVote(vote, decision === 'approve' ? 'approved' : 'rejected');
    } else {
      await this._tallyAndMaybeClose(vote);
    }
    return true;
  },

  /**
   * Consume a one-click email accept/decline link (Section 4/8) — the token
   * itself is the authentication, so this works without the member being
   * logged in.
   */
  async respondViaToken(token: string, decision: 'approve' | 'reject') {
    const tokenRows = await db.select().from(schema.voteEmailTokens).where(eq(schema.voteEmailTokens.token, token)).limit(1);
    if (!tokenRows.length) throw new AppError('This vote link is invalid or has expired.', 404);
    const tokenRow = tokenRows[0];
    if (tokenRow.responded_at) throw new AppError('This vote link has already been used.', 409, 'VOTE_LINK_USED');

    const voteRows = await db.select().from(schema.votes).where(eq(schema.votes.id, tokenRow.vote_id)).limit(1);
    if (!voteRows.length) throw new AppError('Vote not found.', 404);
    if (voteRows[0].status !== 'open') throw new AppError('This vote has already been decided.', 400, 'VOTE_ALREADY_CLOSED');

    await db.update(schema.voteEmailTokens).set({ responded_at: new Date() }).where(eq(schema.voteEmailTokens.id, tokenRow.id));

    try {
      await this.castVote(tokenRow.vote_id, tokenRow.member_id, decision);
    } catch (e) {
      if (e instanceof AppError && (e.statusCode === 409 || e.statusCode === 400)) {
        return { success: true, message: 'Your response was already recorded, or this vote has closed.' };
      }
      throw e;
    }
    return { success: true, message: `Your ${decision === 'approve' ? 'acceptance' : 'decline'} has been recorded.` };
  },

  async forceClose(voteId: string, userId: string, ipAddress?: string) {
    const voteRows = await db.select().from(schema.votes).where(eq(schema.votes.id, voteId)).limit(1);
    if (!voteRows.length) throw new AppError('Vote not found.', 404);
    const vote = voteRows[0];
    if (vote.status !== 'open') throw new AppError('Vote is already closed.', 400);

    if (vote.target_member_id) {
      await this._closeVote(vote, 'expired');
      await createAuditLog({ userId, action: 'VOTE_FORCE_CLOSED', entity: 'votes', entityId: voteId, ipAddress, metadata: { result: 'expired' } });
      return { status: 'expired', approvals: 0, total: 1 };
    }

    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.status, 'active')));
    const responses = await db.select().from(schema.voteResponses).where(eq(schema.voteResponses.vote_id, voteId));
    const approvals = responses.filter(r => r.decision === 'approve').length;
    const total = members.length;

    let newStatus: 'approved' | 'rejected';
    if (vote.requires_unanimous) {
      newStatus = (approvals >= total && total > 0) ? 'approved' : 'rejected';
    } else {
      const groupRows = await db.select({ voting_threshold: schema.savingsGroups.voting_threshold })
        .from(schema.savingsGroups).where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
      const threshold = groupRows.length ? groupRows[0].voting_threshold : 51;
      const pct = total > 0 ? (approvals / total) * 100 : 0;
      newStatus = pct >= threshold ? 'approved' : 'rejected';
    }

    await this._closeVote(vote, newStatus);
    await createAuditLog({ userId, action: 'VOTE_FORCE_CLOSED', entity: 'votes', entityId: voteId, ipAddress, metadata: { result: newStatus } });
    return { status: newStatus, approvals, total };
  },

  /** Legacy entry point kept for backward compatibility — resolves via the current response tally. */
  async checkAndClose(voteId: string, _groupId: string, _deadline: Date) {
    const voteRows = await db.select().from(schema.votes).where(eq(schema.votes.id, voteId)).limit(1);
    if (!voteRows.length) return;
    await this._tallyAndMaybeClose(voteRows[0]);
  },

  /**
   * Central tally/close logic for group-wide votes (unanimous or the
   * legacy percentage-threshold kind). 1:1 target_member_id votes are
   * decided directly in castVote/forceClose and only reach here for
   * deadline-expiry handling.
   */
  async _tallyAndMaybeClose(vote: VoteRow, deadlinePassedOverride?: boolean) {
    if (vote.status !== 'open') return;
    const deadlinePassed = deadlinePassedOverride ?? (new Date() > vote.voting_deadline);

    if (vote.target_member_id) {
      if (deadlinePassed) await this._closeVote(vote, 'expired');
      return;
    }

    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.status, 'active')));
    const responses = await db.select().from(schema.voteResponses).where(eq(schema.voteResponses.vote_id, vote.id));
    const total = members.length;
    const approvals = responses.filter(r => r.decision === 'approve').length;
    const hasReject = responses.some(r => r.decision === 'reject');

    if (vote.requires_unanimous) {
      if (hasReject) { await this._closeVote(vote, 'rejected'); return; }
      if (total > 0 && approvals >= total) { await this._closeVote(vote, 'approved'); return; }
      if (deadlinePassed) await this._closeVote(vote, 'expired');
      return;
    }

    const groupRows = await db.select({ voting_threshold: schema.savingsGroups.voting_threshold })
      .from(schema.savingsGroups).where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
    if (!groupRows.length) return;
    const threshold = groupRows[0].voting_threshold;
    const pct = total > 0 ? (approvals / total) * 100 : 0;
    if (pct >= threshold) { await this._closeVote(vote, 'approved'); return; }
    if (deadlinePassed) await this._closeVote(vote, responses.length === total ? 'rejected' : 'expired');
  },

  /**
   * Finalizes a vote: persists the new status, executes the type-specific
   * outcome (payout swap execution, member admission/rejection, contribution
   * claim activation), and notifies everyone involved. Idempotent — a vote
   * already closed is left untouched.
   */
  async _closeVote(vote: VoteRow, newStatus: 'approved' | 'rejected' | 'expired') {
    const fresh = await db.select().from(schema.votes).where(eq(schema.votes.id, vote.id)).limit(1);
    if (!fresh.length || fresh[0].status !== 'open') return;
    await db.update(schema.votes).set({ status: newStatus }).where(eq(schema.votes.id, vote.id));
    const closedVote: VoteRow = { ...vote, status: newStatus };

    await createAuditLog({ action: 'VOTE_CLOSED', entity: 'votes', entityId: vote.id, metadata: { result: newStatus, proposal_type: vote.proposal_type } });

    try {
      if (vote.proposal_type === 'payout_swap') {
        await this._resolvePayoutSwap(closedVote, newStatus);
      } else if (vote.proposal_type === 'member_admission') {
        await this._resolveMemberAdmission(closedVote, newStatus);
      } else if (vote.proposal_type === 'contribution_claim') {
        await this._resolveContributionClaim(closedVote, newStatus);
      } else {
        const members = await db.select().from(schema.memberships)
          .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.status, 'active')));
        for (const m of members) {
          await notificationService.create({
            userId: m.user_id, type: 'vote_closed',
            title: 'Vote Closed',
            message: `A vote in your group has been ${newStatus}.`,
          });
        }
      }
    } catch (err) {
      // A failed side-effect (e.g. an email provider error) must never leave
      // the vote itself unresolved — it's already been persisted above.
      console.error('[voteService] Failed to fully process vote outcome side-effects:', err);
    }
  },

  async _resolvePayoutSwap(vote: VoteRow, status: 'approved' | 'rejected' | 'expired') {
    if (status === 'approved') await this.executePayoutSwapIfApproved(vote);
    if (!vote.target_member_id) return;

    const groupRows = await db.select({ name: schema.savingsGroups.name }).from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
    const groupName = groupRows.length ? groupRows[0].name : 'your group';

    const parties = await db.select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users).where(inArray(schema.users.id, [vote.proposer_id, vote.target_member_id]));
    const outcomeText = status === 'approved'
      ? 'The payout swap was accepted — both members\u2019 payout positions have been updated.'
      : 'The payout swap request was declined or timed out — nothing has changed.';
    for (const p of parties) {
      await sendVoteOutcomeEmail(p.email, groupName, status === 'approved' ? 'Payout Swap Accepted' : 'Payout Swap Not Completed', outcomeText);
    }
  },

  async _resolveMemberAdmission(vote: VoteRow, status: 'approved' | 'rejected' | 'expired') {
    const meta = vote.metadata as { membership_id?: string } | null;
    if (!meta?.membership_id) return;
    // Dynamic import avoids a circular import at module-load time
    // (membershipService also imports voteService to start admission votes).
    const { membershipService } = await import('./membershipService.js');
    if (status === 'approved') {
      await membershipService._activatePendingMembership(meta.membership_id);
    } else {
      await membershipService._invalidatePendingMembership(meta.membership_id);
    }
    // _activatePendingMembership/_invalidatePendingMembership already email
    // the invitee and (on approval) the rest of the group.
  },

  async _resolveContributionClaim(vote: VoteRow, status: 'approved' | 'rejected' | 'expired') {
    const meta = vote.metadata as { claimed_amount?: number } | null;
    const groupRows = await db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
    if (!groupRows.length) return;
    const group = groupRows[0];

    if (status === 'approved' && meta?.claimed_amount) {
      // Applies for the rest of the current cycle only — rotationService
      // clears claim_active_amount/claim_reverts_after_cycle once
      // current_cycle advances past this value, reverting to the base rate.
      await db.update(schema.savingsGroups).set({
        claim_active_amount:       String(meta.claimed_amount),
        claim_reverts_after_cycle: group.current_cycle,
      }).where(eq(schema.savingsGroups.id, vote.group_id));
    }

    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.status, 'active')));
    if (!members.length) return;
    const recipients = await db.select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users).where(inArray(schema.users.id, members.map(m => m.user_id)));

    const message = status === 'approved'
      ? `Your group approved a temporary contribution increase to ${meta?.claimed_amount}. This applies until every member has received a payout at this level this cycle, then it reverts to ${group.contribution_amount}.`
      : 'The proposed contribution increase was not approved by all members (or the vote timed out) and will not take effect.';
    for (const r of recipients) {
      await sendVoteOutcomeEmail(r.email, group.name, status === 'approved' ? 'Contribution Claim Approved' : 'Contribution Claim Not Approved', message);
      await notificationService.create({
        userId: r.id, type: 'vote_closed',
        title: status === 'approved' ? 'Contribution Claim Approved' : 'Contribution Claim Not Approved',
        message,
      });
    }
  },

  /**
   * Sweeps every open vote past its voting_deadline and forces resolution —
   * without this, a vote nobody responds to would stay 'open' forever.
   * Intended to run from a daily scheduled job.
   */
  async expireOverdueVotes() {
    const openVotes = await db.select().from(schema.votes).where(eq(schema.votes.status, 'open'));
    const now = new Date();
    for (const vote of openVotes) {
      if (vote.voting_deadline > now) continue;
      await this._tallyAndMaybeClose(vote, true);
    }
  },
};
