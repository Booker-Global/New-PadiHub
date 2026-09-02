import {
  mysqlTable, varchar, int, text, boolean, timestamp,
  decimal, json, mysqlEnum, index,
} from 'drizzle-orm/mysql-core';

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable('users', {
  id:                          varchar('id', { length: 36 }).primaryKey(),
  first_name:                  varchar('first_name', { length: 100 }).notNull(),
  last_name:                   varchar('last_name', { length: 100 }).notNull(),
  display_name:                varchar('display_name', { length: 100 }),
  email:                       varchar('email', { length: 255 }).notNull().unique(),
  password_hash:               varchar('password_hash', { length: 255 }).notNull(),
  phone_number:                varchar('phone_number', { length: 30 }),
  country:                     varchar('country', { length: 2 }).notNull().default('GB'),
  currency:                    varchar('currency', { length: 3 }).notNull().default('GBP'),
  trust_score:                 int('trust_score').notNull().default(0),
  subscription_status:         mysqlEnum('subscription_status', ['free', 'trial', 'active', 'expired', 'cancelled']).notNull().default('free'),
  // The subscription tier the user chose during onboarding — 'basic' or 'premium'
  // (see SUBSCRIPTION_TIERS in src/server/lib/constants.ts). Null until the
  // user picks a plan; group creation/joining requires this to be set — see
  // paymentEligibilityService.ts.
  subscription_tier:           mysqlEnum('subscription_tier', ['basic', 'premium']),
  stripe_customer_id:          varchar('stripe_customer_id', { length: 100 }),
  stripe_payment_method_id:    varchar('stripe_payment_method_id', { length: 100 }),
  stripe_connected_account_id: varchar('stripe_connected_account_id', { length: 100 }),
  flutterwave_customer_id:     varchar('flutterwave_customer_id', { length: 100 }),
  flutterwave_card_token:      varchar('flutterwave_card_token', { length: 255 }),
  flutterwave_subaccount_id:   varchar('flutterwave_subaccount_id', { length: 100 }),
  // Set only after server-side verification with the provider (Stripe PaymentMethod
  // retrieval + customer match, or Flutterwave transaction verification), and after
  // the payout destination has been confirmed usable (Stripe charges_enabled &&
  // payouts_enabled, or Flutterwave subaccount creation). Joining/creating a group
  // requires both to be non-null — see paymentEligibilityService.ts.
  payment_method_verified_at:  timestamp('payment_method_verified_at'),
  payout_verified_at:          timestamp('payout_verified_at'),
  // Server-recorded timestamp of when the user ticked the payment
  // terms & conditions checkbox (which discloses that Stripe/Flutterwave
  // processing fees are added to contribution charges) while setting up a
  // payment method — see paymentController.ts savePaymentMethod handlers.
  payment_terms_accepted_at:   timestamp('payment_terms_accepted_at'),
  notification_preferences:    json('notification_preferences'),
  account_status:              mysqlEnum('account_status', ['pending_verification', 'active', 'suspended', 'deactivated']).notNull().default('pending_verification'),
  email_verified:              boolean('email_verified').notNull().default(false),
  identity_verified:           boolean('identity_verified').notNull().default(false),
  identity_verified_at:        timestamp('identity_verified_at'),
  // Granular status shown on the member's profile while identity/bank-account
  // verification is in progress — 'pending' covers the window between
  // triggering Stripe Identity's embedded modal (UK) or Flutterwave Account
  // Resolve (NG, an interim bank-account-validation check, not full KYC) and
  // the provider's success/failure result. No subscription/verification
  // charge occurs until this reaches 'verified' — see identityVerificationService.ts.
  identity_verification_status: mysqlEnum('identity_verification_status', ['not_started', 'pending', 'verified', 'failed']).notNull().default('not_started'),
  // UK only — the actual identity-verification fee charged to this member's
  // first invoice: '0.00' if they were among the first 50 successfully-verified
  // users platform-wide (see platform_counters), '1.00' otherwise. Null until
  // verification succeeds. Always null for NG users (Flutterwave Account
  // Resolve carries no member-facing fee).
  identity_verification_fee_amount: decimal('identity_verification_fee_amount', { precision: 12, scale: 2 }),
  stripe_identity_session_id:  varchar('stripe_identity_session_id', { length: 255 }),
  // Deprecated — was used by the retired BVN/OTP verification flow, replaced
  // by Flutterwave Account Resolve (synchronous, no stored reference needed).
  // Left in place only to avoid a destructive column drop; always null now.
  bvn_verification_reference:  varchar('bvn_verification_reference', { length: 255 }),
  last_login_at:               timestamp('last_login_at'),
  active:                      boolean('active').notNull().default(true),
  role:                        mysqlEnum('role', ['member', 'group_leader', 'admin']).notNull().default('member'),
  created_at:                  timestamp('created_at').notNull().defaultNow(),
  updated_at:                  timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  emailIdx: index('users_email_idx').on(t.email),
}));

