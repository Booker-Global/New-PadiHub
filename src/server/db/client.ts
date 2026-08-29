/**
 * Database connection setup using Drizzle ORM with MySQL2
 *
 * Configured for cloud deployments (Render, etc.) with:
 * - Extended connect timeout for cold-starting databases
 * - TCP keepalive to prevent NAT/firewall idle drops
 * - Retry logic on startup health check
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { getDatabaseCredentials } from './config';
import * as schema from './schema';

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
  users: [
    { column: 'stripe_payment_method_id',   sqlType: 'VARCHAR(100) NULL' },
    { column: 'flutterwave_card_token',     sqlType: 'VARCHAR(255) NULL' },
    { column: 'payment_method_verified_at', sqlType: 'TIMESTAMP NULL' },
    { column: 'payout_verified_at',         sqlType: 'TIMESTAMP NULL' },
    { column: 'payment_terms_accepted_at',  sqlType: 'TIMESTAMP NULL' },
  ],
  savings_groups: [
    { column: 'payout_day', sqlType: 'INT NULL' },
  ],
  contributions: [
    { column: 'fee_amount', sqlType: 'DECIMAL(12,2) NULL' },
  ],
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
}
