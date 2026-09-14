/**
 * Monitoring service — tracks API errors, DB errors, email failures,
 * webhook failures, failed scheduled jobs, payment errors, identity errors.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { getStripeProvider } from '../integrations/payments/PaymentProviderFactory.js';

/**
 * /api/system/health is unauthenticated and may be polled frequently by
 * uptime monitors — verifyPriceConfig() below makes a live call to Stripe,
 * so cache its result briefly rather than hitting Stripe's API on every
 * single health check request.
 */
const STRIPE_PRICE_CONFIG_CACHE_MS = 5 * 60 * 1000;
let cachedStripePriceConfig: { basic: boolean; premium: boolean; issues: string[] } | null = null;
let cachedStripePriceConfigAt = 0;

async function getStripePriceConfigStatus(): Promise<{ basic: boolean; premium: boolean; issues: string[] }> {
  if (cachedStripePriceConfig && Date.now() - cachedStripePriceConfigAt < STRIPE_PRICE_CONFIG_CACHE_MS) {
    return cachedStripePriceConfig;
  }
  try {
    const { basic, premium } = await getStripeProvider().verifyPriceConfig();
    const issues = [basic.error, premium.error].filter((msg): msg is string => Boolean(msg));
    cachedStripePriceConfig = { basic: basic.valid, premium: premium.valid, issues };
  } catch (err) {
    // e.g. STRIPE_SECRET_KEY itself isn't set — verifyPriceConfig() couldn't
    // even attempt the live check.
    const message = err instanceof Error ? err.message : String(err);
    cachedStripePriceConfig = { basic: false, premium: false, issues: [message] };
  }
  cachedStripePriceConfigAt = Date.now();
  // /api/system/health is intentionally unauthenticated (for uptime
  // monitors), so the specific Price ID/error text must NEVER be returned
  // in that public response — log it instead to systemErrors, visible only
  // via the admin-gated /api/system/errors endpoint, at most once per cache
  // window so a persistently-broken Price ID doesn't spam the error log on
  // every poll.
  if (cachedStripePriceConfig.issues.length) {
    for (const issue of cachedStripePriceConfig.issues) {
      await monitoringService.logError({
        type: 'payment_error', endpoint: '/api/system/health',
        message: `Stripe Price ID configuration problem: ${issue}`,
      });
    }
  }
  return cachedStripePriceConfig;
}

export type ErrorType =
  | 'api_error'
  | 'database_error'
  | 'email_failure'
  | 'webhook_failure'
  | 'scheduled_job_failure'
  | 'payment_error'
  | 'identity_error';

export const monitoringService = {
  async logError(params: {
    type: ErrorType;
    endpoint?: string;
    message: string;
  }): Promise<void> {
    try {
      await db.insert(schema.systemErrors).values({
        id:       uuidv4(),
        type:     params.type,
        endpoint: params.endpoint,
        message:  params.message,
        resolved: false,
      });
    } catch (err) {
      // Never throw from monitoring — log to console as last resort
      console.error('[MonitoringService] Failed to log error:', err);
    }
  },

  async getRecentErrors(sinceHours = 24) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    return db.select().from(schema.systemErrors)
      .where(and(
        eq(schema.systemErrors.resolved, false),
        gte(schema.systemErrors.created_at, since),
      ))
      .orderBy(desc(schema.systemErrors.created_at));
  },

  async resolveError(id: string): Promise<void> {
    await db.update(schema.systemErrors)
      .set({ resolved: true })
      .where(eq(schema.systemErrors.id, id));
  },

  /** Health check — tests each integration */
  async getHealthStatus(): Promise<{
    status: 'ok' | 'degraded';
    db: boolean;
    email: boolean;
    stripe: boolean;
    flutterwave: boolean;
    identity: boolean;
  }> {
    let dbOk = false;
    let emailOk = false;
    let stripeOk = false;
    let flutterwaveOk = false;
    let identityOk = false;

    // DB check
    try {
      await db.select({ id: schema.users.id }).from(schema.users).limit(1);
      dbOk = true;
    } catch { /* degraded */ }

    // Email check — just verify key is present
    emailOk = !!process.env.RESEND_API_KEY;

    // Stripe check — the secret key must be present AND the configured
    // Basic/Premium Price IDs must actually resolve to real, active Prices
    // in that same Stripe account/mode. A present-but-wrong Price ID (e.g.
    // copied from a different Stripe account/mode) previously reported as
    // healthy here while every real subscription attempt silently 400'd —
    // see StripeProvider.verifyPriceConfig().
    const stripeKeyOk = !!process.env.STRIPE_SECRET_KEY;
    const priceConfig = stripeKeyOk ? await getStripePriceConfigStatus() : null;
    stripeOk = stripeKeyOk && Boolean(priceConfig?.basic) && Boolean(priceConfig?.premium);

    // Flutterwave check — verify key is present
    flutterwaveOk = !!process.env.FLUTTERWAVE_SECRET_KEY;

    // Identity check — verify Stripe Identity webhook secret is present
    identityOk = !!process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;

    const allOk = dbOk && emailOk && stripeOk && flutterwaveOk && identityOk;
    return {
      status:      allOk ? 'ok' : 'degraded',
      db:          dbOk,
      email:       emailOk,
      stripe:      stripeOk,
      flutterwave: flutterwaveOk,
      identity:    identityOk,
    };
  },

  /** Record a job run result */
  async recordJobRun(params: {
    jobName: string;
    status: 'success' | 'failed';
    startedAt: Date;
    completedAt?: Date;
    errorMessage?: string;
  }): Promise<void> {
    await db.insert(schema.jobRuns).values({
      id:            uuidv4(),
      job_name:      params.jobName,
      status:        params.status,
      started_at:    params.startedAt,
      completed_at:  params.completedAt,
      error_message: params.errorMessage,
    });
  },

  /**
   * Has this job already been recorded (any outcome) since the given
   * timestamp? Used by the in-process scheduler fallback (see
   * ../lib/inProcessScheduler.ts) to avoid re-firing a job that already ran
   * for the current day/week/month period — e.g. after a mid-slot restart.
   */
  async hasRunSince(jobName: string, since: Date): Promise<boolean> {
    const rows = await db.select({ id: schema.jobRuns.id }).from(schema.jobRuns)
      .where(and(eq(schema.jobRuns.job_name, jobName), gte(schema.jobRuns.started_at, since)))
      .limit(1);
    return rows.length > 0;
  },

  /** Get last run per job */
  async getJobStatuses() {
    const runs = await db.select().from(schema.jobRuns)
      .orderBy(desc(schema.jobRuns.started_at))
      .limit(200);

    // Deduplicate — keep most recent per job_name
    const seen = new Map<string, typeof runs[0]>();
    for (const run of runs) {
      if (!seen.has(run.job_name)) seen.set(run.job_name, run);
    }
    return Array.from(seen.values());
  },
};
