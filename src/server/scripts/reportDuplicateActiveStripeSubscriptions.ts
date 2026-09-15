/**
 * READ-ONLY REPORTING SCRIPT — makes NO writes of any kind, fixes nothing.
 *
 * Companion to the duplicate-Stripe-subscription creation-path fix (see
 * StripeProvider.createSubscription — it now lists a customer's existing
 * Stripe subscriptions and reuses any active/trialing one instead of ever
 * creating a second, plus a user-ID-derived Stripe idempotency key on the
 * create call itself as a hard backstop). That fix stops any NEW duplicate
 * Stripe subscriptions from being created; it does nothing to surface
 * accounts that already have (or, despite the fix, somehow still end up
 * with) more than one active/trialing Stripe subscription object.
 *
 * This script is meant to be run periodically (manually, by whoever owns
 * billing — no developer needed) to catch that early: for every GB/Stripe
 * member with a `stripe_customer_id` on file, it re-checks (read-only,
 * `stripe.subscriptions.list`, via
 * StripeProvider.listSubscriptionsForCustomer()) EVERY Stripe subscription
 * object that exists for that customer and reports any customer with MORE
 * THAN ONE subscription in status 'active' or 'trialing' — the exact
 * condition that indicates a genuine duplicate (as opposed to e.g. one
 * abandoned 'incomplete'/'past_due' subscription sitting alongside the real
 * one, which is not a duplicate-billing problem and is left unreported).
 *
 * Does not fix, cancel, or reconcile anything — it only reads Stripe's own
 * records and prints a report. Cleaning up any duplicates found is a
 * deliberate manual/human decision (which subscription to keep, whether a
 * refund is owed, etc.), not something this script decides.
 *
 * Usage (safe to re-run any number of times):
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx src/server/scripts/reportDuplicateActiveStripeSubscriptions.ts
 */
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';
import { getStripeProvider } from '../integrations/payments/PaymentProviderFactory.js';

type DuplicateReportRow = {
  userId: string;
  email: string;
  stripeCustomerId: string;
  activeOrTrialingSubscriptions: { id: string; status: string; createdAt: string }[];
};

async function findDuplicates(): Promise<DuplicateReportRow[]> {
  // Only GB/Stripe members ever have a stripe_customer_id — Flutterwave
  // (NG) has no equivalent multi-subscription-object concept, so there is
  // nothing to check for those accounts.
  const candidates = await db.select({
    id:                 schema.users.id,
    email:              schema.users.email,
    stripe_customer_id: schema.users.stripe_customer_id,
  })
    .from(schema.users)
    .where(and(
      eq(schema.users.country, 'GB'),
      isNotNull(schema.users.stripe_customer_id),
      ne(schema.users.stripe_customer_id, ''),
    ));

  const stripeProvider = getStripeProvider();
  const duplicates: DuplicateReportRow[] = [];

  for (const candidate of candidates) {
    if (!candidate.stripe_customer_id) continue;

    let subscriptions;
    try {
      subscriptions = await stripeProvider.listSubscriptionsForCustomer(candidate.stripe_customer_id);
    } catch (err) {
      console.error(`[ERROR] ${candidate.email} (${candidate.stripe_customer_id}): could not list Stripe subscriptions — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const activeOrTrialing = subscriptions.filter(sub => sub.status === 'active' || sub.status === 'trialing');
    if (activeOrTrialing.length <= 1) continue;

    duplicates.push({
      userId:           candidate.id,
      email:            candidate.email,
      stripeCustomerId: candidate.stripe_customer_id,
      activeOrTrialingSubscriptions: activeOrTrialing.map(sub => ({
        id:        sub.id,
        status:    sub.status,
        createdAt: new Date(sub.created * 1000).toISOString(),
      })),
    });
  }

  return duplicates;
}

async function main(): Promise<void> {
  console.log('[reportDuplicateActiveStripeSubscriptions] Scanning all GB/Stripe members for customers with more than one active/trialing Stripe subscription (read-only — no writes will be made)...');

  const duplicates = await findDuplicates();

  if (!duplicates.length) {
    console.log('[reportDuplicateActiveStripeSubscriptions] No customers found with more than one active/trialing Stripe subscription.');
  } else {
    console.log(`[reportDuplicateActiveStripeSubscriptions] Found ${duplicates.length} customer(s) with more than one active/trialing Stripe subscription:\n`);
    for (const row of duplicates) {
      console.log(`  ${row.email} (userId=${row.userId}, stripe_customer_id=${row.stripeCustomerId})`);
      for (const sub of row.activeOrTrialingSubscriptions) {
        console.log(`    - ${sub.id}  status=${sub.status}  created=${sub.createdAt}`);
      }
    }
    console.log('\nThese accounts are billing on more than one Stripe subscription at once — review each in the Stripe dashboard and manually cancel the duplicate(s) once you have decided which subscription (and any owed refund) to keep. This script does not cancel or modify anything itself.');
  }

  await closeConnection();
}

main().catch((err) => {
  console.error('[reportDuplicateActiveStripeSubscriptions] Unhandled error:', err);
  process.exitCode = 1;
});
