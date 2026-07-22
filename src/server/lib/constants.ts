/**
 * Application-level constants and JWT configuration.
 * JWT_SECRET is read from the JWT_SECRET environment variable.
 * In production this MUST be set — the server will refuse to start without it.
 */
import { getSecret } from '#airo/secrets';

export function JWT_SECRET(): string {
  const secret = (getSecret('JWT_SECRET') as string | undefined) || process.env.JWT_SECRET;
  if (!secret || secret === 'padihub-dev-secret-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[PadiHub] JWT_SECRET is not set. Add it in Settings → Secrets before publishing.'
      );
    }
    // Dev-only fallback — never reaches production
    return 'padihub-dev-secret-change-in-production';
  }
  return secret;
}

export const JWT_EXPIRES_IN     = '7d';
export const EMAIL_VERIFY_TTL   = 24 * 60 * 60 * 1000; // 24 hours ms
export const PASSWORD_RESET_TTL = 2  * 60 * 60 * 1000; // 2 hours ms
export const INVITE_TTL         = 7  * 24 * 60 * 60 * 1000; // 7 days ms
export const BCRYPT_ROUNDS      = 12;
export const TRUST_SCORE_INITIAL = 50;
export const TRUST_SCORE_MAX     = 100;
export const TRUST_SCORE_MIN     = 0;
