/**
 * ONE-OFF DATA CORRECTION — NOT a feature, NOT a general fix. Companion to
 * the activateSubscription() `past_due` fix in subscriptionService.ts (see
 * that file's comments) — that fix stops any NEW duplicate Stripe
 * subscriptions from being created, but does nothing for accounts that
 * already ended up with more than one Stripe subscription object BEFORE it
 * shipped.
 *
 * Root cause this retroactively repairs: before the fix above,
 * activateSubscription() could call createSubscription() a second time for
 * a member whose Stripe subscription was already stuck 'past_due' —
 * creating a SECOND, separate Stripe subscription object for the same
 * customer instead of retrying the first one. `subscriptions.
 * provider_subscription_id` only ever stores ONE id, so once a second
 * subscription object existed, that column could be left pointing at
 * whichever one was created earlier — even if a LATER one is the one that
 * actually went active/trialing with Stripe. Two consequences:
 *   1. PadiHub's own `subscriptions.billing_status`/`users.subscription_status`
 *      stay stuck 'past_due'/'expired' forever, because nothing ever
 *      re-checks the abandoned id against Stripe.
 *   2. Stripe's invoice.payment_succeeded webhook for the OTHER (genuinely
 *      paid) subscription is silently ignored by webhookStripeController.ts
 *      (`if (!sub) ... break;`) because no `subscriptions` row's
 *      provider_subscription_id matches that event's subscription id — so
 *      the member never gets the "subscription active"
 *      confirmation/renewal email either, even though Stripe shows the
 *      charge as Succeeded.
 *
 * This script re-checks, for each of the specific emails below, EVERY
 * Stripe subscription object that exists for that customer (read-only
 * `stripe.subscriptions.list`, via
 * StripeProvider.listSubscriptionsForCustomer()) and — only if it finds one
 * that is genuinely active/trialing with Stripe — repoints the local
 * `subscriptions` row at that real id and corrects billing_status/
 * renewal_date/users.subscription_status to match. It never creates,
 * cancels, or charges anything with the provider; it only re-reads
 * Stripe's own existing records and reconciles PadiHub's local copy. The
 * actual reconciliation logic now lives in
 * subscriptionService.reconcileStaleStripeSubscriptionReference() — this
 * script is a thin, explicitly-scoped wrapper around it — because
 * retryStripeIncompleteSubscriptionCharge() (called automatically from
 * scheduledJobs.weeklySubscriptionHealthCheck) now runs the very same check
 * for every past_due account, not just the ones hardcoded below. This
 * script remains useful to force an immediate, explicit reconciliation for
 * specific accounts without waiting for that job to next run.
 *
 * Safety rules this script follows (same pattern as the other scripts in
 * this directory):
 *   - Only ever touches the specific email addresses listed in
 *     AFFECTED_EMAILS below — never enumerates or bulk-scans every account.
 *   - Skips (never touches) NG/Flutterwave accounts — Flutterwave has no
 *     equivalent "multiple subscription objects" concept here.
 *   - Skips (never touches) any account whose local billing_status is
 *     already 'active' (nothing to reconcile) or 'cancelled' (never
 *     resurrect a deliberately-cancelled subscription).
 *   - Idempotent: re-running after a successful reconciliation finds
 *     billing_status already 'active' and no-ops.
 *   - If Stripe genuinely shows no active/trialing subscription for a
 *     customer (a real, unresolved decline), the account is left untouched
 *     and reported as such — this script never fabricates an "active"
 *     state Stripe hasn't actually confirmed.
 *
 * Usage:
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx src/server/scripts/reconcileStaleStripeSubscriptionReferences.ts
 */
import { eq } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';
import { subscriptionService } from '../services/subscriptionService.js';

const AFFECTED_EMAILS = [
  'abdulyakubu99@gmail.com',
  'tounsitraveller@gmail.com',
  'abdulwahabyakubu17@gmail.com',
  'abdulwahabyakubu@yahoo.com',
] as const;

async function reconcileAccount(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const userRows = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1);
  if (!userRows.length) {
    console.warn(`[SKIP] ${email}: no user found with this email.`);
    return;
  }
  const user = userRows[0];

  if (user.country === 'NG') {
    console.warn(`[SKIP] ${email}: NG members use Flutterwave — no Stripe subscription objects to reconcile.`);
    return;
  }
  if (!user.stripe_customer_id) {
    console.warn(`[SKIP] ${email}: no stripe_customer_id on file — nothing to reconcile against.`);
    return;
  }

  const subRows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.user_id, user.id)).limit(1);
  if (!subRows.length) {
    console.warn(`[SKIP] ${email}: no local subscriptions row exists — nothing to reconcile.`);
    return;
  }
  const sub = subRows[0];

  if (sub.provider !== 'stripe') {
    console.warn(`[SKIP] ${email}: local subscription provider is '${sub.provider}', not stripe — nothing to reconcile.`);
    return;
  }
  if (sub.billing_status === 'active') {
    console.log(`[SKIP] ${email}: billing_status is already 'active' — nothing to reconcile.`);
    return;
  }
  if (sub.billing_status === 'cancelled') {
    console.log(`[SKIP] ${email}: billing_status is 'cancelled' — never resurrecting a deliberately-cancelled subscription.`);
    return;
  }

  console.log(`[INFO] ${email}: local subscription is billing_status='${sub.billing_status}' (provider_subscription_id=${sub.provider_subscription_id ?? '(none)'}) — checking Stripe for every subscription object on customer ${user.stripe_customer_id}...`);

  const reconciled = await subscriptionService.reconcileStaleStripeSubscriptionReference(user.id, user.stripe_customer_id, sub.provider_subscription_id);
  if (!reconciled) {
    console.log(`[SKIP] ${email}: none of Stripe's subscription objects for this customer are active/trialing (or Stripe reports none at all) — this is a genuine, still-unresolved failure, not a stale reference. Leaving untouched.`);
    return;
  }

  const refreshedRows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, sub.id)).limit(1);
  const refreshed = refreshedRows[0];
  console.log(`[DONE] ${email}: subscriptions row now points at ${refreshed?.provider_subscription_id ?? '(unknown)'}, billing_status='${refreshed?.billing_status ?? '(unknown)'}', renewal_date=${refreshed?.renewal_date?.toISOString() ?? '(unknown)'}.`);
}

async function main(): Promise<void> {
  for (const email of AFFECTED_EMAILS) {
    try {
      await reconcileAccount(email);
    } catch (err) {
      console.error(`[ERROR] ${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await closeConnection();
}

main().catch((err) => {
  console.error('[reconcileStaleStripeSubscriptionReferences] Unhandled error:', err);
  process.exitCode = 1;
});