// ─── Email Verification Tokens ────────────────────────────────────────────────
export const emailVerificationTokens = mysqlTable('email_verification_tokens', {
  id:         varchar('id', { length: 36 }).primaryKey(),
  user_id:    varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  token:      varchar('token', { length: 255 }).notNull().unique(),
  expires_at: timestamp('expires_at').notNull(),
  used:       boolean('used').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Password Reset Tokens ────────────────────────────────────────────────────
export const passwordResetTokens = mysqlTable('password_reset_tokens', {
  id:         varchar('id', { length: 36 }).primaryKey(),
  user_id:    varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  token:      varchar('token', { length: 255 }).notNull().unique(),
  expires_at: timestamp('expires_at').notNull(),
  used:       boolean('used').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Savings Groups ───────────────────────────────────────────────────────────
export const savingsGroups = mysqlTable('savings_groups', {
  id:                       varchar('id', { length: 36 }).primaryKey(),
  name:                     varchar('name', { length: 200 }).notNull(),
  description:              text('description'),
  leader_id:                varchar('leader_id', { length: 36 }).notNull().references(() => users.id),
  country:                  varchar('country', { length: 2 }).notNull(),
  currency:                 varchar('currency', { length: 3 }).notNull(),
  contribution_amount:      decimal('contribution_amount', { precision: 12, scale: 2 }).notNull(),
  contribution_frequency:   mysqlEnum('contribution_frequency', ['daily', 'weekly', 'monthly']).notNull(),
  // Day the payout is collected/processed on. For 'weekly' this is a day of
  // week (0=Sunday..6=Saturday); for 'monthly' a day of month (1-31, clamped
  // to the last day of shorter months); ignored for 'daily'. Required at
  // group-creation time for weekly/monthly groups — see groupController.ts.
  payout_day:               int('payout_day'),
  maximum_members:          int('maximum_members').notNull().default(10),
  // Minimum Trust Score a prospective member must have to request to join
  // this group — set by the creator at group-creation time (0 = no minimum).
  // Enforced in membershipService.requestToJoin().
  min_trust_score:          int('min_trust_score').notNull().default(0),
  rotation_method:          mysqlEnum('rotation_method', ['manual', 'random']).notNull().default('manual'),
  current_rotation_position: int('current_rotation_position').notNull().default(1),
  current_cycle:            int('current_cycle').notNull().default(1),
  strike_threshold:         int('strike_threshold').notNull().default(2),
  // Reused as the "max permitted defaults" setting from group creation
  // (chosen by the Group Creator): once a member's contribution default
  // count (see memberships.default_count) reaches this value, they are
  // removed via Compensated Compression (membershipService.departMember) —
  // see contributionService's 72h-grace + single-retry default flow.
  suspension_threshold:     int('suspension_threshold').notNull().default(3),
  voting_threshold:         int('voting_threshold').notNull().default(51),
  allow_payout_swaps:       boolean('allow_payout_swaps').notNull().default(true),
  payment_provider:         mysqlEnum('payment_provider', ['stripe', 'flutterwave']).notNull(),
  // 'draft': newly created, needs 3 verified active members before the
  // Creator can "Start Group" (see groupService.activateGroup). 'active':
  // running normally. 'suspended': dropped below 3 active members — payout
  // collection is paused (contribution/rotation jobs only touch 'active'
  // groups) until the Creator refills it via the normal invite/join flow.
  // 'expired': stuck in 'draft'/'suspended' for 30+ days with no refill.
  // 'closed': voluntarily closed by the Creator.
  status:                   mysqlEnum('status', ['draft', 'active', 'suspended', 'closed', 'expired']).notNull().default('draft'),
  // Set once, the moment the group transitions draft → active (see
  // activateGroup). Used for payout-slot-assignment "at the time the group
  // activates" (Section 4) and has no bearing on subsequent suspensions.
  activated_at:             timestamp('activated_at'),
  // Set whenever the group transitions active → suspended (member count
  // dropped below 3). Cleared (set back to null) on refill/reactivation.
  // Drives the 30-day stuck-below-3 auto-expiry window.
  suspended_at:             timestamp('suspended_at'),
  // Temporary contribution-amount override approved by a unanimous
  // "contribution claim" governance vote (see votes.proposal_type
  // 'contribution_claim'). Non-null only while a claim is in effect; the
  // schedule generator prefers this over contribution_amount when set, and
  // it auto-reverts to null once current_cycle passes claim_reverts_after_cycle.
  claim_active_amount:      decimal('claim_active_amount', { precision: 12, scale: 2 }),
  // The last cycle number the raised claim amount still applies to — the
  // cycle in which the last member of the current rotation receives their
  // payout at the claimed level. Null unless a claim is active.
  claim_reverts_after_cycle: int('claim_reverts_after_cycle'),
  created_at:               timestamp('created_at').notNull().defaultNow(),
  updated_at:               timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  leaderIdx: index('groups_leader_idx').on(t.leader_id),
  statusIdx: index('groups_status_idx').on(t.status),
}));

// ─── Group Invitations ────────────────────────────────────────────────────────
export const groupInvitations = mysqlTable('group_invitations', {
  id:         varchar('id', { length: 36 }).primaryKey(),
  group_id:   varchar('group_id', { length: 36 }).notNull().references(() => savingsGroups.id, { onDelete: 'cascade' }),
  invited_by: varchar('invited_by', { length: 36 }).notNull().references(() => users.id),
  email:      varchar('email', { length: 255 }),
  token:      varchar('token', { length: 255 }).notNull().unique(),
  expires_at: timestamp('expires_at').notNull(),
  accepted:   boolean('accepted').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Memberships ──────────────────────────────────────────────────────────────
export const memberships = mysqlTable('memberships', {
  id:           varchar('id', { length: 36 }).primaryKey(),
  user_id:      varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  group_id:     varchar('group_id', { length: 36 }).notNull().references(() => savingsGroups.id, { onDelete: 'cascade' }),
  role:         mysqlEnum('role', ['member', 'leader']).notNull().default('member'),
  rotation_order: int('rotation_order'),
  join_date:    timestamp('join_date').notNull().defaultNow(),
  status:       mysqlEnum('status', ['pending', 'active', 'suspended', 'removed']).notNull().default('active'),
  strike_count: int('strike_count').notNull().default(0),
  // Number of contribution defaults (72h grace period + single retry, both
  // failed) this member has accrued in this group — see
  // contributionService's grace/retry flow and membershipService.flagDefault.
  // Compared against the group's suspension_threshold (reused as "max
  // permitted defaults"); reaching it removes the member via Compensated
  // Compression (membershipService.departMember).
  default_count: int('default_count').notNull().default(0),
  created_at:   timestamp('created_at').notNull().defaultNow(),
  updated_at:   timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  userGroupIdx: index('memberships_user_group_idx').on(t.user_id, t.group_id),
}));

// ─── Contributions ────────────────────────────────────────────────────────────
export const contributions = mysqlTable('contributions', {
  id:                 varchar('id', { length: 36 }).primaryKey(),
  group_id:           varchar('group_id', { length: 36 }).notNull().references(() => savingsGroups.id),
  member_id:          varchar('member_id', { length: 36 }).notNull().references(() => users.id),
  cycle_number:       int('cycle_number').notNull(),
  amount_due:         decimal('amount_due', { precision: 12, scale: 2 }).notNull(),
  amount_paid:        decimal('amount_paid', { precision: 12, scale: 2 }),
  // Provider processing + payout-fee surcharge charged on top of amount_due
  // (not deducted from the group pot) — see src/server/lib/paymentFees.ts.
  // fee_amount is the TOTAL surcharge (all four components below, summed);
  // the itemised components are stored separately for frontend display and
  // disclosure purposes. All null until charged.
  fee_amount:         decimal('fee_amount', { precision: 12, scale: 2 }),
  card_fee_amount:         decimal('card_fee_amount', { precision: 12, scale: 2 }),
  card_fee_vat_amount:     decimal('card_fee_vat_amount', { precision: 12, scale: 2 }),
  payout_fee_share_amount:     decimal('payout_fee_share_amount', { precision: 12, scale: 2 }),
  payout_fee_share_vat_amount: decimal('payout_fee_share_vat_amount', { precision: 12, scale: 2 }),
  due_date:           timestamp('due_date').notNull(),
  paid_date:          timestamp('paid_date'),
  // 'pending_default': a charge attempt failed and the 72h grace period is
  // running (member + group already notified). 'defaulted': the single
  // scheduled retry (at grace_period_ends_at) also failed — terminal, feeds
  // membershipService.flagDefault. See contributionService.markFailed and
  // scheduledJobs.dailyContributionDefaultRetry.
  payment_status:     mysqlEnum('payment_status', ['scheduled', 'due', 'paid', 'failed', 'missed', 'pending_default', 'defaulted']).notNull().default('scheduled'),
  grace_period_ends_at: timestamp('grace_period_ends_at'),
  retry_attempted:    boolean('retry_attempted').notNull().default(false),
  provider_reference: varchar('provider_reference', { length: 255 }),
  created_at:         timestamp('created_at').notNull().defaultNow(),
  updated_at:         timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  groupCycleIdx: index('contributions_group_cycle_idx').on(t.group_id, t.cycle_number),
  memberIdx:     index('contributions_member_idx').on(t.member_id),
}));

// ─── Rotations ────────────────────────────────────────────────────────────────
export const rotations = mysqlTable('rotations', {
  id:                        varchar('id', { length: 36 }).primaryKey(),
  group_id:                  varchar('group_id', { length: 36 }).notNull().references(() => savingsGroups.id),
  cycle_number:              int('cycle_number').notNull(),
  recipient_id:              varchar('recipient_id', { length: 36 }).notNull().references(() => users.id),
  scheduled_payout_date:     timestamp('scheduled_payout_date').notNull(),
  payout_status:             mysqlEnum('payout_status', ['pending', 'processing', 'completed', 'failed']).notNull().default('pending'),
  provider_transfer_reference: varchar('provider_transfer_reference', { length: 255 }),
  completed_date:            timestamp('completed_date'),
  created_at:                timestamp('created_at').notNull().defaultNow(),
  updated_at:                timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  groupCycleIdx: index('rotations_group_cycle_idx').on(t.group_id, t.cycle_number),
}));

// ─── Votes ────────────────────────────────────────────────────────────────────
export const votes = mysqlTable('votes', {
  id:             varchar('id', { length: 36 }).primaryKey(),
  group_id:       varchar('group_id', { length: 36 }).notNull().references(() => savingsGroups.id),
  // 'member_admission': unanimous vote to admit a prospective new member.
  // 'contribution_claim': unanimous vote to temporarily raise the
  // contribution amount for the group. Both are email-based (see
  // vote_email_tokens) and a single reject or 48h timeout invalidates them —
  // see voteService.checkAndClose. 'payout_swap' is a direct 1:1
  // accept/decline with the target member (also email-based), not a
  // group-wide vote.
  proposal_type:  mysqlEnum('proposal_type', ['payout_swap', 'exceptional_request', 'member_admission', 'contribution_claim']).notNull(),
  proposer_id:    varchar('proposer_id', { length: 36 }).notNull().references(() => users.id),
  proposal_text:  text('proposal_text').notNull(),
  // The other party this vote concerns, when it's a 1:1 matter rather than a
  // full-group one — the swap target for 'payout_swap', or left null for
  // group-wide votes ('member_admission', 'contribution_claim').
  target_member_id: varchar('target_member_id', { length: 36 }).references(() => users.id),
  // Structured payload for the vote (invitee email for member_admission,
  // claimed amount for contribution_claim) — kept separate from
  // proposal_text (which stays human-readable) for reliable machine parsing.
  metadata:       json('metadata'),
  // true for 'member_admission'/'contribution_claim' — every active member
  // must approve (a single reject closes the vote immediately as rejected);
  // false for the existing percentage-based (voting_threshold) votes.
  requires_unanimous: boolean('requires_unanimous').notNull().default(false),
  voting_deadline: timestamp('voting_deadline').notNull(),
  status:         mysqlEnum('status', ['open', 'approved', 'rejected', 'expired']).notNull().default('open'),
  created_at:     timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  groupIdx: index('votes_group_idx').on(t.group_id),
}));

// ─── Vote Responses ───────────────────────────────────────────────────────────
export const voteResponses = mysqlTable('vote_responses', {
  id:         varchar('id', { length: 36 }).primaryKey(),
  vote_id:    varchar('vote_id', { length: 36 }).notNull().references(() => votes.id, { onDelete: 'cascade' }),
  member_id:  varchar('member_id', { length: 36 }).notNull().references(() => users.id),
  decision:   mysqlEnum('decision', ['approve', 'reject']).notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  voteMemberIdx: index('vote_responses_vote_member_idx').on(t.vote_id, t.member_id),
}));

