import { v4 as uuidv4 } from 'uuid';
import { eq, and, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { trustScoreService } from './trustScoreService.js';
import { membershipService } from './membershipService.js';
import { TRUST_SCORE_DELTA_CONTRIBUTION_PAID, TRUST_SCORE_DELTA_CONTRIBUTION_MISSED, CONTRIBUTION_DEFAULT_GRACE_PERIOD_MS, resolveUserDisplayName } from '../lib/constants.js';
import {
  sendContributionSuccessEmail,
  sendContributionOverdueEmail,
  sendPaymentGracePeriodStartedEmail,
  sendMemberDefaultSuspensionEmail,
  sendGroupLeaderActivityEmail,
  p, table, detail,
} from '../integrations/email/emailService.js';

/**
 * Section: a group leader is accountable for the whole group's health, so
 * they must be copied on every significant contribution activity event for
 * groups they lead — unless the event is about the leader's OWN
 * contribution (they already get the member-facing email for that).
 * Best-effort/never-throwing: a failed leader-notification email must never
 * block the underlying contribution state transition.
 */
async function notifyGroupLeaderOfContributionActivity(
  groupId: string, memberId: string, headline: string, bodyBuilder: (memberName: string, groupName: string) => string,
): Promise<void> {
  try {
    const groupRow = await db.select({ name: schema.savingsGroups.name, leader_id: schema.savingsGroups.leader_id })
      .from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
    if (!groupRow.length || groupRow[0].leader_id === memberId) return;

    const [leaderRow, memberRow] = await Promise.all([
      db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, groupRow[0].leader_id)).limit(1),
      db.select({ display_name: schema.users.display_name, first_name: schema.users.first_name, last_name: schema.users.last_name, email: schema.users.email })
        .from(schema.users).where(eq(schema.users.id, memberId)).limit(1),
    ]);
    if (!leaderRow.length) return;
    const memberName = resolveUserDisplayName(memberRow[0]);
    await sendGroupLeaderActivityEmail(leaderRow[0].email, groupRow[0].name, headline, bodyBuilder(memberName, groupRow[0].name));
  } catch (error) {
    console.error('[ContributionService] Failed to notify group leader of contribution activity:', error);
  }
}

/**
 * mysql2's UPDATE result shape isn't typed by drizzle — same
 * affectedRows-extraction pattern used by rotationService/
 * paymentEligibilityService/subscriptionService/webhookStripeController for
 * atomic claim-style updates.
 */
function extractAffectedRows(result: unknown): number {
  return (result as { affectedRows?: number }[])[0]?.affectedRows
    ?? (result as { affectedRows?: number }).affectedRows
    ?? 0;
}

