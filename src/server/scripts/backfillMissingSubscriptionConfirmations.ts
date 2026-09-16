/**
 * ONE-OFF DATA CORRECTION — retroactively applies, immediately and across
 * every affected account, the confirmation gaps just fixed by:
 *   - webhookStripeController.ts's invoice.payment_succeeded handler now
 *     sending a first-charge confirmation (email + notification +
 *     STRIPE_SUBSCRIPTION_FIRST_CHARGE billing-history entry) whenever a
 *     subscription's charge is confirmed ASYNCHRONOUSLY via webhook rather
 *     than synchronously inside subscriptionService.createSubscription().
 *   - subscriptionService.backfillMissingActivationConfirmation(), the new
 *     helper this script calls to backfill that exact same confirmation for
 *     any account whose subscription is ALREADY billing_status='active'
 *     locally but never got one, because the gap above meant it was missed
 *     the first time the subscription actually went active.
 *
 * This script covers three, layered scenarios so no active-group member is
 * left without a working "Subscription & Billing" / "Billing History" view
 * or a confirmation email/notification, regardless of which step of the
 * post-PR#53 billing flow they fell through:
 *
 *   Step A — Active group members with NO local `subscriptions` row at all
 *     yet (the very first billing attempt never ran, or its local DB write
 *     never completed). Reuses the exact same query as
 *     scheduledJobs.dailyBillingActiveGroupReconciliation and calls
 *     subscriptionService.reconcileBillingForActiveGroupMembership(userId)
 *     immediately, instead of waiting for that job's next 07:25 UTC run.
 *
 *   Step B — A local Stripe `subscriptions` row stuck 'past_due' even
 *     though Stripe's own record for that customer is already genuinely
 *     active/trialing (e.g. a 3DS/SCA confirmation that only ever
 *     completed later). Reuses
 *     subscriptionService.retryStripeIncompleteSubscriptionCharge(), the
 *     same self-heal dailySubscriptionPastDueRecovery already runs daily —
 *     this just runs it now, for every such row, instead of waiting.
 *
 *   Step C — A local Stripe `subscriptions` row that IS already
 *     billing_status='active' (so the underlying data is correct) but has
 *     no billing-history-visible confirmation and never got a confirmation
 *     email — the specific historical instance of the webhook gap fixed
 *     above. Reuses the new
 *     subscriptionService.backfillMissingActivationConfirmation() helper.
 *
 * Every step only ever reads Stripe's own existing records (never creates
 * or charges anything new) and only writes rows/entries that a query first
 * confirms genuinely still need it — safe to re-run; each step no-ops for
 * an account that's already been reconciled/backfilled.
 *
 * Usage:
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx src/server/scripts/backfillMissingSubscriptionConfirmations.ts
 */
import { eq, and, isNull } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';
import { subscriptionService } from '../services/subscriptionService.js';

async function backfillMissingSubscriptionRows(): Promise<void> {
  const activeGroupMembersMissingSubscription = await db.select({ user_id: schema.memberships.user_id })
    .from(schema.memberships)
    .innerJoin(schema.savingsGroups, eq(schema.memberships.group_id, schema.savingsGroups.id))
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.user_id, schema.memberships.user_id))
    .where(and(
      eq(schema.memberships.status, 'active'),
      eq(schema.savingsGroups.status, 'active'),
      isNull(schema.subscriptions.id),
    ));

  const userIds = new Set(activeGroupMembersMissingSubscription.map((member) => member.user_id));
  console.log(`[Step A] Found ${userIds.size} active-group member(s) with no local subscription row.`);

  for (const userId of userIds) {
    try {
      await subscriptionService.reconcileBillingForActiveGroupMembership(userId);
      console.log(`[Step A][DONE] ${userId}: reconciliation attempted.`);
    } catch (err) {
      console.error(`[Step A][ERROR] ${userId}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function backfillStalePastDueSubscriptions(): Promise<void> {
  const pastDueStripeRows = await db.select({
    user_id: schema.subscriptions.user_id,
    provider_subscription_id: schema.subscriptions.provider_subscription_id,
  }).from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.provider, 'stripe'), eq(schema.subscriptions.billing_status, 'past_due')));

  console.log(`[Step B] Found ${pastDueStripeRows.length} past_due Stripe subscription row(s) to re-check against Stripe.`);

  for (const row of pastDueStripeRows) {
    if (!row.provider_subscription_id) {
      console.warn(`[Step B][SKIP] ${row.user_id}: no provider_subscription_id on file.`);
      continue;
    }
    try {
      const healed = await subscriptionService.retryStripeIncompleteSubscriptionCharge(row.user_id, row.provider_subscription_id);
      console.log(`[Step B][${healed ? 'DONE' : 'SKIP'}] ${row.user_id}: ${healed ? 'reconciled to active.' : 'still not active with Stripe — left untouched.'}`);
    } catch (err) {
      console.error(`[Step B][ERROR] ${row.user_id}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function backfillMissingConfirmations(): Promise<void> {
  const activeStripeRows = await db.select({ user_id: schema.subscriptions.user_id })
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.provider, 'stripe'), eq(schema.subscriptions.billing_status, 'active')));

  console.log(`[Step C] Checking ${activeStripeRows.length} active Stripe subscription row(s) for a missing billing-history confirmation.`);

  for (const row of activeStripeRows) {
    try {
      const sent = await subscriptionService.backfillMissingActivationConfirmation(row.user_id);
      console.log(`[Step C][${sent ? 'DONE' : 'SKIP'}] ${row.user_id}: ${sent ? 'sent backfilled confirmation email + billing-history entry.' : 'already confirmed — left untouched.'}`);
    } catch (err) {
      console.error(`[Step C][ERROR] ${row.user_id}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function main(): Promise<void> {
  await backfillMissingSubscriptionRows();
  await backfillStalePastDueSubscriptions();
  await backfillMissingConfirmations();
  await closeConnection();
}

main().catch((err) => {
  console.error('[backfillMissingSubscriptionConfirmations] Unhandled error:', err);
  process.exitCode = 1;
});
