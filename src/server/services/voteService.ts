import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { GOVERNANCE_VOTE_DEADLINE_MS, resolveUserDisplayName } from '../lib/constants.js';
import { sendGovernanceVoteEmail, sendVoteOutcomeEmail } from '../integrations/email/emailService.js';

type ProposalType = 'payout_swap' | 'exceptional_request' | 'member_admission' | 'contribution_claim' | 'member_removal';
type VoteRow = typeof schema.votes.$inferSelect;

/** Human-readable subject line for each governance vote email, by proposal type. */
function subjectFor(type: ProposalType): string {
  switch (type) {
    case 'member_admission':   return 'New Member Admission — Vote Required';
    case 'contribution_claim': return 'Contribution Increase Request — Vote Required';
    case 'payout_swap':        return 'Payout Swap Request';
    case 'member_removal':     return 'Member Removal — Vote Required';
    default:                   return 'Vote Required';
  }
}

export const voteService = {
  async getForGroup(groupId: string, currentUserId?: string) {
    const votes = await db.select().from(schema.votes).where(eq(schema.votes.group_id, groupId));
    
    if (!currentUserId) return votes;
    
    // Fetch vote responses for the current user to determine if they've already voted
    const responses = await db.select().from(schema.voteResponses)
      .where(eq(schema.voteResponses.member_id, currentUserId));
    const responsesByVoteId = new Map(responses.map(r => [r.vote_id, r.decision]));
    
    // Add user's vote response to each vote (if they voted)
    return votes.map(vote => ({
      ...vote,
      user_response: responsesByVoteId.get(vote.id) || null,
    }));
  },

  /**
   * Propose swapping payout rotation positions with another member of the
   * same group. This is a direct 1:1 accept/decline matter (Section 4) —
   * only the target member's response decides the outcome, emailed to them
   * with a link to review and respond from the group's Governance section;
   * on decline or 48h timeout, nothing changes.
   */
  async proposePayoutSwap(groupId: string, proposerId: string, targetMemberId: string, note: string | undefined, ipAddress?: string) {
    if (proposerId === targetMemberId) throw new AppError('You cannot propose a swap with yourself.', 400);

    const groupRows = await db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRows.length) throw new AppError('Group not found.', 404);
    const group = groupRows[0];
    if (!group.allow_payout_swaps) throw new AppError('Payout swaps are not permitted in this group.', 403);

    const memberRows = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    const proposer = memberRows.find(m => m.user_id === proposerId);
    const target = memberRows.find(m => m.user_id === targetMemberId);
    if (!proposer) throw new AppError('You are not an active member of this group.', 403);
    if (!target) throw new AppError('The selected member is not an active member of this group.', 404);
    if (proposer.rotation_order == null || target.rotation_order == null) {
      throw new AppError('Payout rotation positions are not yet assigned for this group.', 400);
    }

    const userRows = await db.select({ id: schema.users.id, first_name: schema.users.first_name, last_name: schema.users.last_name, display_name: schema.users.display_name })
      .from(schema.users).where(inArray(schema.users.id, [proposerId, targetMemberId]));
    const proposerName = resolveUserDisplayName(userRows.find(u => u.id === proposerId));
    const targetName = resolveUserDisplayName(userRows.find(u => u.id === targetMemberId));

    return this.create({
      group_id:           groupId,
      proposal_type:      'payout_swap',
      proposer_id:        proposerId,
      proposal_text:      `${proposerName} (payout position ${proposer.rotation_order}) wants to swap payout rotation positions with ${targetName} (payout position ${target.rotation_order}) in "${group.name}".${note?.trim() ? ` Note: ${note.trim()}` : ''}`,
      target_member_id:   targetMemberId,
      requires_unanimous: false,
      voting_deadline:    new Date(Date.now() + GOVERNANCE_VOTE_DEADLINE_MS),
    }, ipAddress);
  },

  /**
   * Find the currently-open member_admission vote (if any) tied to a
   * specific pending membership row — used by membershipService to decide
   * whether approving/declining a join request needs to auto-start a vote
   * (none open yet) or just block/clean up an already-open one. `metadata`
   * is a JSON column so this is filtered in JS rather than in SQL.
   */
  async getOpenAdmissionVoteForMembership(membershipId: string): Promise<VoteRow | null> {
    const openVotes = await db.select().from(schema.votes)
      .where(and(eq(schema.votes.proposal_type, 'member_admission'), eq(schema.votes.status, 'open')));
    return openVotes.find(v => (v.metadata as { membership_id?: string } | null)?.membership_id === membershipId) ?? null;
  },

  /**
   * When the group leader directly declines a pending join request that
   * already has an open unanimous admission vote attached (e.g. it was
   * auto-started when the request came in, or manually put to a vote),
   * close that vote as 'rejected' immediately — declining is final, so the
   * vote must not linger open for another 48 hours asking members to keep
   * voting on a decision that's already made.
   */
  async closeOpenAdmissionVoteForMembership(membershipId: string): Promise<void> {
    const vote = await this.getOpenAdmissionVoteForMembership(membershipId);
    if (vote) await this._closeVote(vote, 'rejected');
  },

  /**
   * Group leader kicks off a unanimous vote to admit a prospective new
   * member who already has a pending join request (Section 4). Every
   * active member — including the leader themselves, who is recorded here
   * only as the proposer, not an automatic "approve" — must cast an
   * explicit vote within 48 hours; a single decline or a timeout
   * invalidates the invite.
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
    }, ipAddress);
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

  /**
   * Section 15.D — any member can initiate a unanimous vote to remove a
   * specific OTHER member. The target cannot vote on their own removal, and
   * cannot be targeted at all while they're the group's currently-designated
   * payout recipient for the in-progress cycle (until they've received that
   * cycle's payout) — this stops the vote mechanism being used to strip a
   * payout from someone in good standing.
   */
  async proposeMemberRemoval(groupId: string, proposerId: string, targetMemberId: string, reason: string | undefined, ipAddress?: string) {
    if (proposerId === targetMemberId) throw new AppError('You cannot propose your own removal.', 400);

    const groupRows = await db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRows.length) throw new AppError('Group not found.', 404);
    const group = groupRows[0];

    const memberRows = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    const proposer = memberRows.find(m => m.user_id === proposerId);
    const target = memberRows.find(m => m.user_id === targetMemberId);
    if (!proposer) throw new AppError('You are not an active member of this group.', 403);
    if (!target) throw new AppError('The selected member is not an active member of this group.', 404);

    const currentRotationRows = await db.select().from(schema.rotations)
      .where(and(eq(schema.rotations.group_id, groupId), eq(schema.rotations.cycle_number, group.current_cycle)))
      .limit(1);
    const currentRotation = currentRotationRows[0];
    if (currentRotation && currentRotation.recipient_id === targetMemberId && currentRotation.payout_status !== 'completed') {
      throw new AppError(
        'This member is the current cycle\u2019s designated payout recipient and cannot be targeted by a removal vote until after they receive that payout.',
        403, 'PAYOUT_RECIPIENT_PROTECTED',
      );
    }

    const targetUserRows = await db.select({ first_name: schema.users.first_name, last_name: schema.users.last_name })
      .from(schema.users).where(eq(schema.users.id, targetMemberId)).limit(1);
    const targetName = targetUserRows.length ? `${targetUserRows[0].first_name} ${targetUserRows[0].last_name}`.trim() : 'this member';

    return this.create({
      group_id:           groupId,
      proposal_type:      'member_removal',
      proposer_id:        proposerId,
      proposal_text:      `Remove ${targetName} from "${group.name}"?${reason?.trim() ? ` Reason given: ${reason.trim()}` : ''} Every other active member must agree — a single decline or a 48-hour timeout keeps them in the group.`,
      target_member_id:   targetMemberId,
      requires_unanimous: true,
      voting_deadline:    new Date(Date.now() + GOVERNANCE_VOTE_DEADLINE_MS),
    }, ipAddress, { autoApproveProposer: true });
  },

  /**
   * Swaps rotation_order between the proposer and the target member once a
   * payout_swap vote is approved. If the group's CURRENT cycle already has
   * its `rotations` row created (recipient locked in at cycle-creation time,
   * separate from the live `memberships.rotation_order` used for future
   * cycles), that row's recipient is patched too so "who's next"/"current
   * recipient" reflects the swap immediately rather than only affecting
   * cycles that haven't been created yet. Returns swap details used by
   * _resolvePayoutSwap to notify the rest of the group of the exact change.
   */
  async executePayoutSwapIfApproved(vote: VoteRow): Promise<{
    proposerId: string; targetMemberId: string;
    proposerOrder: number; targetOrder: number;
    currentCycleRecipientSwapped: boolean; currentCycleNumber?: number;
  } | null> {
    if (vote.proposal_type !== 'payout_swap' || !vote.target_member_id) return null;
    const targetMemberId = vote.target_member_id;

    const [proposerMembership] = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.user_id, vote.proposer_id))).limit(1);
    const [targetMembership] = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.user_id, targetMemberId))).limit(1);
    if (!proposerMembership || !targetMembership) return null;
    if (proposerMembership.rotation_order == null || targetMembership.rotation_order == null) return null;

    const proposerOrder = proposerMembership.rotation_order;
    const targetOrder = targetMembership.rotation_order;

    await db.update(schema.memberships).set({ rotation_order: targetOrder }).where(eq(schema.memberships.id, proposerMembership.id));
    await db.update(schema.memberships).set({ rotation_order: proposerOrder }).where(eq(schema.memberships.id, targetMembership.id));

    await createAuditLog({
      userId: vote.proposer_id, action: 'PAYOUT_SWAP_EXECUTED', entity: 'memberships', entityId: proposerMembership.id,
      metadata: { group_id: vote.group_id, swapped_with: targetMemberId, proposer_new_order: targetOrder, target_new_order: proposerOrder },
    });

    // Patch the current, already-created cycle's locked-in recipient (if any)
    // so "Rotation — Who's Next" reflects the swap immediately.
    let currentCycleRecipientSwapped = false;
    let currentCycleNumber: number | undefined;
    const [group] = await db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
    if (group) {
      const [currentRotation] = await db.select().from(schema.rotations).where(and(
        eq(schema.rotations.group_id, vote.group_id),
        eq(schema.rotations.cycle_number, group.current_cycle),
        inArray(schema.rotations.payout_status, ['pending', 'processing']),
      )).limit(1);
      if (currentRotation) {
        currentCycleNumber = currentRotation.cycle_number;
        if (currentRotation.recipient_id === vote.proposer_id) {
          await db.update(schema.rotations).set({ recipient_id: targetMemberId }).where(eq(schema.rotations.id, currentRotation.id));
          currentCycleRecipientSwapped = true;
        } else if (currentRotation.recipient_id === targetMemberId) {
          await db.update(schema.rotations).set({ recipient_id: vote.proposer_id }).where(eq(schema.rotations.id, currentRotation.id));
          currentCycleRecipientSwapped = true;
        }
      }
    }

    for (const userId of [vote.proposer_id, targetMemberId]) {
      await notificationService.create({
        userId, type: 'payout_swap_completed',
        title: 'Payout Schedule Updated',
        message: group
          ? `Your payout rotation swap in "${group.name}" was accepted — your payout position has been updated.`
          : 'Your payout rotation swap was accepted — your payout position has been updated.',
      });
    }

    return { proposerId: vote.proposer_id, targetMemberId, proposerOrder, targetOrder, currentCycleRecipientSwapped, currentCycleNumber };
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

    // A unanimous vote where the auto-approved proposer is the group's ONLY
    // active member (e.g. a brand-new group whose leader is proposing the
    // very first member admission) is already unanimous the instant it's
    // created — resolve it immediately rather than leaving it "open" to
    // wait on votes that will never come, or expiring 48h later.
    if (!(data.target_member_id && data.proposal_type === 'payout_swap')) {
      const freshVote = await db.select().from(schema.votes).where(eq(schema.votes.id, id)).limit(1);
      if (freshVote.length) await this._tallyAndMaybeClose(freshVote[0]);
    }
    const stillOpen = (await db.select({ status: schema.votes.status }).from(schema.votes).where(eq(schema.votes.id, id)).limit(1))[0]?.status === 'open';
    if (!stillOpen) return id;

    const groupRows = await db.select({ name: schema.savingsGroups.name }).from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, data.group_id)).limit(1);
    const groupName = groupRows.length ? groupRows[0].name : 'your group';

    const proposerRows = await db.select({ first_name: schema.users.first_name, last_name: schema.users.last_name, display_name: schema.users.display_name })
      .from(schema.users).where(eq(schema.users.id, data.proposer_id)).limit(1);
    const proposerName = resolveUserDisplayName(proposerRows[0]);

    // Who needs to be asked to respond: the single target member (1:1
    // matters like payout_swap), or every active member except the
    // auto-approved proposer (unanimous / legacy percentage votes) — and,
    // for member_removal specifically, also excluding the target, who
    // cannot vote on their own removal.
    let recipientIds: string[];
    if (data.target_member_id && data.proposal_type === 'payout_swap') {
      recipientIds = [data.target_member_id];
    } else {
      const members = await db.select().from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, data.group_id), eq(schema.memberships.status, 'active')));
      recipientIds = members.map(m => m.user_id).filter(uid => !(opts?.autoApproveProposer && uid === data.proposer_id));
      if (data.proposal_type === 'member_removal' && data.target_member_id) {
        recipientIds = recipientIds.filter(uid => uid !== data.target_member_id);
      }
    }

    if (recipientIds.length) {
      const recipients = await db.select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users).where(inArray(schema.users.id, recipientIds));

      for (const r of recipients) {
        await notificationService.create({
          userId: r.id, type: 'vote_required',
          title: 'Vote Required',
          message: `${data.proposal_text} Please respond before the deadline in "${groupName}".`,
        });

        // Email notice for the new governance flows (Section 4); the older
        // percentage-threshold 'exceptional_request' keeps its existing
        // in-app-only notification. The call-to-action deep-links to the
        // group's page — no one-click email action; the member must log in
        // and cast their real response from the Governance section.
        if (data.proposal_type !== 'exceptional_request') {
          await sendGovernanceVoteEmail(
            r.email, groupName, data.group_id, subjectFor(data.proposal_type), data.proposal_text,
            data.voting_deadline.toISOString(), proposerName,
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
    if (vote.target_member_id && vote.proposal_type === 'payout_swap' && memberId !== vote.target_member_id) {
      throw new AppError('Only the invited member can respond to this vote.', 403);
    }
    if (vote.proposal_type === 'member_removal' && memberId === vote.target_member_id) {
      throw new AppError('You cannot vote on your own removal.', 403);
    }

    const existing = await db.select().from(schema.voteResponses)
      .where(and(eq(schema.voteResponses.vote_id, voteId), eq(schema.voteResponses.member_id, memberId))).limit(1);
    if (existing.length) throw new AppError('You have already voted.', 409);

    await db.insert(schema.voteResponses).values({
      id: uuidv4(), vote_id: voteId, member_id: memberId, decision,
    });
    await createAuditLog({ userId: memberId, action: 'VOTE_SUBMITTED', entity: 'votes', entityId: voteId, ipAddress });

    if (vote.target_member_id && vote.proposal_type === 'payout_swap') {
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

    if (vote.target_member_id && vote.proposal_type === 'payout_swap') {
      await this._closeVote(vote, 'expired');
      await createAuditLog({ userId, action: 'VOTE_FORCE_CLOSED', entity: 'votes', entityId: voteId, ipAddress, metadata: { result: 'expired' } });
      return { status: 'expired', approvals: 0, total: 1 };
    }

    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.status, 'active')));
    const eligibleMembers = vote.proposal_type === 'member_removal' && vote.target_member_id
      ? members.filter(m => m.user_id !== vote.target_member_id)
      : members;
    const responses = await db.select().from(schema.voteResponses).where(eq(schema.voteResponses.vote_id, voteId));
    const approvals = responses.filter(r => r.decision === 'approve').length;
    const total = eligibleMembers.length;

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
   * legacy percentage-threshold kind). 1:1 target_member_id votes
   * (payout_swap) are decided directly in castVote/forceClose and only
   * reach here for deadline-expiry handling.
   */
  async _tallyAndMaybeClose(vote: VoteRow, deadlinePassedOverride?: boolean) {
    if (vote.status !== 'open') return;
    const deadlinePassed = deadlinePassedOverride ?? (new Date() > vote.voting_deadline);

    if (vote.target_member_id && vote.proposal_type === 'payout_swap') {
      if (deadlinePassed) await this._closeVote(vote, 'expired');
      return;
    }

    const members = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.status, 'active')));
    // member_removal excludes the target from the eligible/voting body — they
    // cannot vote on their own removal, so they don't count toward the total.
    const eligibleMembers = vote.proposal_type === 'member_removal' && vote.target_member_id
      ? members.filter(m => m.user_id !== vote.target_member_id)
      : members;
    const responses = await db.select().from(schema.voteResponses).where(eq(schema.voteResponses.vote_id, vote.id));
    const total = eligibleMembers.length;
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
      } else if (vote.proposal_type === 'member_removal') {
        await this._resolveMemberRemoval(closedVote, newStatus);
      } else {
        const members = await db.select().from(schema.memberships)
          .where(and(eq(schema.memberships.group_id, vote.group_id), eq(schema.memberships.status, 'active')));
        const groupRows = await db.select({ name: schema.savingsGroups.name }).from(schema.savingsGroups)
          .where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
        const groupName = groupRows.length ? groupRows[0].name : 'your group';
        for (const m of members) {
          await notificationService.create({
            userId: m.user_id, type: 'vote_closed',
            title: 'Vote Closed',
            message: `A vote in "${groupName}" has been ${newStatus}.`,
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
    const executed = status === 'approved' ? await this.executePayoutSwapIfApproved(vote) : null;
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
      await sendVoteOutcomeEmail(p.email, groupName, vote.group_id, status === 'approved' ? 'Payout Swap Accepted' : 'Payout Swap Not Completed', outcomeText);
    }

    // Every OTHER active group member must also be told a swap went through
    // and exactly what changed in the payout schedule, since it affects
    // everyone's position in the rotation, not just the two parties.
    if (status === 'approved' && executed) {
      await this._notifyOtherMembersOfPayoutSwap(vote.group_id, groupName, executed);
    }
  },

  /**
   * Extracted from _resolvePayoutSwap so the retroactive migration below can
   * send the exact same "other members" notification for swaps that were
   * approved under the old code (which never sent it at all).
   */
  async _notifyOtherMembersOfPayoutSwap(
    groupId: string, groupName: string,
    executed: {
      proposerId: string; targetMemberId: string;
      proposerOrder: number; targetOrder: number;
      currentCycleRecipientSwapped: boolean; currentCycleNumber?: number;
    },
  ): Promise<void> {
    const proposerRow = await db.select({ first_name: schema.users.first_name, last_name: schema.users.last_name, display_name: schema.users.display_name, email: schema.users.email })
      .from(schema.users).where(eq(schema.users.id, executed.proposerId)).limit(1);
    const targetRow = await db.select({ first_name: schema.users.first_name, last_name: schema.users.last_name, display_name: schema.users.display_name, email: schema.users.email })
      .from(schema.users).where(eq(schema.users.id, executed.targetMemberId)).limit(1);
    const proposerName = proposerRow.length ? resolveUserDisplayName(proposerRow[0]) : 'A member';
    const targetName = targetRow.length ? resolveUserDisplayName(targetRow[0]) : 'a member';

    const otherMembers = await db.select({ user_id: schema.memberships.user_id })
      .from(schema.memberships)
      .where(and(
        eq(schema.memberships.group_id, groupId),
        eq(schema.memberships.status, 'active'),
      ));
    const otherMemberIds = otherMembers
      .map(m => m.user_id)
      .filter(uid => uid !== executed.proposerId && uid !== executed.targetMemberId);

    if (!otherMemberIds.length) return;

    const otherEmails = await db.select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users).where(inArray(schema.users.id, otherMemberIds));
    const changeText = `${proposerName} (payout position ${executed.targetOrder}) and ${targetName} (payout position ${executed.proposerOrder}) swapped payout positions in "${groupName}"`
      + (executed.currentCycleRecipientSwapped
        ? `, including who receives the payout in the current cycle (cycle ${executed.currentCycleNumber}).`
        : '.');
    for (const m of otherEmails) {
      await sendVoteOutcomeEmail(m.email, groupName, groupId, 'Payout Schedule Updated', changeText);
    }
    for (const uid of otherMemberIds) {
      await notificationService.create({
        userId: uid, type: 'payout_swap_completed',
        title: 'Payout Schedule Updated',
        message: changeText,
      });
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
      ? `"${group.name}" approved a temporary contribution increase to ${meta?.claimed_amount}. This applies until every member has received a payout at this level this cycle, then it reverts to ${group.contribution_amount}.`
      : `The proposed contribution increase in "${group.name}" was not approved by all members (or the vote timed out) and will not take effect.`;
    for (const r of recipients) {
      await sendVoteOutcomeEmail(r.email, group.name, vote.group_id, status === 'approved' ? 'Contribution Claim Approved' : 'Contribution Claim Not Approved', message);
      await notificationService.create({
        userId: r.id, type: 'vote_closed',
        title: status === 'approved' ? 'Contribution Claim Approved' : 'Contribution Claim Not Approved',
        message,
      });
    }
  },

  /**
   * Section 15.D — a member-removal vote just closed. On approval, removes
   * the target via the standard Compensated Compression flow (or, if they
   * were the Owner, via the tenure-succession path) — that flow itself
   * already sends the compression notice to remaining members and a
   * distinct "removed via group vote" notice to the target. On
   * rejection/expiry, nothing changes; let the target know they're safe.
   */
  async _resolveMemberRemoval(vote: VoteRow, status: 'approved' | 'rejected' | 'expired') {
    if (!vote.target_member_id) return;
    const targetMemberId = vote.target_member_id;

    const groupRows = await db.select({ name: schema.savingsGroups.name }).from(schema.savingsGroups)
      .where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
    const groupName = groupRows.length ? groupRows[0].name : 'your group';

    if (status === 'approved') {
      // Dynamic import avoids a circular import at module-load time
      // (membershipService also imports voteService to start admission votes).
      const { membershipService } = await import('./membershipService.js');
      await membershipService.removeMemberByVote(vote.group_id, targetMemberId);
      return;
    }

    const targetRow = await db.select({ email: schema.users.email }).from(schema.users)
      .where(eq(schema.users.id, targetMemberId)).limit(1);
    if (targetRow.length) {
      await sendVoteOutcomeEmail(
        targetRow[0].email, groupName, vote.group_id, 'Removal Vote Not Approved',
        'A vote to remove you from the group was not approved by all other members (or it timed out) — you remain an active member.',
      );
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

  /**
   * Retroactive self-heal, run once at boot (see entry.ts). Before this
   * change, an approved payout_swap vote correctly swapped the two members'
   * `memberships.rotation_order` (that part always worked), but never (a)
   * patched an already-locked-in current-cycle `rotations.recipient_id`, so
   * "Rotation — Who's Next" kept showing the pre-swap recipient, nor (b)
   * told the rest of the group anything changed. Finds every approved
   * payout_swap vote not yet covered by a PAYOUT_SWAP_RETRO_SYNC_APPLIED
   * marker, re-derives what changed from the PAYOUT_SWAP_EXECUTED audit log
   * written at the time (the only durable record, since `votes` has no
   * resolved_at column), patches the current-cycle rotation ONLY if it's
   * both still unpaid and was created before the swap actually happened
   * (never touches a cycle that has nothing to do with this swap, or one
   * that's already been paid out), sends the "other members" notification,
   * then writes the marker — so a vote is only ever processed here once,
   * which is essential since blindly re-matching proposer/target against a
   * rotation's recipient on every boot would otherwise flip it back and
   * forth forever.
   */
  async retroactivelySyncApprovedPayoutSwaps(): Promise<void> {
    try {
      const approvedSwapVotes = await db.select().from(schema.votes).where(and(
        eq(schema.votes.proposal_type, 'payout_swap'),
        eq(schema.votes.status, 'approved'),
      ));
      if (!approvedSwapVotes.length) return;

      for (const vote of approvedSwapVotes) {
        try {
          if (!vote.target_member_id) continue;

          const alreadyApplied = await db.select({ id: schema.auditLogs.id }).from(schema.auditLogs).where(and(
            eq(schema.auditLogs.action, 'PAYOUT_SWAP_RETRO_SYNC_APPLIED'),
            eq(schema.auditLogs.entity, 'votes'),
            eq(schema.auditLogs.entity_id, vote.id),
          )).limit(1);
          if (alreadyApplied.length) continue;

          const executedLogs = await db.select().from(schema.auditLogs).where(and(
            eq(schema.auditLogs.action, 'PAYOUT_SWAP_EXECUTED'),
            eq(schema.auditLogs.user_id, vote.proposer_id),
            eq(schema.auditLogs.entity, 'memberships'),
          ));
          const executedLog = executedLogs.find((log) => {
            const metadata = log.metadata as { group_id?: string; swapped_with?: string } | null;
            return metadata?.group_id === vote.group_id && metadata?.swapped_with === vote.target_member_id;
          });
          if (!executedLog) continue; // swap never actually executed (shouldn't happen for an 'approved' vote, but be defensive)
          const executionMetadata = executedLog.metadata as {
            proposer_new_order?: number; target_new_order?: number;
          } | null;
          const proposerOrder = executionMetadata?.target_new_order; // proposer's order BEFORE the swap = target's new order
          const targetOrder = executionMetadata?.proposer_new_order;

          let currentCycleRecipientSwapped = false;
          let currentCycleNumber: number | undefined;
          const [group] = await db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
          if (group) {
            const [currentRotation] = await db.select().from(schema.rotations).where(and(
              eq(schema.rotations.group_id, vote.group_id),
              eq(schema.rotations.cycle_number, group.current_cycle),
              inArray(schema.rotations.payout_status, ['pending', 'processing']),
              lt(schema.rotations.created_at, executedLog.created_at),
            )).limit(1);
            if (currentRotation) {
              currentCycleNumber = currentRotation.cycle_number;
              if (currentRotation.recipient_id === vote.proposer_id) {
                await db.update(schema.rotations).set({ recipient_id: vote.target_member_id }).where(eq(schema.rotations.id, currentRotation.id));
                currentCycleRecipientSwapped = true;
              } else if (currentRotation.recipient_id === vote.target_member_id) {
                await db.update(schema.rotations).set({ recipient_id: vote.proposer_id }).where(eq(schema.rotations.id, currentRotation.id));
                currentCycleRecipientSwapped = true;
              }
            }
          }

          if (currentCycleRecipientSwapped) {
            console.log(`[PadiHub] Retroactive payout-swap migration: patched stale current-cycle recipient for group ${vote.group_id} (vote ${vote.id}).`);
          }

          const groupRows = await db.select({ name: schema.savingsGroups.name }).from(schema.savingsGroups)
            .where(eq(schema.savingsGroups.id, vote.group_id)).limit(1);
          const groupName = groupRows.length ? groupRows[0].name : 'your group';
          await this._notifyOtherMembersOfPayoutSwap(vote.group_id, groupName, {
            proposerId: vote.proposer_id,
            targetMemberId: vote.target_member_id,
            proposerOrder: proposerOrder ?? 0,
            targetOrder: targetOrder ?? 0,
            currentCycleRecipientSwapped,
            currentCycleNumber,
          });

          await createAuditLog({
            action: 'PAYOUT_SWAP_RETRO_SYNC_APPLIED', entity: 'votes', entityId: vote.id,
            metadata: { group_id: vote.group_id, current_cycle_recipient_swapped: currentCycleRecipientSwapped },
          });
        } catch (err) {
          console.error(`[PadiHub] Retroactive payout-swap migration failed for vote ${vote.id}:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error('[PadiHub] Retroactive payout-swap migration failed:', err instanceof Error ? err.message : err);
    }
  },
};