export const contributionService = {
  async getForGroup(groupId: string, cycleNumber?: number) {
    
    const condition = cycleNumber
      ? and(eq(schema.contributions.group_id, groupId), eq(schema.contributions.cycle_number, cycleNumber))
      : eq(schema.contributions.group_id, groupId);
    return db.select().from(schema.contributions).where(condition);
  },

  async getForMember(memberId: string) {
    
    return db.select().from(schema.contributions).where(eq(schema.contributions.member_id, memberId));
  },

  async create(data: {
    group_id: string; member_id: string; cycle_number: number;
    amount_due: string; due_date: Date;
  }) {
    
    const id = uuidv4();
    await db.insert(schema.contributions).values({
      id,
      group_id:       data.group_id,
      member_id:      data.member_id,
      cycle_number:   data.cycle_number,
      amount_due:     data.amount_due,
      due_date:       data.due_date,
      payment_status: 'scheduled',
    });
    return id;
  },

  async markPaid(
    contributionId: string,
    providerReference: string,
    ipAddress?: string,
    feeBreakdown?: {
      feeAmount?: string;
      cardFeeAmount?: string;
      cardFeeVatAmount?: string;
      payoutFeeShareAmount?: string;
      payoutFeeShareVatAmount?: string;
    },
    // Stripe only — the underlying Charge ID (ch_xxx), distinct from
    // providerReference (pi_xxx). See schema.ts's provider_charge_id doc
    // comment / rotationService.transferCyclePotToRecipient.
    providerChargeId?: string,
  ) {
    
    const rows = await db.select().from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId)).limit(1);
    if (!rows.length) throw new AppError('Contribution not found.', 404);
    const c = rows[0];

    // Idempotent: a contribution may be charged and marked paid synchronously
    // (e.g. by chargeContributionForUser reading the provider's immediate
    // response) and again moments later by the provider webhook (payment_
    // intent.succeeded / charge.completed) for that exact same charge —
    // skip re-processing so trust score / notifications / emails aren't
    // duplicated.
    if (c.payment_status === 'paid') return true;

    // Atomic claim, not a plain read-then-write: the synchronous charge path
    // and the async webhook path can both reach this point within
    // milliseconds of each other, both having read payment_status as
    // not-yet-'paid' above. Conditioning the UPDATE itself on payment_status
    // != 'paid' means only the first writer's UPDATE actually matches a row
    // (affectedRows > 0) — the second writer's UPDATE matches zero rows and
    // backs off, which is what previously let both callers fall through and
    // send duplicate contribution-success emails/notifications for a single
    // payment.
    const claimResult = await db.update(schema.contributions).set({
      payment_status:     'paid',
      amount_paid:        c.amount_due,
      fee_amount:                  feeBreakdown?.feeAmount ?? c.fee_amount,
      card_fee_amount:             feeBreakdown?.cardFeeAmount ?? c.card_fee_amount,
      card_fee_vat_amount:         feeBreakdown?.cardFeeVatAmount ?? c.card_fee_vat_amount,
      payout_fee_share_amount:     feeBreakdown?.payoutFeeShareAmount ?? c.payout_fee_share_amount,
      payout_fee_share_vat_amount: feeBreakdown?.payoutFeeShareVatAmount ?? c.payout_fee_share_vat_amount,
      paid_date:          new Date(),
      provider_reference: providerReference,
      provider_charge_id: providerChargeId ?? c.provider_charge_id,
    }).where(and(eq(schema.contributions.id, contributionId), ne(schema.contributions.payment_status, 'paid')));

    if (extractAffectedRows(claimResult) === 0) return true;

    await createAuditLog({ userId: c.member_id, action: 'CONTRIBUTION_PAID', entity: 'contributions', entityId: contributionId, ipAddress });

    // Look up user email and group name — the group name is needed both for
    // the email below and for the in-app notification, so this now runs
    // before the notification is created rather than after it.
    const userRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, c.member_id)).limit(1);
    const groupRow = await db.select({ name: schema.savingsGroups.name, currency: schema.savingsGroups.currency }).from(schema.savingsGroups).where(eq(schema.savingsGroups.id, c.group_id)).limit(1);
    await notificationService.create({
      userId: c.member_id, type: 'contribution_paid',
      title: 'Contribution Recorded',
      message: groupRow.length
        ? `Your contribution for cycle ${c.cycle_number} in "${groupRow[0].name}" has been recorded.`
        : `Your contribution for cycle ${c.cycle_number} has been recorded.`,
    });
    await trustScoreService.increase(c.member_id, TRUST_SCORE_DELTA_CONTRIBUTION_PAID, 'CONTRIBUTION_PAID');

    if (userRow.length && groupRow.length) {
      const amount = `${groupRow[0].currency} ${parseFloat(c.amount_due).toFixed(2)}`;
      const date = new Date().toLocaleDateString('en-GB');
      try {
        await sendContributionSuccessEmail(userRow[0].email, groupRow[0].name, amount, date, providerReference);
      } catch (emailError) {
        console.error(`[ContributionService] Failed to send contribution success email for contribution ${contributionId}:`, emailError);
      }
      await notifyGroupLeaderOfContributionActivity(c.group_id, c.member_id, 'Member contribution paid', (memberName, groupName) => `
        ${p(`<strong>${memberName}</strong>'s contribution for cycle ${c.cycle_number} in <strong>${groupName}</strong> has been successfully paid.`)}
        ${table(detail('Member', memberName) + detail('Cycle', String(c.cycle_number)) + detail('Amount', amount) + detail('Reference', providerReference))}
      `);
    } else {
      console.warn(`[ContributionService] Could not send contribution success email for ${contributionId}: user found=${userRow.length > 0}, group found=${groupRow.length > 0}`);
    }

    // Section 7/10 — if this was the last unpaid contribution in the cycle,
    // trigger the payout THE SAME DAY instead of waiting for tomorrow's
    // monthlyAdvanceRotation safety-net sweep. Best-effort/never-throwing:
    // a payout-advance failure must never undo or fail this contribution's
    // own paid confirmation — rotationService.advanceIfCycleComplete is
    // itself concurrency-safe and idempotent (see its doc comment), and any
    // failure here is retried by tomorrow's daily job.
    try {
      const { rotationService } = await import('./rotationService.js');
      await rotationService.advanceIfCycleComplete(c.group_id, c.cycle_number);
    } catch (error) {
      console.error('[ContributionService] advanceIfCycleComplete failed after markPaid:', error);
    }
    return true;
  },

  /**
   * A real charge attempt failed (Section 6 — distinct from markMissed,
   * which fires when a contribution reaches its due date without any
   * charge attempt ever completing). First failure: start the single
   * 72-hour grace period (status -> 'pending_default'), notify the member
   * and the group, and stop — NO charge happens again until the grace
   * period ends. `isGraceRetry` is passed by dailyContributionDefaultRetry
   * once, at the end of that grace period; if that single retry also
   * fails, the contribution is marked 'defaulted' and the member is
   * flagged via membershipService.flagDefault (which itself decides,
   * based on the group's max-permitted-defaults setting, whether to retain
   * the member or trigger Compensated Compression). No further retries,
   * continuous payment authority, or substitute-member matching occurs.
   */
  async markFailed(contributionId: string, ipAddress?: string, isGraceRetry = false) {
    
    const rows = await db.select().from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId)).limit(1);
    if (!rows.length) throw new AppError('Contribution not found.', 404);
    const c = rows[0];

    // Idempotent — don't downgrade an already-paid contribution, and don't
    // re-process a contribution that's already been carried past this point.
    if (c.payment_status === 'paid' || c.payment_status === 'defaulted') return true;

    const userRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, c.member_id)).limit(1);
    const groupRow = await db.select({ name: schema.savingsGroups.name, currency: schema.savingsGroups.currency }).from(schema.savingsGroups).where(eq(schema.savingsGroups.id, c.group_id)).limit(1);
    const amount = groupRow.length ? `${groupRow[0].currency} ${parseFloat(c.amount_due).toFixed(2)}` : c.amount_due;

    if (!isGraceRetry && c.payment_status !== 'pending_default') {
      // First failure — start the 72-hour grace period. No default is
      // recorded yet and no further action is taken until the single
      // automatic retry runs at the end of the grace period.
      const graceEndsAt = new Date(Date.now() + CONTRIBUTION_DEFAULT_GRACE_PERIOD_MS);
      await db.update(schema.contributions)
        .set({ payment_status: 'pending_default', grace_period_ends_at: graceEndsAt, retry_attempted: false })
        .where(eq(schema.contributions.id, contributionId));

      await createAuditLog({ userId: c.member_id, action: 'CONTRIBUTION_GRACE_PERIOD_STARTED', entity: 'contributions', entityId: contributionId, ipAddress, metadata: { graceEndsAt } });
      await notificationService.create({
        userId: c.member_id, type: 'contribution_grace_period_started',
        title: 'Payment Failed — Grace Period Started',
        message: groupRow.length
          ? `Your contribution for cycle ${c.cycle_number} in "${groupRow[0].name}" failed. You have a 72-hour grace period before a single automatic retry on ${graceEndsAt.toLocaleString('en-GB')}.`
          : `Your contribution for cycle ${c.cycle_number} failed. You have a 72-hour grace period before a single automatic retry on ${graceEndsAt.toLocaleString('en-GB')}.`,
      });

      const activeMembers = await db.select().from(schema.memberships)
        .where(and(eq(schema.memberships.group_id, c.group_id), eq(schema.memberships.status, 'active')));
      for (const m of activeMembers) {
        if (m.user_id === c.member_id) continue;
        await notificationService.create({
          userId: m.user_id, type: 'group_member_payment_grace_period',
          title: 'Member Payment Pending',
          message: groupRow.length
            ? `A member's contribution for cycle ${c.cycle_number} in "${groupRow[0].name}" failed and is now in a 72-hour grace period before one automatic retry.`
            : `A member's contribution for cycle ${c.cycle_number} failed and is now in a 72-hour grace period before one automatic retry.`,
        });
      }

      if (userRow.length && groupRow.length) {
        await sendPaymentGracePeriodStartedEmail(userRow[0].email, groupRow[0].name, amount, graceEndsAt.toLocaleString('en-GB'));
        await notifyGroupLeaderOfContributionActivity(c.group_id, c.member_id, 'Member payment failed — grace period started', (memberName, groupName) => `
          ${p(`<strong>${memberName}</strong>'s contribution for cycle ${c.cycle_number} in <strong>${groupName}</strong> failed. A 72-hour grace period has started before a single automatic retry.`)}
          ${table(detail('Member', memberName) + detail('Cycle', String(c.cycle_number)) + detail('Amount', amount) + detail('Retry by', graceEndsAt.toLocaleString('en-GB')))}
        `);
      }
      return true;
    }

    // The single automatic retry (or a first attempt already past its own
    // grace deadline) also failed — record the default and hand off to
    // membershipService to decide retain-vs-Compensated-Compression.
    await db.update(schema.contributions)
      .set({ payment_status: 'defaulted', retry_attempted: true })
      .where(eq(schema.contributions.id, contributionId));

    await createAuditLog({ userId: c.member_id, action: 'CONTRIBUTION_DEFAULTED', entity: 'contributions', entityId: contributionId, ipAddress });
    await notificationService.create({
      userId: c.member_id, type: 'contribution_defaulted',
      title: 'Contribution Defaulted',
      message: groupRow.length
        ? `Your contribution for cycle ${c.cycle_number} in "${groupRow[0].name}" is now in default after the automatic retry also failed.`
        : `Your contribution for cycle ${c.cycle_number} is now in default after the automatic retry also failed.`,
    });
    await trustScoreService.decrease(c.member_id, TRUST_SCORE_DELTA_CONTRIBUTION_MISSED, 'CONTRIBUTION_MISSED');

    if (userRow.length && groupRow.length) {
      await sendMemberDefaultSuspensionEmail(userRow[0].email, groupRow[0].name, amount);
      await notifyGroupLeaderOfContributionActivity(c.group_id, c.member_id, 'Member contribution defaulted', (memberName, groupName) => `
        ${p(`<strong>${memberName}</strong>'s contribution for cycle ${c.cycle_number} in <strong>${groupName}</strong> is now in default after the automatic retry also failed. This may affect the group's rotation order and payout schedule.`)}
        ${table(detail('Member', memberName) + detail('Cycle', String(c.cycle_number)) + detail('Amount', amount))}
      `);
    }

    await membershipService.flagDefault(c.member_id, c.group_id, contributionId, ipAddress);

    // Section [new] — a default is a TERMINAL outcome for this contribution
    // (see getCycleResolutionStatus): if it was the last unresolved
    // contribution in the cycle, the payout is now due — proceed
    // immediately with whatever was actually collected, rather than
    // waiting for the next catch-up sweep. Mirrors markPaid's own inline
    // trigger; best-effort/never-throwing for the same reasons.
    try {
      const { rotationService } = await import('./rotationService.js');
      await rotationService.advanceIfCycleComplete(c.group_id, c.cycle_number);
    } catch (error) {
      console.error('[ContributionService] advanceIfCycleComplete failed after markFailed default:', error);
    }
    return true;
  },

  async markMissed(contributionId: string, ipAddress?: string) {
    
    const rows = await db.select().from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId)).limit(1);
    if (!rows.length) throw new AppError('Contribution not found.', 404);
    const c = rows[0];

    await db.update(schema.contributions)
      .set({ payment_status: 'missed' })
      .where(eq(schema.contributions.id, contributionId));

    // Delegate strike increment + threshold enforcement to membershipService
    await membershipService.applyStrike(c.member_id, c.group_id, ipAddress);

    await createAuditLog({ userId: c.member_id, action: 'CONTRIBUTION_MISSED', entity: 'contributions', entityId: contributionId, ipAddress });
    const userRow = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, c.member_id)).limit(1);
    const groupRow = await db.select({ name: schema.savingsGroups.name, currency: schema.savingsGroups.currency }).from(schema.savingsGroups).where(eq(schema.savingsGroups.id, c.group_id)).limit(1);
    await notificationService.create({
      userId: c.member_id, type: 'contribution_missed',
      title: 'Missed Contribution',
      message: groupRow.length
        ? `You missed your contribution for cycle ${c.cycle_number} in "${groupRow[0].name}". This affects your Trust Score.`
        : `You missed your contribution for cycle ${c.cycle_number}. This affects your Trust Score.`,
    });
    await trustScoreService.decrease(c.member_id, TRUST_SCORE_DELTA_CONTRIBUTION_MISSED, 'CONTRIBUTION_MISSED');

    if (userRow.length && groupRow.length) {
      const amount = `${groupRow[0].currency} ${parseFloat(c.amount_due).toFixed(2)}`;
      await sendContributionOverdueEmail(userRow[0].email, groupRow[0].name, amount);
      await notifyGroupLeaderOfContributionActivity(c.group_id, c.member_id, 'Member missed a contribution', (memberName, groupName) => `
        ${p(`<strong>${memberName}</strong> missed their contribution for cycle ${c.cycle_number} in <strong>${groupName}</strong>. This affects their Trust Score and strike count.`)}
        ${table(detail('Member', memberName) + detail('Cycle', String(c.cycle_number)) + detail('Amount', amount))}
      `);
    }

    // Section [new] — 'missed' is also a terminal outcome for this cycle
    // (see getCycleResolutionStatus); check whether the cycle is now fully
    // resolved and the payout can proceed immediately. See the identical
    // comment in markFailed above for why this is safe/best-effort.
    try {
      const { rotationService } = await import('./rotationService.js');
      await rotationService.advanceIfCycleComplete(c.group_id, c.cycle_number);
    } catch (error) {
      console.error('[ContributionService] advanceIfCycleComplete failed after markMissed:', error);
    }
    return true;
  },

  // Generate a full cycle's contribution records for all active members
  async generateCycleSchedule(groupId: string, cycleNumber: number, dueDate: Date, members: { user_id: string; amount_due: string }[]) {
    const ids: string[] = [];
    for (const m of members) {
      const id = await this.create({ group_id: groupId, member_id: m.user_id, cycle_number: cycleNumber, amount_due: m.amount_due, due_date: dueDate });
      ids.push(id);
    }
    return ids;
  },

  /**
   * Section D.3 — a member who joins an ALREADY-LAUNCHED group (invited
   * join, a leader-approved join request, or a passed member_admission
   * vote) arrives into a cycle whose contribution schedule was already
   * generated for whoever was active at the time (generateCycleSchedule
   * only ever runs once per cycle, seeded from that moment's membership
   * list — see groupService.activateGroup and
   * monthlyGenerateContributionSchedule below). Without this, the new
   * member gets NO contribution row for the cycle they actually joined —
   * they are silently never charged and never shown as "due" until the
   * group's NEXT cycle happens to regenerate a schedule that includes them.
   * Called synchronously the instant a new member goes active
   * (membershipService.join/_activatePendingMembership) so they're caught
   * up immediately; monthlyGenerateContributionSchedule's daily backfill is
   * the safety net (and also retroactively fixes every account already
   * affected by this gap before this fix existed, with no one-off script
   * needed). A no-op for draft groups (their schedule is generated in full,
   * once, at launch) and suspended groups (collection is deliberately
   * paused — see groupService.reevaluateAfterMembershipChange), and
   * idempotent if the member already has a row for the current cycle.
   *
   * Runs inside a transaction that row-locks the group (the same
   * `SELECT ... FOR UPDATE` on savingsGroups used by
   * membershipService's rotation-order assignment) so that this call and
   * monthlyGenerateContributionSchedule's daily backfill loop — which can
   * legitimately be evaluating the very same member at the very same
   * moment a live join/approval fires this method — can never both see the
   * row missing and both insert a duplicate contribution for the member.
   */
  async enrollMemberInCurrentCycleIfMissing(groupId: string, userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.select({ id: schema.savingsGroups.id }).from(schema.savingsGroups)
        .where(eq(schema.savingsGroups.id, groupId)).for('update');

      const groupRows = await tx.select({
        status:               schema.savingsGroups.status,
        current_cycle:        schema.savingsGroups.current_cycle,
        contribution_amount:  schema.savingsGroups.contribution_amount,
      }).from(schema.savingsGroups).where(eq(schema.savingsGroups.id, groupId)).limit(1);
      if (!groupRows.length) return;
      const group = groupRows[0];
      if (group.status !== 'active') return;

      const existingForCycle = await tx.select({
        member_id: schema.contributions.member_id,
        due_date:  schema.contributions.due_date,
      }).from(schema.contributions)
        .where(and(eq(schema.contributions.group_id, groupId), eq(schema.contributions.cycle_number, group.current_cycle)));

      // No schedule generated for the current cycle at all yet — nothing to
      // backfill; the normal generation path will create this member's row
      // along with everyone else's the moment it runs.
      if (!existingForCycle.length) return;
      if (existingForCycle.some(c => c.member_id === userId)) return;

      await tx.insert(schema.contributions).values({
        id:             uuidv4(),
        group_id:       groupId,
        member_id:      userId,
        cycle_number:   group.current_cycle,
        amount_due:     group.contribution_amount,
        due_date:       existingForCycle[0].due_date,
        payment_status: 'scheduled',
      });
    });
  },

  /**
   * The real monetary size of a cycle's payout pot: the sum of what the
   * members who are ACTUALLY contributing this cycle owe (or have already
   * paid) — never the group's `maximum_members` capacity. A group can have
   * up to `maximum_members` slots but only however-many are currently
   * active/contributing; one contribution row is created per active member
   * when a cycle's schedule is generated (see generateCycleSchedule above),
   * so summing amount_paid ?? amount_due across those rows is ground truth
   * for "who is actually contributing", fixing the PR38 regression where
   * the pot was calculated as contribution_amount × maximum_members instead
   * (e.g. a group contributing £100/month with 10 slots but only 3 active
   * members showed a £1,000 payout instead of the correct £300).
   *
   * Falls back to (contributionAmount × current active member count) when
   * the cycle's schedule hasn't been generated yet — e.g. the "upcoming
   * payout" rotation record for the next cycle is created by
   * rotationService.advance() before the nightly schedule-generation job
   * has run for that cycle. This fallback still reflects real active
   * headcount, never capacity.
   */
  /**
   * The single source of truth for "is this cycle actually resolved, and
   * how much money has really been collected for it" — used by
   * rotationService.advanceIfCycleComplete (payout gate),
   * transferCyclePotToRecipient (the actual amount moved), and the
   * payout-complete emails (so the recipient/leader see the real,
   * possibly-reduced amount rather than an inflated due-based estimate).
   *
   * A contribution is TERMINAL (its outcome for this cycle is final) once
   * it's 'paid', 'defaulted' (the single grace-period retry also failed —
   * see markFailed), or 'missed' (never even reached the provider by its
   * due date — see markMissed). 'scheduled'/'due'/'pending_default' (still
   * awaiting its one retry) are NOT terminal and must keep blocking payout,
   * per the group's grace-period policy. `collectedAmount` deliberately
   * only sums `amount_paid` for 'paid' rows — a defaulted/missed member's
   * `amount_due` was never actually received, so it must never be counted
   * toward the pot that gets transferred (see PR58's pot-inflation fix).
   */
  async getCycleResolutionStatus(groupId: string, cycleNumber: number): Promise<{
    totalCount: number;
    paidCount: number;
    resolvedFailureCount: number;
    unresolvedCount: number;
    resolved: boolean;
    hadAnyFailure: boolean;
    collectedAmount: number;
  }> {
    const rows = await db.select({
      payment_status: schema.contributions.payment_status,
      amount_paid:    schema.contributions.amount_paid,
    }).from(schema.contributions)
      .where(and(eq(schema.contributions.group_id, groupId), eq(schema.contributions.cycle_number, cycleNumber)));

    const TERMINAL_FAILURE_STATUSES = new Set(['defaulted', 'missed']);
    let paidCount = 0;
    let resolvedFailureCount = 0;
    let unresolvedCount = 0;
    let collectedAmount = 0;
    for (const row of rows) {
      if (row.payment_status === 'paid') {
        paidCount += 1;
        const parsed = parseFloat(row.amount_paid ?? '0');
        collectedAmount += Number.isFinite(parsed) ? parsed : 0;
      } else if (TERMINAL_FAILURE_STATUSES.has(row.payment_status)) {
        resolvedFailureCount += 1;
      } else {
        unresolvedCount += 1;
      }
    }

    return {
      totalCount: rows.length,
      paidCount,
      resolvedFailureCount,
      unresolvedCount,
      resolved: rows.length > 0 && unresolvedCount === 0,
      hadAnyFailure: resolvedFailureCount > 0,
      collectedAmount,
    };
  },

  /**
   * Every 'paid' contribution for a cycle, each with the Stripe Charge ID
   * that funded it (if captured — see provider_charge_id's doc comment).
   * Used exclusively by rotationService.transferCyclePotToRecipient to pay
   * out a cycle's pooled pot as one Stripe transfer PER funding charge
   * (`source_transaction`), rather than one lump transfer drawn from the
   * platform's general available balance.
   */
  async getPaidContributionsForCycle(groupId: string, cycleNumber: number): Promise<Array<{
    id: string;
    memberId: string;
    amountPaidMinorUnits: number;
    providerChargeId: string | null;
  }>> {
    const rows = await db.select({
      id:                  schema.contributions.id,
      member_id:           schema.contributions.member_id,
      amount_paid:         schema.contributions.amount_paid,
      provider_charge_id:  schema.contributions.provider_charge_id,
    }).from(schema.contributions)
      .where(and(
        eq(schema.contributions.group_id, groupId),
        eq(schema.contributions.cycle_number, cycleNumber),
        eq(schema.contributions.payment_status, 'paid'),
      ));

    return rows.map(row => {
      const parsed = parseFloat(row.amount_paid ?? '0');
      return {
        id: row.id,
        memberId: row.member_id,
        amountPaidMinorUnits: Math.round((Number.isFinite(parsed) ? parsed : 0) * 100),
        providerChargeId: row.provider_charge_id,
      };
    });
  },

  async getCyclePotAmount(groupId: string, cycleNumber: number, contributionAmount: number): Promise<number> {
    const cycleContributions = await db.select({
      amount_due:  schema.contributions.amount_due,
      amount_paid: schema.contributions.amount_paid,
    }).from(schema.contributions)
      .where(and(eq(schema.contributions.group_id, groupId), eq(schema.contributions.cycle_number, cycleNumber)));

    if (cycleContributions.length > 0) {
      return cycleContributions.reduce((sum, c) => {
        const raw = c.amount_paid ?? c.amount_due;
        const parsed = parseFloat(raw);
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0);
    }

    const activeMembers = await db.select({ id: schema.memberships.id }).from(schema.memberships)
      .where(and(eq(schema.memberships.group_id, groupId), eq(schema.memberships.status, 'active')));
    return (Number.isFinite(contributionAmount) ? contributionAmount : 0) * activeMembers.length;
  },
};
