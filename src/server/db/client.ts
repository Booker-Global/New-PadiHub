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