// ─── Vote Email Tokens ────────────────────────────────────────────────────────
// One row per member entitled to respond to a vote by email, generated when
// the vote is created (see voteService.create/proposePayoutSwap). Lets
// governance emails carry a single-click accept/decline link
// (GET /api/votes/respond?token=...&decision=...) that works without the
// member needing to be logged in — the token itself is the authentication.
export const voteEmailTokens = mysqlTable('vote_email_tokens', {
  id:           varchar('id', { length: 36 }).primaryKey(),
  vote_id:      varchar('vote_id', { length: 36 }).notNull().references(() => votes.id, { onDelete: 'cascade' }),
  member_id:    varchar('member_id', { length: 36 }).notNull().references(() => users.id),
  token:        varchar('token', { length: 255 }).notNull().unique(),
  responded_at: timestamp('responded_at'),
  created_at:   timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  voteIdx: index('vote_email_tokens_vote_idx').on(t.vote_id),
}));


// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = mysqlTable('notifications', {
  id:         varchar('id', { length: 36 }).primaryKey(),
  user_id:    varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  type:       varchar('type', { length: 100 }).notNull(),
  title:      varchar('title', { length: 255 }).notNull(),
  message:    text('message').notNull(),
  is_read:    boolean('is_read').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userIdx:   index('notifications_user_idx').on(t.user_id),
  readIdx:   index('notifications_read_idx').on(t.user_id, t.is_read),
}));

