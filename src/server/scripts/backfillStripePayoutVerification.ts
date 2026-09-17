/**
 * ONE-OFF DATA CORRECTION — retroactively applies, immediately and across
 * every affected account, the fix just made to the `payout_verified_at`
 * gating condition:
 *   - webhookStripeController.ts's `account.updated` handler, and
 *   - paymentEligibilityService.ts's `refreshStripePayoutVerification`
 *     self-heal (invoked from getPaymentEligibility/getOnboardingProgress,
 *     which the dashboard calls via GET /api/users/onboarding-status on
 *     every load, and POST /api/payments/verify-payout).
 *
 * Root cause this retroactively repairs: both of the above required
 * `charges_enabled && payouts_enabled` before setting `payout_verified_at`.
 * Stripe Express connected accounts created by
 * StripeProvider.createConnectedAccount only ever request the `transfers`
 * capability (never a charge-type capability like `card_payments`) — they
 * receive platform-initiated transfers/payouts, never accept card charges of
 * their own — so `charges_enabled` never becomes true for ANY of these
 * accounts, even once Stripe's own dashboard shows Capabilities "Active" for
 * both Payouts and Transfers. That made `payout_verified_at` permanently
 * unreachable for every Stripe (non-NG) recipient, not just a handful of
 * accounts — so unlike the other one-off scripts in this directory, this one
 * is deliberately NOT scoped to a hardcoded email list; it backfills every
 * account the bug could have affected.
 *
 * Both gates have already been corrected to check `payouts_enabled` alone.
 * Any member who reloads their dashboard (or clicks "Verify" on the payout
 * settings page) after that fix ships will self-heal automatically. This
 * script exists because rotationService.transferCyclePotToRecipient() reads
 * `users.payout_verified_at` directly from the database when a payout comes
 * due — it does NOT re-check with Stripe or call the self-heal — so an
 * account whose payout falls due before the member happens to trigger the
 * self-heal path would still fail with "Recipient has no verified Stripe
 * Express payout account" even though Stripe has genuinely approved payouts.
 * Running this once, immediately, closes that timing gap for every account
 * already stuck instead of leaving it to chance.
 *
 * Safety rules this script follows (same pattern as the other scripts in
 * this directory):
 *   - Only ever considers non-NG (Stripe) users with a
 *     `stripe_connected_account_id` on file and `payout_verified_at` still
 *     null — NG/Flutterwave accounts have no equivalent Stripe capability
 *     check and are never touched.
 *   - Never fabricates verification: it calls
 *     getPaymentEligibility(userId), which only ever SETS
 *     `payout_verified_at` after a live, read-only check against Stripe
 *     (`stripe.accounts.retrieve`) confirms `payouts_enabled` is genuinely
 *     true. An account Stripe hasn't actually approved is left untouched
 *     and reported as such.
 *   - Idempotent: re-running finds `payout_verified_at` already set and
 *     no-ops (getPaymentEligibility's self-heal itself short-circuits when
 *     it's already set).
 *
 * Usage:
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx src/server/scripts/backfillStripePayoutVerification.ts
 */
import { eq, and, isNull, isNotNull, ne } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';
import { getPaymentEligibility } from '../services/paymentEligibilityService.js';

async function main(): Promise<void> {
  const candidates = await db.select({
    id:    schema.users.id,
    email: schema.users.email,
  }).from(schema.users).where(and(
    ne(schema.users.country, 'NG'),
    isNotNull(schema.users.stripe_connected_account_id),
    isNull(schema.users.payout_verified_at),
  ));

  console.log(`Found ${candidates.length} Stripe account(s) with payout_verified_at still null.`);

  let verifiedCount = 0;
  let stillUnverifiedCount = 0;

  for (const user of candidates) {
    try {
      const eligibility = await getPaymentEligibility(user.id);
      if (eligibility.payoutVerified) {
        verifiedCount += 1;
        console.log(`[VERIFIED] ${user.email} (${user.id}): Stripe confirms payouts_enabled — payout_verified_at now set.`);
      } else {
        stillUnverifiedCount += 1;
        console.log(`[STILL PENDING] ${user.email} (${user.id}): Stripe does not yet report payouts_enabled — genuinely not ready, left untouched.`);
      }
    } catch (err) {
      console.error(`[ERROR] ${user.email} (${user.id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nDone. ${verifiedCount} account(s) newly verified, ${stillUnverifiedCount} still genuinely pending with Stripe.`);
  await closeConnection();
}

main().catch((err) => {
  console.error('[backfillStripePayoutVerification] Unhandled error:', err);
  process.exitCode = 1;
});
