/** TREAT AS IMMUTABLE - This file is protected by the file-edit tool
 *
 * Database configuration loader
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';

/**
 * Database credentials interface
 */
export interface DatabaseCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Parse a DATABASE_URL like: postgres://user:pass@host:5432/dbname
 */
function parseDatabaseUrl(urlString: string): DatabaseCredentials {
  try {
    const url = new URL(urlString);
    const protocol = url.protocol.replace(':', '');
    // Default ports for common DBs
    const defaultPort = protocol === 'mysql' || protocol === 'mariadb' ? 3306 : 5432;
    const host = url.hostname;
    const port = url.port ? parseInt(url.port, 10) : defaultPort;
    const user = decodeURIComponent(url.username || '');
    const password = decodeURIComponent(url.password || '');
    const database = url.pathname ? url.pathname.replace(/^\//, '') : '';

    if (!host || !port || !user || !password || !database) {
      throw new Error('DATABASE_URL is missing required parts (user, password, host, port, or database)');
    }

    return { host, port, user, password, database };
  } catch (err) {
    throw new Error(`Failed to parse DATABASE_URL: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Load database configuration. Prefer DATABASE_URL from environment (Render,
 * Heroku, etc.). If DATABASE_URL is not provided, fall back to the
 * task-local config.json (legacy). This keeps deployments that still use
 * NOMAD_TASK_DIR/config.json working while solving platforms that provide
 * a single DATABASE_URL environment variable.
 */
export function getDatabaseCredentials(): DatabaseCredentials {
  const dbUrl = env.DATABASE_URL;
  if (dbUrl) {
    return parseDatabaseUrl(dbUrl);
  }

  // Legacy: read the Nomad/task-local config.json (kept as a fallback)
  const configPath = join(env.NOMAD_TASK_DIR || '/local', 'config.json');

  if (!existsSync(configPath)) {
    throw new Error(
      `Database configuration not found: neither process.env.DATABASE_URL is set nor config file exists at ${configPath}`
    );
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    if (!config.DATABASE?.VALUE) {
      throw new Error('Invalid config.json structure: DATABASE.VALUE not found');
    }

    const db = config.DATABASE.VALUE;

    if (!db.HOST || !db.PORT || !db.USERNAME || !db.PASSWORD || !db.NAME) {
      throw new Error('Invalid config.json: Missing required database credentials');
    }

    return {
      host: db.HOST,
      port: parseInt(String(db.PORT), 10),
      user: db.USERNAME,
      password: db.PASSWORD,
      database: db.NAME,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse ${configPath}: Invalid JSON format`);
    }
    throw error;
  }
}
