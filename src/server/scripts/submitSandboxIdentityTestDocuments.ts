/**
 * SANDBOX/TEST-MODE-ONLY TEST UTILITY — NOT a production data-fix, NOT a
 * general-purpose feature.
 *
 * Stripe Connect requires an identity document (passport/driving licence/
 * etc.) on file for every Express connected account before it will enable
 * charges/payouts/transfers — this is the "Provide an identity document"
 * warning shown in the Stripe Dashboard's Connected accounts view. In
 * production, this must always be satisfied by the account holder
 * themselves through Stripe's hosted onboarding flow (createOnboardingLink()
 * in StripeProvider.ts, reached via /payments/payout's "Connect"/"Change
 * payout account" flow) — never by this script.
 *
 * In Stripe's TEST/sandbox mode only, Stripe provides a special file token,
 * `file_identity_document_success`, that instantly satisfies this
 * requirement without any real document — see
 * https://docs.stripe.com/connect/testing#test-file-tokens. This script
 * submits that token for the connected accounts of the given member emails,
 * so their sandbox Stripe Connect accounts stop blocking payouts/transfers
 * during manual QA.
 *
 * SAFETY — this must NEVER run against a real/production Stripe account:
 *   - StripeProvider.submitSandboxIdentityTestDocument() hard-refuses unless
 *     STRIPE_SECRET_KEY is a test-mode key (starts with "sk_test_") AND
 *     NODE_ENV !== 'production' — Stripe would in any case reject the test
 *     file token as an invalid file ID against a live key, but this script
 *     does not rely on that alone.
 *   - It only ever touches the specific user emails passed as CLI
 *     arguments — it never enumerates or bulk-modifies every connected
 *     account in the database.
 *   - It is idempotent: an account whose identity-document requirement is
 *     already satisfied is skipped with a clear message, and NG members
 *     (Flutterwave, no Stripe Connect account) are skipped too.
 *
 * Usage (sandbox only):
 *   DATABASE_URL=... STRIPE_SECRET_KEY=sk_test_... \
 *     npx tsx src/server/scripts/submitSandboxIdentityTestDocuments.ts user1@example.com user2@example.com
 */
import { eq } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';
import { getStripeProvider } from '../integrations/payments/PaymentProviderFactory.js';

async function processAccount(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const userRows = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1);
  if (!userRows.length) {
    console.warn(`[SKIP] ${email}: no user found with this email.`);
    return;
  }
  const user = userRows[0];

  if (user.country === 'NG') {
    console.warn(`[SKIP] ${email}: NG members use Flutterwave, not Stripe Connect — nothing to do.`);
    return;
  }
  if (!user.stripe_connected_account_id) {
    console.warn(`[SKIP] ${email}: no Stripe connected account on file yet — nothing to submit a document against.`);
    return;
  }

  const stripeProvider = getStripeProvider();
  const outstanding = await stripeProvider.getOutstandingRequirements(user.stripe_connected_account_id);
  const needsDocument = outstanding.some(requirement => requirement.includes('verification.document'));
  if (!needsDocument) {
    console.log(`[SKIP] ${email} (${user.stripe_connected_account_id}): identity document requirement already satisfied (outstanding: ${outstanding.join(', ') || 'none'}).`);
    return;
  }

  await stripeProvider.submitSandboxIdentityTestDocument(user.stripe_connected_account_id);
  console.log(`[SUBMITTED] ${email} (${user.stripe_connected_account_id}): submitted Stripe test-mode identity document token.`);
}

async function main(): Promise<void> {
  const emails = process.argv.slice(2);
  if (!emails.length) {
    console.error('Usage: npx tsx src/server/scripts/submitSandboxIdentityTestDocuments.ts <email> [email...]');
    process.exitCode = 1;
    await closeConnection();
    return;
  }

  for (const email of emails) {
    try {
      await processAccount(email);
    } catch (err) {
      console.error(`[ERROR] ${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await closeConnection();
}

main().catch((err) => {
  console.error('[submitSandboxIdentityTestDocuments] Unhandled error:', err);
  process.exitCode = 1;
});