// ─── Subscriptions ────────────────────────────────────────────────────────────
export const subscriptions = mysqlTable('subscriptions', {
  id:                      varchar('id', { length: 36 }).primaryKey(),
  user_id:                 varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider:                mysqlEnum('provider', ['stripe', 'flutterwave']).notNull(),
  provider_subscription_id: varchar('provider_subscription_id', { length: 255 }),
  plan:                    varchar('plan', { length: 100 }).notNull().default('free'),
  // 'paused': DB-level bookkeeping only (see scheduledJobs.dailyPauseBillingForZeroActiveGroups) —
  // set when a user's active-group membership count hits exactly zero. Excluded from
  // monthlySubscriptionRenewalCharge's Flutterwave renewal charging. Does not yet call
  // Stripe's native pause_collection API, so a Stripe subscription may still self-bill;
  // this is a known scoping limitation, not a silent bug.
  billing_status:          mysqlEnum('billing_status', ['active', 'past_due', 'cancelled', 'trialing', 'paused']).notNull().default('trialing'),
  renewal_date:            timestamp('renewal_date'),
  // A downgrade requested mid-cycle keeps the member on their current tier's
  // price/limits until the next renewal (no proration refund); this holds
  // the tier they'll move to at that point. Applied and cleared by the
  // renewal job (scheduledJobs.ts) / Stripe invoice.payment_succeeded
  // webhook (webhookStripeController.ts). Null when no downgrade is pending.
  pending_tier:            mysqlEnum('pending_tier', ['basic', 'premium']),
  created_at:              timestamp('created_at').notNull().defaultNow(),
  updated_at:              timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

// ─── Support Tickets ──────────────────────────────────────────────────────────
export const supportTickets = mysqlTable('support_tickets', {
  id:              varchar('id', { length: 36 }).primaryKey(),
  user_id:         varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  subject:         varchar('subject', { length: 255 }).notNull(),
  category:        mysqlEnum('category', ['payments', 'groups', 'subscriptions', 'technical', 'general']).notNull().default('general'),
  description:     text('description').notNull(),
  priority:        mysqlEnum('priority', ['low', 'medium', 'high', 'urgent']).notNull().default('medium'),
  status:          mysqlEnum('status', ['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed']).notNull().default('open'),
  assigned_admin:  varchar('assigned_admin', { length: 36 }).references(() => users.id),
  admin_response:  text('admin_response'),
  created_at:      timestamp('created_at').notNull().defaultNow(),
  updated_at:      timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  userIdx:   index('support_tickets_user_idx').on(t.user_id),
  statusIdx: index('support_tickets_status_idx').on(t.status),
}));

// ─── System Error Log ─────────────────────────────────────────────────────────
export const systemErrors = mysqlTable('system_errors', {
  id:           varchar('id', { length: 36 }).primaryKey(),
  type:         varchar('type', { length: 100 }).notNull(),
  endpoint:     varchar('endpoint', { length: 255 }),
  message:      text('message').notNull(),
  resolved:     boolean('resolved').notNull().default(false),
  created_at:   timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  typeIdx:      index('system_errors_type_idx').on(t.type),
  resolvedIdx:  index('system_errors_resolved_idx').on(t.resolved),
}));

