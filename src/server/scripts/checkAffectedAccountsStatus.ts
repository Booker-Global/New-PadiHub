/**
 * READ-ONLY DIAGNOSTIC — makes NO writes of any kind.
 *
 * Reports the exact current state (every field relevant to onboarding /
 * subscription-activation eligibility) for the three specific accounts the
 * user is testing with, so we can confirm from live data — not assumption —
 * whether they have a `subscriptions` row, what every relevant field says,
 * and (by checking the actual active-group-membership count) whether the
 * Stripe billing-resume path is even reachable for them yet.
 *
 * Deliberately scoped to ONLY the email addresses listed in AFFECTED_EMAILS
 * below. Does not update, insert, or delete anything.
 *
 * Usage (run once, read-only, safe to re-run any number of times):
 *   DATABASE_URL=... npx tsx src/server/scripts/checkAffectedAccountsStatus.ts
 */
import { eq } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';
import { groupService } from '../services/groupService.js';

const AFFECTED_EMAILS = [
  'abdulwahabyakubu@yahoo.com',
  'abdulwahabyakubu17@gmail.com',
  'tounsitraveller@gmail.com',
] as const;

function line(label: string, value: unknown): void {
  console.log(`    ${label.padEnd(38)}: ${value === null || value === undefined ? '(null)' : String(value)}`);
}

async function reportAccount(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  console.log(`\n=== ${email} ===`);

  const userRows = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1);
  if (!userRows.length) {
    console.log('  [NO USER FOUND] with this email.');
    return;
  }
  const user = userRows[0];

  console.log('  --- users row ---');
  line('id', user.id);
  line('country', user.country);
  line('account_status', user.account_status);
  line('subscription_status', user.subscription_status);
  line('subscription_tier', user.subscription_tier);
  line('identity_verified', user.identity_verified);
  line('identity_verified_at', user.identity_verified_at);
  line('payment_method_verified_at', user.payment_method_verified_at);
  line('payout_verified_at', user.payout_verified_at);
  line('stripe_customer_id', user.stripe_customer_id);
  line('stripe_payment_method_id', user.stripe_payment_method_id);
  line('stripe_connected_account_id', user.stripe_connected_account_id);
  line('flutterwave_customer_id', user.flutterwave_customer_id);
  line('flutterwave_card_token', user.flutterwave_card_token);
  line('flutterwave_subaccount_id', user.flutterwave_subaccount_id);
  line('onboarding_completed_email_sent_at', user.onboarding_completed_email_sent_at);
  line('group_join_reminder_last_sent_at', user.group_join_reminder_last_sent_at);
  line('onboarding_incomplete_reminder_last_sent_at', user.onboarding_incomplete_reminder_last_sent_at);
  line('resubscribe_reminder_last_sent_at', user.resubscribe_reminder_last_sent_at);
  line('vote_removed_count', user.vote_removed_count);
  line('created_at', user.created_at);
  line('updated_at', user.updated_at);

  const subRows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.user_id, user.id)).limit(1);
  if (!subRows.length) {
    console.log('  --- subscriptions row: NONE ---');
  } else {
    const sub = subRows[0];
    console.log('  --- subscriptions row ---');
    line('id', sub.id);
    line('provider', sub.provider);
    line('provider_subscription_id', sub.provider_subscription_id);
    line('plan', sub.plan);
    line('billing_status', sub.billing_status);
    line('renewal_date', sub.renewal_date);
    line('pending_tier', sub.pending_tier);
    line('last_activation_attempt_at', sub.last_activation_attempt_at);
    line('cancelled_at', sub.cancelled_at);
    line('first_charge_failed_at', sub.first_charge_failed_at);
    line('created_at', sub.created_at);
    line('updated_at', sub.updated_at);
  }

  const activeGroupCount = await groupService.countActiveGroupMembershipsForUser(user.id);
  const allMemberships = await db.select({
    group_id: schema.memberships.group_id,
    status: schema.memberships.status,
    role: schema.memberships.role,
    join_date: schema.memberships.join_date,
  }).from(schema.memberships).where(eq(schema.memberships.user_id, user.id));

  console.log('  --- group membership ---');
  line('active_group_membership_count (per groupService)', activeGroupCount);
  if (!allMemberships.length) {
    console.log('    (no membership rows at all)');
  } else {
    for (const m of allMemberships) {
      console.log(`    group ${m.group_id}: status=${m.status}, role=${m.role}, join_date=${m.join_date}`);
    }
  }

  // Reproduce the exact eligibility gate activateSubscriptionIfEligible()
  // checks, so it's explicit which prerequisite (if any) is currently false.
  const eligibilityGate = {
    has_subscription_tier: user.subscription_tier === 'basic' || user.subscription_tier === 'premium',
    identity_verified: Boolean(user.identity_verified),
    payment_method_verified_at_set: Boolean(user.payment_method_verified_at),
    payout_verified_at_set: Boolean(user.payout_verified_at),
  };
  console.log('  --- activateSubscriptionIfEligible() prerequisite gate ---');
  for (const [key, value] of Object.entries(eligibilityGate)) {
    line(key, value);
  }
  const allPrerequisitesMet = Object.values(eligibilityGate).every(Boolean);
  line('ALL PREREQUISITES MET (would attempt createSubscription)', allPrerequisitesMet);
}

async function main(): Promise<void> {
  for (const email of AFFECTED_EMAILS) {
    try {
      await reportAccount(email);
    } catch (err) {
      console.error(`[ERROR] ${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await closeConnection();
}

main().catch((err) => {
  console.error('[checkAffectedAccountsStatus] Unhandled error:', err);
  process.exitCode = 1;
});
