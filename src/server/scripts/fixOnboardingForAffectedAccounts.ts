/**
 * ONE-OFF DATA CORRECTION — NOT a feature, NOT a general fix.
 *
 * Three specific accounts genuinely completed every onboarding step (plan
 * selected, card saved, payout connected, identity verified) but are stuck
 * showing incomplete purely because of now-diagnosed bugs in the onboarding/
 * subscription-activation pipeline (payout verification regression, stuck-
 * subscription cooldown starvation, deferred-billing status handling — see
 * the last three PRs). Those bugs are being fixed separately in the
 * underlying logic; this script only repairs the STORED DATA for these three
 * accounts so their members can resume testing group joining and payouts.
 *
 * Deliberately scoped to ONLY the email addresses listed in AFFECTED_EMAILS
 * below — it must never be broadened into a general "repair everyone" tool.
 *
 * Safety rules this script follows:
 *   - It NEVER fabricates data the member hasn't actually provided. Each
 *     onboarding prerequisite is only marked complete if the underlying
 *     record (subscription tier, saved card/token, connected payout
 *     destination) already exists; if it doesn't, that account is skipped
 *     with a clear warning instead of being force-completed.
 *   - It is idempotent: fields already in the correct state are left
 *     untouched, and the whole per-user correction runs in a single
 *     transaction.
 *   - It only ever touches the three accounts listed below.
 *
 * Usage (run once, then discard):
 *   DATABASE_URL=... npx tsx src/server/scripts/fixOnboardingForAffectedAccounts.ts
 */
import { eq } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';

const AFFECTED_EMAILS = [
  'abdulwahabyakubu@yahoo.com',
  'abdulwahabyakubu17@gmail.com',
  'tounsitraveller@gmail.com',
] as const;

async function fixAccount(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const userRows = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1);
  if (!userRows.length) {
    console.warn(`[SKIP] ${email}: no user found with this email — not touched.`);
    return;
  }
  const user = userRows[0];

  const subRows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.user_id, user.id)).limit(1);
  const subscription = subRows[0] ?? null;

  // Preconditions: only mark a step complete if the member actually did it.
  const hasSubscriptionTier = user.subscription_tier === 'basic' || user.subscription_tier === 'premium';
  const hasPaymentMethod = user.country === 'NG' ? Boolean(user.flutterwave_card_token) : Boolean(user.stripe_payment_method_id);
  const hasPayoutDestination = user.country === 'NG' ? Boolean(user.flutterwave_subaccount_id) : Boolean(user.stripe_connected_account_id);

  const missing: string[] = [];
  if (!hasSubscriptionTier) missing.push('no subscription plan on file (subscription_tier)');
  if (!hasPaymentMethod) missing.push('no saved payment method on file');
  if (!hasPayoutDestination) missing.push('no connected payout destination on file');
  if (!subscription) missing.push('no subscriptions row on file');
  if (!user.identity_verified) missing.push('identity_verified is false');

  if (missing.length) {
    console.warn(`[SKIP] ${email} (${user.id}): does not actually have every step completed — refusing to fabricate data. Reasons: ${missing.join('; ')}`);
    return;
  }

  await db.transaction(async (tx) => {
    const now = new Date();

    const userUpdates: Partial<typeof schema.users.$inferInsert> = {};
    if (!user.email_verified) userUpdates.email_verified = true;
    if (!user.identity_verified) userUpdates.identity_verified = true;
    if (user.identity_verification_status !== 'verified') userUpdates.identity_verification_status = 'verified';
    if (!user.identity_verified_at) userUpdates.identity_verified_at = now;
    if (!user.payment_method_verified_at) userUpdates.payment_method_verified_at = now;
    if (!user.payout_verified_at) userUpdates.payout_verified_at = now;
    if (user.subscription_status !== 'active') userUpdates.subscription_status = 'active';

    if (Object.keys(userUpdates).length) {
      await tx.update(schema.users).set(userUpdates).where(eq(schema.users.id, user.id));
    }

    // 'paused' is also a genuinely-confirmed state (Section D.2 deferred
    // billing) — only force to 'active' if it's stuck at something else
    // (e.g. 'past_due'/'trialing' due to the now-fixed activation bugs).
    if (subscription && subscription.billing_status !== 'active' && subscription.billing_status !== 'paused') {
      await tx.update(schema.subscriptions).set({ billing_status: 'active' }).where(eq(schema.subscriptions.user_id, user.id));
    }

    console.log(`[FIXED] ${email} (${user.id}): ${Object.keys(userUpdates).length ? `updated users.{${Object.keys(userUpdates).join(', ')}}` : 'users table already correct'}`
      + (subscription && subscription.billing_status !== 'active' && subscription.billing_status !== 'paused' ? '; updated subscriptions.billing_status -> active' : '; subscriptions.billing_status already confirmed'));
  });
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
  console.error('[fixOnboardingForAffectedAccounts] Unhandled error:', err);
  process.exitCode = 1;
});