// ─── Job Runs ─────────────────────────────────────────────────────────────────
export const jobRuns = mysqlTable('job_runs', {
  id:            varchar('id', { length: 36 }).primaryKey(),
  job_name:      varchar('job_name', { length: 100 }).notNull(),
  status:        mysqlEnum('status', ['success', 'failed']).notNull(),
  started_at:    timestamp('started_at').notNull(),
  completed_at:  timestamp('completed_at'),
  error_message: text('error_message'),
}, (t) => ({
  jobNameIdx: index('job_runs_job_name_idx').on(t.job_name),
}));

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditLogs = mysqlTable('audit_logs', {
  id:         varchar('id', { length: 36 }).primaryKey(),
  user_id:    varchar('user_id', { length: 36 }).references(() => users.id),
  action:     varchar('action', { length: 100 }).notNull(),
  entity:     varchar('entity', { length: 100 }),
  entity_id:  varchar('entity_id', { length: 36 }),
  ip_address: varchar('ip_address', { length: 45 }),
  metadata:   json('metadata'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userIdx:   index('audit_logs_user_idx').on(t.user_id),
  actionIdx: index('audit_logs_action_idx').on(t.action),
}));

// ─── Platform Counters ────────────────────────────────────────────────────────
// Generic atomic counters shared across the platform. Currently used to track
// how many users have ever successfully completed Stripe Identity verification
// (name: 'identity_verifications_free_used'), so the first 50 platform-wide can
// be verified for free and the 51st onward gets a £1 surcharge — incremented
// inside a single DB transaction (INSERT ... ON DUPLICATE KEY UPDATE, then a
// read of the same row) so concurrent verifications can't race past the cap.
export const platformCounters = mysqlTable('platform_counters', {
  name:       varchar('name', { length: 100 }).primaryKey(),
  value:      int('value').notNull().default(0),
  updated_at: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

// ─── Email Blocklist ──────────────────────────────────────────────────────────
// Permanent record of deleted accounts' email addresses, kept ONLY as a
// salted-free SHA-256 hash (never the plaintext email) so a deleted user
// can't sign up or log in again under the same address — see
// userService.deleteAccount (inserts here) and authService.register (checks
// here). This exists specifically to stop a member from evading their
// default/suspension history by re-registering with the same email; do NOT
// loosen this later with "smart" email-variation matching (e.g. dots,
// +tags, case-folding beyond a simple lowercase/trim) without recognising
// that doing so defeats the entire purpose of this table. Rows are never
// deleted by app code.
export const emailBlocklist = mysqlTable('email_blocklist', {
  id:         varchar('id', { length: 36 }).primaryKey(),
  email_hash: varchar('email_hash', { length: 64 }).notNull().unique(),
  reason:     varchar('reason', { length: 255 }).notNull().default('account_deleted'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
