import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import {
  JWT_SECRET, JWT_EXPIRES_IN,
  EMAIL_VERIFY_TTL, PASSWORD_RESET_TTL,
  BCRYPT_ROUNDS, TRUST_SCORE_INITIAL,
} from '../lib/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from './notificationService.js';
import { isEmailBlocked } from '../lib/emailBlocklist.js';
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from '../integrations/email/emailService.js';

function assignCurrency(country: string) {
  return country === 'NG' ? 'NGN' : 'GBP';
}

export const authService = {
  async register(data: {
    first_name: string; last_name: string; display_name?: string;
    email: string; password: string; phone_number?: string; country: string;
  }, ipAddress?: string) {
    
    // A previously deleted account's email is permanently blocked from
    // re-registering (Section 7) — checked before the normal duplicate-email
    // check so the error is specific and doesn't leak whether the email was
    // ever a live account.
    if (await isEmailBlocked(data.email)) {
      throw new AppError(
        'This email address cannot be used to create an account.',
        403,
        'EMAIL_BLOCKED',
      );
    }

    let existing: typeof schema.users.$inferSelect[];
    try {
      existing = await db.select().from(schema.users)
        .where(eq(schema.users.email, data.email.toLowerCase())).limit(1);
    } catch (dbErr) {
      console.error('[PadiHub] Database error checking existing user:', dbErr);
      throw new AppError(
        'Registration is temporarily unavailable. Please try again later.',
        503,
        'DB_UNAVAILABLE',
      );
    }
    if (existing.length) throw new AppError('Email already registered.', 409, 'EMAIL_EXISTS');

    const password_hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const userId = uuidv4();
    const currency = assignCurrency(data.country);

    try {
      await db.insert(schema.users).values({
        id: userId,
        first_name:          data.first_name,
        last_name:           data.last_name,
        display_name:        data.display_name || data.first_name,
        email:               data.email.toLowerCase(),
        password_hash,
        phone_number:        data.phone_number,
        country:             data.country,
        currency,
        trust_score:         TRUST_SCORE_INITIAL,
        account_status:      'pending_verification',
        subscription_status: 'free',
        email_verified:      false,
        active:              true,
        role:                'member',
      });
    } catch (dbErr) {
      console.error('[PadiHub] Database error inserting user:', dbErr);
      // Check for duplicate key (race condition where another request registered the same email)
      const msg = dbErr instanceof Error ? dbErr.message : '';
      if (msg.includes('Duplicate') || msg.includes('ER_DUP_ENTRY')) {
        throw new AppError('Email already registered.', 409, 'EMAIL_EXISTS');
      }
      throw new AppError(
        'Registration is temporarily unavailable. Please try again later.',
        503,
        'DB_UNAVAILABLE',
      );
    }

    // Create email verification token
    const token = uuidv4();
    try {
      await db.insert(schema.emailVerificationTokens).values({
        id:         uuidv4(),
        user_id:    userId,
        token,
        expires_at: new Date(Date.now() + EMAIL_VERIFY_TTL),
        used:       false,
      });
    } catch (dbErr) {
      console.error('[PadiHub] Database error inserting verification token:', dbErr);
      // User was created but token insert failed — still surface a helpful error
      // The user exists but can't verify; they can use "resend verification" later.
      throw new AppError(
        'Account created but verification email could not be sent. Please use "Resend verification" to get your link.',
        201,
        'TOKEN_INSERT_FAILED',
      );
    }

    await createAuditLog({ userId, action: 'USER_REGISTERED', entity: 'users', entityId: userId, ipAddress });
    // Send verification email (fire-and-forget — failure never blocks registration)
    await sendVerificationEmail(data.email.toLowerCase(), token);
    return { userId, verificationToken: token };
  },

  async verifyEmail(token: string, ipAddress?: string) {
    
    const rows = await db.select().from(schema.emailVerificationTokens)
      .where(eq(schema.emailVerificationTokens.token, token)).limit(1);
    if (!rows.length) throw new AppError('Invalid verification token.', 400, 'INVALID_TOKEN');
    const row = rows[0];
    if (row.used) throw new AppError('Token already used.', 400, 'TOKEN_USED');
    if (new Date() > row.expires_at) throw new AppError('Token expired.', 400, 'TOKEN_EXPIRED');

    await db.update(schema.emailVerificationTokens)
      .set({ used: true }).where(eq(schema.emailVerificationTokens.id, row.id));
    await db.update(schema.users)
      .set({ email_verified: true, account_status: 'active' })
      .where(eq(schema.users.id, row.user_id));

    await createAuditLog({ userId: row.user_id, action: 'EMAIL_VERIFIED', entity: 'users', entityId: row.user_id, ipAddress });
    await notificationService.create({
      userId: row.user_id, type: 'welcome',
      title: 'Welcome to PadiHub!',
      message: 'Your email has been verified. You can now join or create savings groups.',
    });

    // Fetch the full user record so we can issue a JWT and send the welcome email.
    // The update above already set email_verified=true and account_status='active',
    // so the row we read back here reflects the verified state.
    const userRows = await db.select().from(schema.users)
      .where(eq(schema.users.id, row.user_id)).limit(1);
    if (!userRows.length) throw new AppError('User not found after verification.', 500, 'USER_NOT_FOUND');
    const { password_hash: _, ...safeUser } = userRows[0];

    await sendWelcomeEmail(safeUser.email, safeUser.first_name);

    // Issue a JWT so the frontend can establish a session immediately after
    // verification — no separate login step required before onboarding.
    const jwtToken = jwt.sign(
      { userId: safeUser.id, email: safeUser.email, role: safeUser.role },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
    );

    return { token: jwtToken, user: safeUser };
  },

  async resendVerificationEmail(email: string, ipAddress?: string) {
    const rows = await db.select().from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase())).limit(1);
    // Silently succeed if user not found — prevents email enumeration
    if (!rows.length || rows[0].email_verified) return;
    const user = rows[0];

    // Invalidate any existing unused tokens for this user
    await db.update(schema.emailVerificationTokens)
      .set({ used: true })
      .where(eq(schema.emailVerificationTokens.user_id, user.id));

    // Issue a fresh token
    const token = uuidv4();
    await db.insert(schema.emailVerificationTokens).values({
      id:         uuidv4(),
      user_id:    user.id,
      token,
      expires_at: new Date(Date.now() + EMAIL_VERIFY_TTL),
      used:       false,
    });
    await sendVerificationEmail(user.email, token);
    await createAuditLog({ userId: user.id, action: 'VERIFICATION_EMAIL_RESENT', entity: 'users', entityId: user.id, ipAddress });
  },

  async login(email: string, password: string, ipAddress?: string) {
    
    let rows: typeof schema.users.$inferSelect[];
    try {
      rows = await db.select().from(schema.users)
        .where(eq(schema.users.email, email.toLowerCase())).limit(1);
    } catch (dbErr) {
      console.error('[PadiHub] Database error during login lookup:', dbErr);
      throw new AppError(
        'Login is temporarily unavailable. Please try again later.',
        503,
        'DB_UNAVAILABLE',
      );
    }
    if (!rows.length) {
      // A previously deleted account's email is blocked from ever
      // signing in again (Section 7) — give a specific, clear message
      // rather than the generic "invalid credentials".
      if (await isEmailBlocked(email)) {
        throw new AppError(
          'This email address cannot be used to log in.',
          403,
          'EMAIL_BLOCKED',
        );
      }
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }
    const user = rows[0];

    if (!user.email_verified) throw new AppError('Please verify your email before logging in.', 403, 'EMAIL_NOT_VERIFIED');
    if (user.account_status === 'suspended') throw new AppError('Your account has been suspended.', 403, 'ACCOUNT_SUSPENDED');
    if (user.account_status === 'deactivated') throw new AppError('Your account has been deactivated.', 403, 'ACCOUNT_DEACTIVATED');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
    );

    await createAuditLog({ userId: user.id, action: 'LOGIN', entity: 'users', entityId: user.id, ipAddress });

    const { password_hash: _, ...safeUser } = user;
    return { token, user: safeUser };
  },

  async forgotPassword(email: string, ipAddress?: string) {
    
    const rows = await db.select().from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase())).limit(1);
    // Always return success to prevent email enumeration
    if (!rows.length) return { sent: true };
    const user = rows[0];

    const token = uuidv4();
    await db.insert(schema.passwordResetTokens).values({
      id:         uuidv4(),
      user_id:    user.id,
      token,
      expires_at: new Date(Date.now() + PASSWORD_RESET_TTL),
      used:       false,
    });

    await createAuditLog({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entity: 'users', entityId: user.id, ipAddress });
    await sendPasswordResetEmail(user.email, token);
    return { sent: true, resetToken: token };
  },

  async resetPassword(token: string, newPassword: string, ipAddress?: string) {
    
    const rows = await db.select().from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.token, token)).limit(1);
    if (!rows.length) throw new AppError('Invalid reset token.', 400, 'INVALID_TOKEN');
    const row = rows[0];
    if (row.used) throw new AppError('Token already used.', 400, 'TOKEN_USED');
    if (new Date() > row.expires_at) throw new AppError('Token expired.', 400, 'TOKEN_EXPIRED');

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.update(schema.users).set({ password_hash }).where(eq(schema.users.id, row.user_id));
    await db.update(schema.passwordResetTokens).set({ used: true }).where(eq(schema.passwordResetTokens.id, row.id));

    await createAuditLog({ userId: row.user_id, action: 'PASSWORD_RESET_COMPLETED', entity: 'users', entityId: row.user_id, ipAddress });
    return true;
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string, ipAddress?: string) {
    
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length) throw new AppError('User not found.', 404);
    const user = rows[0];

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new AppError('Current password is incorrect.', 400, 'WRONG_PASSWORD');

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.update(schema.users).set({ password_hash }).where(eq(schema.users.id, userId));
    await createAuditLog({ userId, action: 'PASSWORD_CHANGED', entity: 'users', entityId: userId, ipAddress });
    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC';
    await sendPasswordChangedEmail(user.email, timestamp);
    return true;
  },

  async getMe(userId: string) {
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length) throw new AppError('User not found.', 404);
    const { password_hash: _, ...safeUser } = rows[0];
    return safeUser;
  },

  /**
   * Issue a fresh JWT for an already-authenticated user.
   * The authenticate middleware has already verified the current token before
   * this is called, so we simply re-sign with a new expiry.
   */
  async refresh(userId: string) {
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length) throw new AppError('User not found.', 404);
    const user = rows[0];
    if (user.account_status === 'suspended') throw new AppError('Account suspended.', 403, 'ACCOUNT_SUSPENDED');
    if (user.account_status === 'deactivated') throw new AppError('Account deactivated.', 403, 'ACCOUNT_DEACTIVATED');

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
    );
    return { token };
  },
};
