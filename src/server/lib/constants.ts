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
// New accounts start at the very bottom of the scale (Explorer tier) and must
// earn their way up through real group activity — see TIER_BANDS in
// src/lib/trust-tiers.ts. Identity verification is a prerequisite to
// participate, not a shortcut to a higher tier, so its delta below is kept
// small enough that a freshly verified user with zero contributions still
// lands in the Explorer band (0-29).
export const TRUST_SCORE_INITIAL = 0;
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
export const TRUST_SCORE_DELTA_IDENTITY_VERIFIED    = 10; // completed KYC/identity verification — keeps a brand-new, contribution-free user within the Explorer tier (0-29)

/**
 * Group "initial conditions" defaults applied at group creation when the
 * creator doesn't explicitly choose a value — see groupService.create().
 */
export const GROUP_DEFAULT_STRIKE_THRESHOLD     = 2; // missed contributions before a warning
export const GROUP_DEFAULT_SUSPENSION_THRESHOLD = 3; // missed contributions before the member is kicked out
export const GROUP_DEFAULT_VOTING_THRESHOLD     = 51; // % of votes required to pass a group decision
export const GROUP_DEFAULT_MIN_TRUST_SCORE      = 0; // no minimum Trust Score required to join, unless the creator sets one

/**
 * Subscription tiers — PadiHub has exactly two monthly-only membership
 * tiers (no annual billing, no free trial). Each tier caps how many groups
 * a member may CREATE (as leader) versus the TOTAL number of groups they may
 * be an active MEMBER of (creating a group also counts toward this total —
 * see groupService.countGroupsJoined(), which counts every membership
 * regardless of role or status). A user must select one of these during
 * onboarding, before their account is treated as fully verified — see
 * paymentEligibilityService.ts for the enforcement gate.
 *
 * Basic: join up to 3 groups total, cannot create any group.
 * Premium: create up to 3 groups and join up to 5 more (8 group
 * memberships total, including any groups the user created).
 */
export const SUBSCRIPTION_TIERS = {
  basic: {
    key:             'basic' as const,
    name:            'Basic',
    priceGBP:        4.99,
    priceNGN:        5000,
    maxGroupsCreate: 0,
    maxGroupsJoin:   3,
  },
  premium: {
    key:             'premium' as const,
    name:            'Premium',
    priceGBP:        14.99,
    priceNGN:        10000,
    maxGroupsCreate: 3,
    maxGroupsJoin:   8,
  },
} as const;

export type SubscriptionTierKey = keyof typeof SUBSCRIPTION_TIERS;

export function isSubscriptionTierKey(value: unknown): value is SubscriptionTierKey {
  return value === 'basic' || value === 'premium';
}

/** Monthly price (as a number, in the country's own currency) for a tier. */
export function getTierMonthlyPrice(tier: SubscriptionTierKey, country: string): number {
  return country === 'NG' ? SUBSCRIPTION_TIERS[tier].priceNGN : SUBSCRIPTION_TIERS[tier].priceGBP;
}

/** Monthly price formatted with the country's currency symbol, e.g. "£4.99" or "₦5,000". */
export function formatTierPrice(tier: SubscriptionTierKey, country: string): string {
  return country === 'NG'
    ? `₦${SUBSCRIPTION_TIERS[tier].priceNGN.toLocaleString('en-NG')}`
    : `£${SUBSCRIPTION_TIERS[tier].priceGBP.toFixed(2)}`;
}

