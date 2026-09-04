/**
 * Confirms (from live data, not assumption) whether users.subscription_tier
 * for the one specific account below has drifted out of sync with
 * subscriptions.plan — the field tied to the account's actual provider
 * subscription object, i.e. what is genuinely being billed — and corrects
 * it ONLY if a mismatch is actually found.
 *
 * Background: switchPlan()'s upgrade branch used to write
 * users.subscription_tier = newTier unconditionally, even when the upgrade
 * charge itself was declined/never confirmed (upgradeBillingIsActive was
 * false). That bug is fixed separately in subscriptionService.ts. This
 * script is the one-off correction for the single account already flagged
 * as possibly affected by it (its payment-failure email showed a Premium
 * amount, £14.99, while the account was expected to be on Basic).
 *
 * Deliberately scoped to ONLY the email address in AFFECTED_EMAIL below.
 * Idempotent — safe to re-run any number of times: it only writes when it
 * finds subscriptions.plan and users.subscription_tier genuinely disagree,
 * and does nothing (besides reporting the current state) otherwise.
 *
 * Usage (read-only unless a mismatch is found):
 *   DATABASE_URL=... npx tsx src/server/scripts/fixMismatchedSubscriptionTierForAccount.ts
 */
import { eq } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';
import { isSubscriptionTierKey, type SubscriptionTierKey } from '../lib/constants.js';

const AFFECTED_EMAIL = 'abdulwahabyakubu17@gmail.com';

/** Mirrors webhookStripeController.ts's tierFromPlanCode(). */
function tierFromPlanCode(plan?: string | null): SubscriptionTierKey | null {
  if (!plan) return null;
  if (plan.endsWith('_premium')) return 'premium';
  if (plan.endsWith('_basic')) return 'basic';
  return null;
}

async function main(): Promise<void> {
  const normalizedEmail = AFFECTED_EMAIL.trim().toLowerCase();
  const userRows = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1);
  if (!userRows.length) {
    console.log(`[fixMismatchedSubscriptionTierForAccount] No user found for ${AFFECTED_EMAIL}. Nothing to do.`);
    await closeConnection();
    return;
  }
  const user = userRows[0];
  console.log(`[fixMismatchedSubscriptionTierForAccount] ${AFFECTED_EMAIL} (user ${user.id})`);
  console.log(`    users.subscription_tier      : ${user.subscription_tier ?? '(null)'}`);

  const subRows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.user_id, user.id)).limit(1);
  if (!subRows.length) {
    console.log('    subscriptions row            : NONE — no billed plan to compare against, leaving subscription_tier untouched.');
    await closeConnection();
    return;
  }
  const sub = subRows[0];
  console.log(`    subscriptions.plan           : ${sub.plan ?? '(null)'}`);
  console.log(`    subscriptions.billing_status : ${sub.billing_status ?? '(null)'}`);

  const billedTier = tierFromPlanCode(sub.plan);
  if (!billedTier) {
    console.log('    subscriptions.plan does not encode a recognisable tier — leaving subscription_tier untouched.');
    await closeConnection();
    return;
  }

  if (!isSubscriptionTierKey(user.subscription_tier)) {
    console.log(`    users.subscription_tier is not set to a valid tier (${user.subscription_tier ?? '(null)'}) — leaving untouched; this script only corrects a tier mismatch, not a missing tier.`);
    await closeConnection();
    return;
  }

  if (user.subscription_tier === billedTier) {
    console.log(`    MATCH — users.subscription_tier already agrees with the billed plan (${billedTier}). No correction needed.`);
    await closeConnection();
    return;
  }

  console.log(`    MISMATCH — users.subscription_tier (${user.subscription_tier}) disagrees with the billed plan (${billedTier}). Correcting...`);
  await db.update(schema.users).set({ subscription_tier: billedTier }).where(eq(schema.users.id, user.id));
  console.log(`    DONE — users.subscription_tier for ${AFFECTED_EMAIL} set to ${billedTier}.`);

  await closeConnection();
}

main().catch((err) => {
  console.error('[fixMismatchedSubscriptionTierForAccount] Unhandled error:', err);
  process.exitCode = 1;
});
