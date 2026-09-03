/**
 * Database connection setup using Drizzle ORM with MySQL2
 *
 * Configured for cloud deployments (Render, etc.) with:
 * - Extended connect timeout for cold-starting databases
 * - TCP keepalive to prevent NAT/firewall idle drops
 * - Retry logic on startup health check
 */

import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { getDatabaseCredentials } from './config';
import * as schema from './schema';
import { TRUST_SCORE_INITIAL, TRUST_SCORE_MIN, TRUST_SCORE_DELTA_IDENTITY_VERIFIED } from '../lib/constants';

// Get database configuration
const dbConfig = getDatabaseCredentials();

// Create MySQL connection pool with SSL enabled
const poolConnection = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  ssl: {
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Cloud deployment resilience settings:
  connectTimeout: 30000,        // 30s — allows for cold-starting DB instances
  enableKeepAlive: true,        // Prevents idle connections from being dropped by NAT/firewalls
  keepAliveInitialDelay: 10000, // First keepalive probe after 10s of idle
});

// Create Drizzle instance
export const db = drizzle(poolConnection, { schema, mode: 'default' });

/**
 * Return a sanitised description of the DB target for diagnostic logging.
 * Never includes passwords.
 */
export function getConnectionTarget(): string {
  return `${dbConfig.host}:${dbConfig.port}/${dbConfig.database} (user: ${dbConfig.user})`;
}

/**
 * Test database connection with retry logic for transient failures.
 * @param retries Number of retry attempts (default 3)
 * @param delayMs Initial delay between retries in ms (doubles each attempt)
 */
export async function testConnection(retries = 3, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await poolConnection.getConnection();
      await connection.ping();
      connection.release();
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isLastAttempt = attempt === retries;
      console.warn(
        `[PadiHub] DB connection attempt ${attempt}/${retries} to ${getConnectionTarget()} failed: ${errMsg}`
      );
      if (isLastAttempt) {
        return false;
      }
      // Exponential back-off before next retry
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  return false;
}

/**
 * Close database connection pool
 */
export async function closeConnection(): Promise<void> {
  await poolConnection.end();
}

/**
 * Columns that `schema.ts` expects to exist on `users` but that a deploy
 * could miss if only app code (not `npm run db:push`) was redeployed. Every
 * `select()` (select-all) query — e.g. userService.getProfile — asks MySQL
 * for all of these columns, so a single missing one turns into an "Unknown
 * column" error that the generic error handler reports as a vague
 * "An unexpected error occurred.", surfacing on both /profile and /dashboard.
 *
 * This list should stay in sync with any new nullable columns added to
 * schema.ts on the tables below. It intentionally only contains additive,
 * nullable columns — this helper never drops or alters existing
 * columns/data.
 */
