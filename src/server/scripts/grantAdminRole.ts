/**
 * Grants (or revokes) the 'admin' role for one explicitly-named account, so
 * its owner can sign in and access the hidden /admin dashboard.
 *
 * There is no in-app "become admin" flow — this is the only way to promote
 * an account, matching the security design of the /admin portal (server-side
 * requireRole('admin') on every /api/admin/* and /api/system/{jobs,errors}
 * route, plus a client-side role gate on the /admin page itself).
 *
 * Idempotent — re-running with the same email is a no-op if the role is
 * already correct. Scoped to exactly one account per run (no bulk grants).
 *
 * IMPORTANT: users.role is embedded in the JWT at login time, so an account
 * promoted while already signed in will only see admin access after signing
 * out and back in (to mint a fresh token carrying the updated role claim).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx src/server/scripts/grantAdminRole.ts you@example.com
 *   DATABASE_URL=... npx tsx src/server/scripts/grantAdminRole.ts you@example.com --revoke
 */
import { eq } from 'drizzle-orm';
import { db, closeConnection } from '../db/client.js';
import * as schema from '../db/schema.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();

  if (!email) {
    console.error('[grantAdminRole] Usage: npx tsx src/server/scripts/grantAdminRole.ts <email> [--revoke]');
    process.exitCode = 1;
    await closeConnection();
    return;
  }

  const userRows = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!userRows.length) {
    console.log(`[grantAdminRole] No user found for ${email}. Nothing to do.`);
    await closeConnection();
    return;
  }

  const user = userRows[0];
  const targetRole = revoke ? 'member' : 'admin';

  if (user.role === targetRole) {
    console.log(`[grantAdminRole] ${email} (user ${user.id}) already has role='${targetRole}'. No change needed.`);
    await closeConnection();
    return;
  }

  await db.update(schema.users).set({ role: targetRole }).where(eq(schema.users.id, user.id));
  console.log(`[grantAdminRole] ${email} (user ${user.id}) role changed: '${user.role}' -> '${targetRole}'.`);
  console.log('[grantAdminRole] If this account is already signed in, it must sign out and back in for the new role to take effect (role is embedded in the JWT at login).');

  await closeConnection();
}

main().catch((err) => {
  console.error('[grantAdminRole] Unhandled error:', err);
  process.exitCode = 1;
});
