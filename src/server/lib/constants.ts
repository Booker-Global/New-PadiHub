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

/**
 * Trust Score deltas — the full "calculation algorithm" for how a user's
 * Trust Score (0-100) responds to payout/contribution success and defaults.
 * Centralized here (instead of magic numbers at each call site) so the
 * scoring rules are auditable in one place. See trustScoreService.ts for the
 * increase/decrease mechanics and clamping to TRUST_SCORE_MIN/MAX.
 */
export const TRUST_SCORE_DELTA_CONTRIBUTION_PAID    = 2;  // a contribution was paid on time
export const TRUST_SCORE_DELTA_CONTRIBUTION_MISSED  = -5; // a contribution default (missed payment)
export const TRUST_SCORE_DELTA_CYCLE_COMPLETED      = 3;  // successfully received a rotation payout
export const TRUST_SCORE_DELTA_MEMBER_SUSPENDED     = -10; // kicked out of a group after repeated defaults
export const TRUST_SCORE_DELTA_IDENTITY_VERIFIED    = 50; // completed KYC/identity verification

/**
 * Group "initial conditions" defaults applied at group creation when the
 * creator doesn't explicitly choose a value — see groupService.create().
 */
export const GROUP_DEFAULT_STRIKE_THRESHOLD     = 2; // missed contributions before a warning
export const GROUP_DEFAULT_SUSPENSION_THRESHOLD = 3; // missed contributions before the member is kicked out
export const GROUP_DEFAULT_VOTING_THRESHOLD     = 51; // % of votes required to pass a group decision

