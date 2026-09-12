/**
 * ONE-OFF DATA CORRECTION — NOT a feature, NOT a general fix.
 *
 * abdulyakubu99@gmail.com subscribed to Premium and created a group (London
 * Savers Club) that reached 3 active members and was activated, but was
 * never actually billed for their subscription — even though PR38 requires
 * a member to be billed immediately once they're a verified member of an
 * active group with >=3 members.
 *
 * Root cause (now fixed in subscriptionService.activateSubscriptionIfEligible):
 * an over-broad self-heal branch, added to unstick 3 unrelated accounts
 * (PR #33-36) that had genuinely already had a failed provider charge
 * attempt, was incorrectly matching ANY fully-onboarded member — including
 * ones who had NEVER had a `subscriptions` row created at all — and setting
 * `users.subscription_status = 'active'` directly, WITHOUT ever calling
 * createSubscription(). That silently and permanently skipped billing for
 * such members, since the real reconciliation path
 * (reconcileBillingForActiveGroupMembership) no-ops when no `subscriptions`
 * row exists.
 *
 * Because `users.subscription_status` was already (incorrectly) left/set to
 * 'active' for affected accounts, the existing at-boot self-heal job
 * (subscriptionService.activateRetroactiveEligibleSubscriptions) — which
 * filters on `subscription_status NOT IN ('active','trial')` — will never
 * pick these accounts up on its own even after the code fix ships. This
 * one-off script re-drives real activation for the specific account
 * reported as affected.
 *
 * Deliberately scoped to ONLY the email address listed in AFFECTED_EMAILS
 * below — it must never be broadened into a general "repair everyone"
 * tool. It performs a REAL provider charge attempt (via
 * subscriptionService.activateSubscriptionIfEligible ->
 * activateSubscription -> createSubscription), exactly the same as if the
 * member had just completed their last onboarding step today — it never
 * fabricates a "billed" state without an actual successful (or genuinely
 * deferred, per Section D.2) provider charge.
 *
 * Safety rules this script follows:
 *   - Skips (never touches) any account that isn't actually eligible
 *     (missing subscription tier / identity verification / verified
 *     payment method / verified payout destination) rather than fabricating
 *     that data.
 *   - Skips (never touches) any account that already has a `subscriptions`
 *     row with billing_status 'active' or 'paused' — i.e. one already
 *     correctly billed or correctly deferred — since activateSubscriptionIfEligible
 *     itself already treats that as a no-op, but we log it explicitly here
 *     for a clear audit trail.
 *   - Only ever touches the account(s) listed below.
 *
 * Usage (run once, then discard):
 *   DATABASE_URL=... npx tsx src/server/scripts/fixMissingSubscriptionBillingAfterGroupActivation.ts
 */
import { eq } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';
import { subscriptionService } from '../services/subscriptionService.js';

const AFFECTED_EMAILS = [
  'abdulyakubu99@gmail.com',
] as const;

async function fixAccount(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const userRows = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1);
  if (!userRows.length) {
    console.warn(`[SKIP] ${email}: no user found with this email — not touched.`);
    return;
  }
  const user = userRows[0];

  const beforeSub = await db.select({ billing_status: schema.subscriptions.billing_status })
    .from(schema.subscriptions).where(eq(schema.subscriptions.user_id, user.id)).limit(1);

  if (beforeSub.length && (beforeSub[0].billing_status === 'active' || beforeSub[0].billing_status === 'paused')) {
    console.log(`[SKIP] ${email} (${user.id}): already has a subscriptions row with billing_status '${beforeSub[0].billing_status}' — already billed/correctly deferred, nothing to do.`);
    return;
  }

  console.log(`[INFO] ${email} (${user.id}): no genuinely-billed subscriptions row found (subscription_status='${user.subscription_status}', tier='${user.subscription_tier}') — re-driving real activation now.`);
  await subscriptionService.activateSubscriptionIfEligible(user.id);

  const afterSub = await db.select({ billing_status: schema.subscriptions.billing_status })
    .from(schema.subscriptions).where(eq(schema.subscriptions.user_id, user.id)).limit(1);

  if (afterSub.length) {
    console.log(`[FIXED] ${email} (${user.id}): subscriptions row now exists with billing_status='${afterSub[0].billing_status}'.`);
  } else {
    console.warn(`[SKIP] ${email} (${user.id}): still no subscriptions row after activation attempt — this account is genuinely not yet eligible (check subscription_tier/identity_verified/payment_method_verified_at/payout_verified_at).`);
  }
}

async function main(): Promise<void> {
  for (const email of AFFECTED_EMAILS) {
    try {
      await fixAccount(email);
    } catch (err) {
      console.error(`[ERROR] ${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await closeConnection();
}

main().catch((err) => {
  console.error('[fixMissingSubscriptionBillingAfterGroupActivation] Unhandled error:', err);
  process.exitCode = 1;
});