const REQUIRED_COLUMNS: Record<string, Array<{ column: string; sqlType: string }>> = {
  // Every nullable column on `users` is listed here (not just the most
  // recently-added ones) because `userService.getProfile` performs a
  // select-all query — any single missing column, old or new, turns that
  // request into an "Unknown column" 500 that the generic error handler
  // reports as "An unexpected error occurred", surfacing simultaneously as
  // both the /profile banner and toast (and on /dashboard, which reads the
  // same row).
  users: [
    { column: 'display_name',               sqlType: 'VARCHAR(100) NULL' },
    { column: 'phone_number',                sqlType: 'VARCHAR(30) NULL' },
    { column: 'stripe_customer_id',          sqlType: 'VARCHAR(100) NULL' },
    { column: 'stripe_payment_method_id',    sqlType: 'VARCHAR(100) NULL' },
    { column: 'stripe_connected_account_id', sqlType: 'VARCHAR(100) NULL' },
    { column: 'flutterwave_customer_id',     sqlType: 'VARCHAR(100) NULL' },
    { column: 'flutterwave_card_token',      sqlType: 'VARCHAR(255) NULL' },
    { column: 'flutterwave_subaccount_id',   sqlType: 'VARCHAR(100) NULL' },
    { column: 'payment_method_verified_at',  sqlType: 'TIMESTAMP NULL' },
    { column: 'payout_verified_at',          sqlType: 'TIMESTAMP NULL' },
    { column: 'payment_terms_accepted_at',   sqlType: 'TIMESTAMP NULL' },
    { column: 'notification_preferences',    sqlType: 'JSON NULL' },
    { column: 'identity_verified_at',        sqlType: 'TIMESTAMP NULL' },
    { column: 'stripe_identity_session_id',  sqlType: 'VARCHAR(255) NULL' },
    { column: 'bvn_verification_reference',  sqlType: 'VARCHAR(255) NULL' },
    { column: 'password_changed_at',         sqlType: 'TIMESTAMP NULL' },
    { column: 'last_login_at',               sqlType: 'TIMESTAMP NULL' },
    { column: 'onboarding_completed_email_sent_at', sqlType: 'TIMESTAMP NULL' },
    { column: 'subscription_tier',           sqlType: "ENUM('basic','premium') NULL" },
    { column: 'identity_verification_status', sqlType: "ENUM('not_started','pending','verified','failed') NOT NULL DEFAULT 'not_started'" },
    { column: 'identity_verification_fee_amount', sqlType: 'DECIMAL(12,2) NULL' },
  ],
  savings_groups: [
    { column: 'description',     sqlType: 'TEXT NULL' },
    { column: 'payout_day',      sqlType: 'INT NULL' },
    { column: 'min_trust_score', sqlType: 'INT NOT NULL DEFAULT 0' },
    { column: 'activated_at',    sqlType: 'TIMESTAMP NULL' },
    { column: 'suspended_at',    sqlType: 'TIMESTAMP NULL' },
    { column: 'claim_active_amount',       sqlType: 'DECIMAL(12,2) NULL' },
    { column: 'claim_reverts_after_cycle', sqlType: 'INT NULL' },
    { column: 'group_duration_type',      sqlType: "ENUM('fixed','indefinite') NOT NULL DEFAULT 'indefinite'" },
    { column: 'group_duration_rotations', sqlType: 'INT NULL' },
    { column: 'full_rotations_completed', sqlType: 'INT NOT NULL DEFAULT 0' },
    { column: 'closure_scheduled',        sqlType: 'BOOLEAN NOT NULL DEFAULT false' },
  ],
  contributions: [
    { column: 'amount_paid',        sqlType: 'DECIMAL(12,2) NULL' },
    { column: 'fee_amount',         sqlType: 'DECIMAL(12,2) NULL' },
    { column: 'card_fee_amount',              sqlType: 'DECIMAL(12,2) NULL' },
    { column: 'card_fee_vat_amount',          sqlType: 'DECIMAL(12,2) NULL' },
    { column: 'payout_fee_share_amount',      sqlType: 'DECIMAL(12,2) NULL' },
    { column: 'payout_fee_share_vat_amount',  sqlType: 'DECIMAL(12,2) NULL' },
    { column: 'paid_date',          sqlType: 'TIMESTAMP NULL' },
    { column: 'provider_reference', sqlType: 'VARCHAR(255) NULL' },
    { column: 'grace_period_ends_at', sqlType: 'TIMESTAMP NULL' },
    { column: 'retry_attempted',      sqlType: 'BOOLEAN NOT NULL DEFAULT false' },
  ],
  memberships: [
    { column: 'rotation_order', sqlType: 'INT NULL' },
    { column: 'default_count',  sqlType: 'INT NOT NULL DEFAULT 0' },
  ],
  rotations: [
    { column: 'provider_transfer_reference', sqlType: 'VARCHAR(255) NULL' },
    { column: 'completed_date',              sqlType: 'TIMESTAMP NULL' },
  ],
  subscriptions: [
    { column: 'provider_subscription_id', sqlType: 'VARCHAR(255) NULL' },
    { column: 'renewal_date',             sqlType: 'TIMESTAMP NULL' },
    { column: 'pending_tier',             sqlType: "ENUM('basic','premium') NULL" },
  ],
  votes: [
    { column: 'target_member_id',    sqlType: 'VARCHAR(36) NULL' },
    { column: 'metadata',            sqlType: 'JSON NULL' },
    { column: 'requires_unanimous',  sqlType: 'BOOLEAN NOT NULL DEFAULT false' },
  ],
};

/**
 * Enum columns that gained new allowed values after first being deployed.
 * `ADD COLUMN` above can't fix these (the column already exists) — MySQL
 * requires `MODIFY COLUMN` restating the full value list. Additive only:
 * every value ever shipped stays in the list forever, so this never changes
 * the meaning of existing rows, it only allows new values going forward.
 */
