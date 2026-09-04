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
export const GROUP_DEFAULT_SUSPENSION_THRESHOLD = 3; // max permitted contribution defaults before Compensated Compression removes the member
export const GROUP_DEFAULT_VOTING_THRESHOLD     = 51; // % of votes required to pass a group decision
export const GROUP_DEFAULT_MIN_TRUST_SCORE      = 0; // no minimum Trust Score required to join, unless the creator sets one
export const GROUP_MAX_MEMBERS                  = 20; // platform-wide hard cap for any savings group

/**
 * Group launch/lifecycle rules (Draft → Active → Suspended → Expired) — see
 * groupService.activateGroup / reevaluateAfterMembershipChange /
 * scheduledJobs.dailyGroupLifecycleExpiry.
 */
export const GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH = 3; // "Start Group" stays disabled below this
export const GROUP_STUCK_BELOW_MIN_EXPIRY_DAYS  = 30; // draft/suspended groups auto-expire after this many days stuck below the minimum
export const GROUP_STUCK_EXPIRY_REMINDER_DAYS_BEFORE = [7, 3, 1]; // reminder nudges before auto-expiry

/**
 * Account lifecycle timers — see scheduledJobs.ts for the 3 daily jobs that
 * apply these:
 *  - Section 1: profile complete (steps a-e) but no active group joined yet
 *    ("Pending Charge") — 7-day reminder nudges, reverts to an incomplete
 *    profile (re-select plan) after PENDING_CHARGE_GROUP_JOIN_EXPIRY_DAYS.
 *  - Section 2: profile never finished steps a-e — 7-day reminders detailing
 *    what's missing, account deleted after INCOMPLETE_PROFILE_EXPIRY_DAYS.
 *  - Section 3: subscription cancelled (and, per Section 15.B, every active
 *    group departed) — 7-day re-subscribe reminders, account deleted after
 *    CANCELLED_SUBSCRIPTION_EXPIRY_DAYS.
 */
export const ACCOUNT_LIFECYCLE_REMINDER_INTERVAL_DAYS = 7;
export const PENDING_CHARGE_GROUP_JOIN_EXPIRY_DAYS    = 30;
export const INCOMPLETE_PROFILE_EXPIRY_DAYS           = 60;
export const CANCELLED_SUBSCRIPTION_EXPIRY_DAYS       = 60;

/** Section 4 — a member voted out of groups this many times has their account deleted outright. */
export const VOTE_REMOVED_ACCOUNT_DELETION_THRESHOLD = 3;

export function clampGroupMaximumMembers(maximumMembers: number): number {
  return Math.min(maximumMembers, GROUP_MAX_MEMBERS);
}

/**
 * A missed/failed contribution charge gets exactly one automatic retry, at
 * the end of a 72-hour grace period, before the member is flagged in
 * default — see contributionService.markFailed and
 * scheduledJobs.dailyContributionDefaultRetry. No further retries, no
 * continuous payment authority, no substitute-member matching.
 */
export const CONTRIBUTION_DEFAULT_GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;

/** Governance votes (new-member admission, contribution claims) must be decided within this window — see voteService.ts. */
export const GOVERNANCE_VOTE_DEADLINE_MS = 48 * 60 * 60 * 1000;

/**
 * Daily contribution frequency is disabled in production — it exists only
 * to speed up manual/QA testing of rotation logic. Production groups may
 * only choose Weekly or Monthly. See groupService.create/update.
 */
export function isDailyFrequencyAllowed(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

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

/**
 * Human-readable country name for a 2-letter code, used in user-facing error
 * messages (e.g. the cross-border group membership guard) — never expose the
 * raw 'GB'/'NG' code to a member.
 */
export function countryDisplayName(country: string): string {
  return country === 'NG' ? 'Nigeria' : 'the United Kingdom';
}

/**
 * Human-readable name for a user, preferring their chosen display name, then
 * falling back to "first last", then the local part of their email. Every
 * screen that shows another member (group leader, rotation recipient, vote
 * proposer/target, member list, etc.) must use this instead of exposing a
 * raw user ID — see the group dashboard "Group Details" / "Rotation" /
 * "Members" panels.
 */
export function resolveUserDisplayName(user: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
} | undefined | null): string {
  if (!user) return 'A PadiHub member';
  return user.display_name?.trim()
    || `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
    || user.email?.split('@')[0]
    || 'A PadiHub member';
}

/**
 * Single source of truth for the non-technical subscription status label
 * shown anywhere in the UI. The DB stores `users.subscription_status`
 * ('free' | 'trial' | 'active' | 'expired' | 'cancelled') and
 * `subscriptions.billing_status` ('active' | 'past_due' | 'cancelled' |
 * 'trialing' | 'paused') separately — a deferred-billing member (profile
 * steps a-e complete, step f/group-join still outstanding) has
 * subscription_status='active' AND billing_status='paused', which must
 * never be surfaced to the user as plain "Active" (they have not been
 * charged yet). Never show raw enum/snake_case values in the UI — always
 * resolve through this helper instead.
 */
export function resolveSubscriptionStatusDisplay(input: {
  subscription_status?: string | null;
  billing_status?: string | null;
} | undefined | null): 'Pending Charge' | 'Active' | 'Inactive' | 'Not Set' {
  if (!input || !input.subscription_status) return 'Not Set';
  if (input.billing_status === 'paused') return 'Pending Charge';
  if (input.subscription_status === 'active' || input.subscription_status === 'trial') return 'Active';
  return 'Inactive';
}
