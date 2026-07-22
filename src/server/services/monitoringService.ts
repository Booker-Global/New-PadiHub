/**
 * Monitoring service — tracks API errors, DB errors, email failures,
 * webhook failures, failed scheduled jobs, payment errors, identity errors.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';

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

    // Stripe check — verify key is present
    stripeOk = !!process.env.STRIPE_SECRET_KEY;

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