const REQUIRED_ENUM_VALUES: Record<string, Record<string, string[]>> = {
  savings_groups: {
    status: ['draft', 'active', 'suspended', 'closed', 'expired'],
  },
  contributions: {
    payment_status: ['scheduled', 'due', 'paid', 'failed', 'missed', 'pending_default', 'defaulted'],
  },
  votes: {
    proposal_type: ['payout_swap', 'exceptional_request', 'member_admission', 'contribution_claim', 'member_removal'],
  },
  subscriptions: {
    billing_status: ['active', 'past_due', 'cancelled', 'trialing', 'paused'],
  },
};

/**
 * Idempotent, non-destructive self-heal for the schema drift described
 * above. Runs once at boot: checks `information_schema` for each required
 * column (across all tables in REQUIRED_COLUMNS) and adds it if missing.
 * Never throws — a failure here is logged but must not prevent the server
 * from starting, since the app should still serve the routes that don't
 * touch the affected columns.
 */
export async function ensureSchemaSync(): Promise<void> {
  // Brand-new tables (not just new columns on an existing one) can't be
  // self-healed by the ALTER-TABLE-based loop below — create them directly
  // if a deploy skipped `npm run db:push`.
  const newTableDdls: Record<string, string> = {
    platform_counters: `CREATE TABLE IF NOT EXISTS \`platform_counters\` (
        \`name\` VARCHAR(100) NOT NULL PRIMARY KEY,
        \`value\` INT NOT NULL DEFAULT 0,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
    // Permanent hashed-email blocklist — see schema.ts emailBlocklist doc
    // comment for why this must never be relaxed.
    email_blocklist: `CREATE TABLE IF NOT EXISTS \`email_blocklist\` (
        \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
        \`email_hash\` VARCHAR(64) NOT NULL UNIQUE,
        \`reason\` VARCHAR(255) NOT NULL DEFAULT 'account_deleted',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    vote_email_tokens: `CREATE TABLE IF NOT EXISTS \`vote_email_tokens\` (
        \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
        \`vote_id\` VARCHAR(36) NOT NULL,
        \`member_id\` VARCHAR(36) NOT NULL,
        \`token\` VARCHAR(255) NOT NULL UNIQUE,
        \`responded_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
  };
  for (const [table, ddl] of Object.entries(newTableDdls)) {
    try {
      await poolConnection.query(ddl);
    } catch (err) {
      console.error(
        `[PadiHub] Schema sync check failed for table ${table} — run \`npm run db:push\`:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    try {
      const [rows] = await poolConnection.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [dbConfig.database, table],
      );
      const existingColumns = new Set(
        (rows as Array<{ COLUMN_NAME: string }>).map(row => row.COLUMN_NAME)
      );

      for (const { column, sqlType } of requiredColumns) {
        if (existingColumns.has(column)) continue;
        console.warn(`[PadiHub] Schema drift detected: ${table}.${column} is missing — adding it now.`);
        // column/sqlType come only from the hardcoded list above (never user input),
        // so building the DDL string here is safe and keeps the name in sync with
        // the `existingColumns.has(column)` check above (no separate literal to drift).
        await poolConnection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${sqlType}`);
        console.log(`[PadiHub] ✓ Added missing column ${table}.${column}.`);
      }
    } catch (err) {
      console.error(
        `[PadiHub] Schema sync check failed for table ${table} — some requests may still return "Unknown column" errors until \`npm run db:push\` is run:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  for (const [table, columns] of Object.entries(REQUIRED_ENUM_VALUES)) {
    for (const [column, values] of Object.entries(columns)) {
      try {
        const [rows] = await poolConnection.query(
          'SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
          [dbConfig.database, table, column],
        );
        const columnType = (rows as Array<{ COLUMN_TYPE: string }>)[0]?.COLUMN_TYPE;
        if (!columnType) continue; // column itself missing — handled above, or table not yet created

        const missing = values.filter(v => !columnType.includes(`'${v}'`));
        if (!missing.length) continue;

        console.warn(`[PadiHub] Schema drift detected: ${table}.${column} is missing enum value(s) ${missing.join(', ')} — widening it now.`);
        const enumList = values.map(v => `'${v}'`).join(',');
        await poolConnection.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${enumList}) NOT NULL`);
        console.log(`[PadiHub] ✓ Widened enum ${table}.${column} to include: ${values.join(', ')}.`);
      } catch (err) {
        console.error(
          `[PadiHub] Schema sync check failed for enum ${table}.${column} — some requests may fail until \`npm run db:push\` is run:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}

type TrustScoreAuditMetadata = { reason?: string; delta?: number; newScore?: number; legacyCorrectedFrom?: number };

/**
 * Idempotent, non-destructive self-heal for pre-existing users whose
 * trust_score was set by the old 0-100 formula (TRUST_SCORE_INITIAL=50,
 * IDENTITY_VERIFIED bonus=+50) before it was corrected to the current
 * formula (TRUST_SCORE_INITIAL=0, IDENTITY_VERIFIED bonus=+10, see
 * src/server/lib/constants.ts). Only new activity going forward used the
 * corrected formula — existing rows kept whatever value the old formula had
 * already written, so this backfills them once at boot. Never throws — a
 * failure here is logged but must not prevent the server from starting.
 */
export async function normalizeLegacyTrustScores(): Promise<void> {
  // Fingerprint 1: accounts still sitting at the old default of exactly 50
  // with zero TRUST_SCORE_UPDATED audit history. Current code only ever
  // creates users at trust_score=0 and always audit-logs every subsequent
  // change, so a user at 50 with no audit trail can only be a stale value
  // from before this fix — never a legitimately-earned score.
  try {
    const staleDefaults = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.trust_score, 50));

    for (const user of staleDefaults) {
      const auditRows = await db.select({ id: schema.auditLogs.id })
        .from(schema.auditLogs)
        .where(and(eq(schema.auditLogs.user_id, user.id), eq(schema.auditLogs.action, 'TRUST_SCORE_UPDATED')))
        .limit(1);
      if (auditRows.length) continue;

      await db.update(schema.users).set({ trust_score: TRUST_SCORE_INITIAL }).where(eq(schema.users.id, user.id));
      console.log(`[PadiHub] Trust score migration: reset legacy default trust_score=50 -> ${TRUST_SCORE_INITIAL} for user ${user.id} (no prior trust-score audit history).`);
    }
  } catch (err) {
    console.error('[PadiHub] Trust score legacy-default migration failed:', err instanceof Error ? err.message : err);
  }

  // Fingerprint 2: identity-verification bonuses granted under the old +50
  // formula. Correct the affected user's current running score and rewrite
  // the audit log's own metadata.delta to the corrected +10 so re-running
  // this migration on every boot is a no-op once applied.
  try {
    const trustScoreLogs = await db.select({
      id: schema.auditLogs.id,
      userId: schema.auditLogs.user_id,
      metadata: schema.auditLogs.metadata,
    })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'TRUST_SCORE_UPDATED'));

    for (const log of trustScoreLogs) {
      const metadata = log.metadata as TrustScoreAuditMetadata | null;
      if (!metadata || metadata.reason !== 'IDENTITY_VERIFIED' || metadata.delta !== 50 || !log.userId) continue;

      const rows = await db.select({ trust_score: schema.users.trust_score })
        .from(schema.users).where(eq(schema.users.id, log.userId)).limit(1);
      if (!rows.length) continue;

      const correctedScore = Math.max(rows[0].trust_score - 40, TRUST_SCORE_MIN);
      await db.update(schema.users).set({ trust_score: correctedScore }).where(eq(schema.users.id, log.userId));
      await db.update(schema.auditLogs)
        .set({ metadata: { ...metadata, delta: TRUST_SCORE_DELTA_IDENTITY_VERIFIED, legacyCorrectedFrom: 50 } })
        .where(eq(schema.auditLogs.id, log.id));
      console.log(`[PadiHub] Trust score migration: corrected legacy +50 identity-verification bonus to +${TRUST_SCORE_DELTA_IDENTITY_VERIFIED} for user ${log.userId} (trust_score now ${correctedScore}).`);
    }
  } catch (err) {
    console.error('[PadiHub] Trust score legacy-bonus migration failed:', err instanceof Error ? err.message : err);
  }
}
