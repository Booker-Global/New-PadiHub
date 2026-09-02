/**
 * Permanent hashed-email blocklist (Section 7).
 *
 * When an account is deleted we retain a SHA-256 hash of the ORIGINAL email
 * (never the plaintext, and never any other retained PII) so that email can
 * never be used to sign up or log in again — see userService.deleteAccount
 * (insert) and authService.register (check).
 *
 * This exists specifically to prevent someone evading their default/
 * suspension history by deleting their account and re-registering with the
 * same email. Do NOT loosen this later with "smart" email-variation
 * matching (e.g. treating `name+tag@gmail.com` / dots-insensitive Gmail
 * addresses / alternate casing as equivalent) without carefully considering
 * that doing so defeats the entire purpose of this blocklist — any such
 * change should be a deliberate, reviewed decision, not a quiet tweak.
 */
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';

/** Normalize an email the same way everywhere (lowercase + trim) before hashing or storing. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

/** True if this email has been permanently blocked (e.g. a prior account using it was deleted). */
export async function isEmailBlocked(email: string): Promise<boolean> {
  const rows = await db.select({ id: schema.emailBlocklist.id }).from(schema.emailBlocklist)
    .where(eq(schema.emailBlocklist.email_hash, hashEmail(email))).limit(1);
  return rows.length > 0;
}

/** Permanently block an email (called once, right before anonymizing a deleted account's email). */
export async function blockEmail(email: string, reason = 'account_deleted'): Promise<void> {
  const emailHash = hashEmail(email);
  const existing = await db.select({ id: schema.emailBlocklist.id }).from(schema.emailBlocklist)
    .where(eq(schema.emailBlocklist.email_hash, emailHash)).limit(1);
  if (existing.length) return; // already blocked — idempotent

  const { v4: uuidv4 } = await import('uuid');
  await db.insert(schema.emailBlocklist).values({ id: uuidv4(), email_hash: emailHash, reason });
}
