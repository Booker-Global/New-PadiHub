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
  // Admin-only login identifier — regular members always sign in with
  // email/password (see authService.login). Populated only for the
  // dedicated admin account (see authService.ensureDefaultAdminAccount) so
  // an admin never needs a real, email-verified member profile just to
  // reach /admin — see authService.adminLogin.
  username:                    varchar('username', { length: 50 }).unique(),
  phone_number:                varchar('phone_number', { length: 30 }),
  country:                     varchar('country', { length: 2 }).notNull().default('GB'),
  currency:                    varchar('currency', { length: 3 }).notNull().default('GBP'),
  trust_score:                 int('trust_score').notNull().default(0),
  // 'pending' = onboarding fully complete (email, plan, verified card,
  // verified payout, identity) but no provider subscription has been
  // created/charged yet — that only happens once the member's group
  // actually launches (see subscriptionService.reconcileBillingForActiveGroupMembership).
  subscription_status:         mysqlEnum('subscription_status', ['free', 'trial', 'pending', 'active', 'expired', 'cancelled']).notNull().default('free'),
  // The subscription tier the user chose during onboarding — 'basic' or 'premium'
  // (see SUBSCRIPTION_TIERS in src/server/lib/constants.ts). Null until the
  // user picks a plan; group creation/joining requires this to be set — see
  // paymentEligibilityService.ts.
  subscription_tier:           mysqlEnum('subscription_tier', ['basic', 'premium']),
  // Atomic claim guarding subscriptionService.reconcileBillingForActiveGroupMembership's
  // "no subscriptions row yet — attempt the first charge" critical section.
  // Concurrent triggers for the same user (e.g. the intraday safety-net
  // sweep firing at the same moment as an inline join/activation trigger,
  // or the user being admitted to two different groups at nearly the same
  // instant) could otherwise both pass the "no existing subscription" check
  // before either finishes creating one, charging the member's card twice.
  // Stamped right before the provider is contacted, cleared in a `finally`
  // once the attempt completes; SUBSCRIPTION_ACTIVATION_CLAIM_TTL_MS
  // (constants.ts) lets a stale claim (crashed process) self-heal instead
  // of permanently blocking future attempts.
  subscription_activation_claimed_at: timestamp('subscription_activation_claimed_at'),
  stripe_customer_id:          varchar('stripe_customer_id', { length: 100 }),
  stripe_payment_method_id:    varchar('stripe_payment_method_id', { length: 100 }),
  stripe_connected_account_id: varchar('stripe_connected_account_id', { length: 100 }),
  flutterwave_customer_id:     varchar('flutterwave_customer_id', { length: 100 }),
  flutterwave_card_token:      varchar('flutterwave_card_token', { length: 255 }),
  flutterwave_subaccount_id:   varchar('flutterwave_subaccount_id', { length: 100 }),
  flutterwave_payout_bank_code:      varchar('flutterwave_payout_bank_code', { length: 20 }),
  flutterwave_payout_account_number: varchar('flutterwave_payout_account_number', { length: 34 }),
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
  // Verified name/DOB/address captured from Stripe Identity's completed
  // VerificationSession (verified_outputs — GB only). Used SOLELY to
  // pre-fill the member's Stripe Connect Express payout account via the API
  // (see StripeProvider.createConnectedAccount/syncIndividualDetails) so
  // Stripe's hosted onboarding page has fewer/no personal-detail questions
  // left to ask — never displayed back to the member and never used in
  // place of the identity verification result itself.
  verified_date_of_birth:      varchar('verified_date_of_birth', { length: 10 }),
  verified_address_line1:      varchar('verified_address_line1', { length: 255 }),
  verified_address_line2:      varchar('verified_address_line2', { length: 255 }),
  verified_address_city:       varchar('verified_address_city', { length: 100 }),
  verified_address_postal_code: varchar('verified_address_postal_code', { length: 20 }),
  verified_address_state:      varchar('verified_address_state', { length: 100 }),
  // TODO(NG paid KYC tier): reserved for a future PAID full BVN identity-
  // verification tier for Nigeria (distinct from the free interim
  // Flutterwave Account Resolve bank-account-validation check — see
  // BankAccountValidationInterface.ts). Not implemented yet; always null.
  bvn_verification_reference:  varchar('bvn_verification_reference', { length: 255 }),
  password_changed_at:         timestamp('password_changed_at'),
  last_login_at:               timestamp('last_login_at'),
  // Set the first time the member finishes every onboarding step (email +
  // identity + subscription plan + payment method + payout destination), so
  // the "your profile setup is complete" email is only ever sent once —
  // see paymentEligibilityService.notifyOnboardingComplete().
  onboarding_completed_email_sent_at: timestamp('onboarding_completed_email_sent_at'),
  // Last time a "your subscription payment could not be completed" email
  // was sent for a still-failing activation attempt — every group-launch
  // event that could trigger the first charge (see
  // subscriptionService.reconcileBillingForActiveGroupMembership) has no
  // cooldown of its own, so without this a persistently-failing account
  // could be re-emailed on every single retry/sweep pass. See
  // shouldNotifyActivationFailureByEmail in subscriptionService.ts.
  subscription_activation_failure_notified_at: timestamp('subscription_activation_failure_notified_at'),
  // Legacy — no longer written to (the "Pending Charge, no group joined"
  // reminder/expiry job it throttled was removed when subscription billing
  // was rebuilt to only ever trigger on group launch — see Part C of the
  // onboarding spec). Left in place rather than dropped, to avoid an
  // unnecessary destructive migration for a harmless, always-null column.
  group_join_reminder_last_sent_at: timestamp('group_join_reminder_last_sent_at'),
  // Section 2 — an account that hasn't yet finished every onboarding step
  // (a-e) gets a reminder every 7 days detailing what's missing, and the
  // profile is deleted after 60 days of remaining incomplete — see
  // scheduledJobs.weeklyIncompleteOnboardingFollowUp.
  onboarding_incomplete_reminder_last_sent_at: timestamp('onboarding_incomplete_reminder_last_sent_at'),
  // Section 3 — a member who cancelled their subscription gets a reminder
  // every 7 days to re-subscribe, and the profile is deleted after 60 days
  // of remaining cancelled/inactive — see
  // scheduledJobs.weeklyResubscribeFollowUp.
  resubscribe_reminder_last_sent_at: timestamp('resubscribe_reminder_last_sent_at'),
  // Section 4 — cumulative count of times this member has been removed
  // from a group via a passed member-removal vote (never reset). On the
  // 3rd, the profile is auto-deleted (see membershipService.departMember /
  // userService.systemDeleteAccount). Backfilled retroactively from
  // audit-log history at boot — see subscriptionService.
  // backfillVoteRemovedCountsAndEnforceThreshold.
  vote_removed_count:          int('vote_removed_count').notNull().default(0),
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
  // When a leader changes the contribution_frequency, OR just amends the
  // payout day (weekly)/payout date (monthly) while keeping the same
  // frequency, the new value is stored here along with an effective_date
  // (chosen by the leader from the upcoming dates shown for that day on the
  // "Edit group" screen). On the effective_date, contribution_frequency is
  // updated to this value (a no-op if only the day changed) and this column
  // is cleared back to null. Allows leaders to schedule frequency/day
  // changes for a future date (e.g., "switch to weekly next Monday", or
  // "move payout day to the 20th starting next month") instead of an
  // immediate change disrupting the cycle in progress.
  pending_contribution_frequency: mysqlEnum('pending_contribution_frequency', ['daily', 'weekly', 'monthly']),
  // Effective date for the pending_contribution_frequency and/or
  // pending_payout_day change. Once this date arrives, the change is
  // applied and both this column and the pending_* columns are reset to
  // null. See dailyApplyPendingPayoutFrequencyChanges (scheduledJobs.ts).
  contribution_frequency_change_effective_date: timestamp('contribution_frequency_change_effective_date'),
  // The new payout_day to apply on contribution_frequency_change_effective_date.
  // Set whenever either the frequency is changing (alongside
  // pending_contribution_frequency) or the leader is only amending the
  // payout day/date within the same frequency (pending_contribution_frequency
  // stays null in that case — see groupService.update).
  pending_payout_day:       int('pending_payout_day'),
  maximum_members:          int('maximum_members').notNull().default(10),
  // Minimum Trust Score a prospective member must have to request to join
  // this group — set by the creator at group-creation time (0 = no minimum).
  // Enforced in membershipService.requestToJoin().
  min_trust_score:          int('min_trust_score').notNull().default(0),
  // "Available to public" toggle, set at creation and editable by the
  // Creator afterwards. true (default): the group appears in group search
  // results and strangers can submit a self-service "request to join" (see
  // groupService.search() and membershipService.join()). false: the group
  // is private — it's hidden from search and self-service join requests are
  // rejected; the ONLY way to join is a direct invite from the Creator.
  is_public:                boolean('is_public').notNull().default(true),
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
  // "Require voting for key decisions" toggle, set at creation and editable
  // by the Creator afterwards (mirrors the create.tsx "Require voting for
  // key decisions" OptionCard). When true, self-service "request to join"
  // submissions are never decided unilaterally by the leader — join()
  // automatically opens a unanimous member_admission vote (see
  // voteService.proposeMemberAdmission), and approveJoinRequest/
  // rejectJoinRequest are rejected outright so the leader cannot bypass it.
  requires_admission_vote: boolean('requires_admission_vote').notNull().default(false),
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
  // Set when a group is suspended to track the deadline for grace period.
  // If the group remains below minimum members until this date/time,
  // the group auto-closes and is marked as 'closed'. Reset to null if the
  // group is reactivated (reaches minimum members again).
  suspension_grace_period_ends_at: timestamp('suspension_grace_period_ends_at'),
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
  // ─── Group lifecycle length (chosen once, at creation) ──────────────────
  // NOTE: distinct from `current_cycle` above, which numbers individual
  // payout turns (one per rotation, i.e. one per member). A "full rotation"
  // here means every currently-active member has received exactly one
  // payout — i.e. `current_rotation_position` completing a full lap back to
  // 1. 'fixed': the group auto-closes once `group_duration_rotations` full
  // rotations have completed (rotationService.advance() checks this every
  // time a lap completes). 'indefinite': runs forever unless the Owner
  // schedules a closure (see `closure_scheduled`).
  group_duration_type:      mysqlEnum('group_duration_type', ['fixed', 'indefinite']).notNull().default('indefinite'),
  // Number of complete full rotations the group runs for — required (and
  // only meaningful) when group_duration_type is 'fixed'.
  group_duration_rotations: int('group_duration_rotations'),
  // Count of full rotations completed so far — incremented each time
  // current_rotation_position wraps back to 1. Also the trigger point for
  // re-applying the "first 3 slots reserved for Organiser/highest Trust
  // Score" rule at the start of every new rotation, not just the first.
  full_rotations_completed: int('full_rotations_completed').notNull().default(0),
  // Owner-triggered "Close Group" for an indefinite group — set true to
  // schedule closure for the moment the in-progress rotation finishes (never
  // mid-rotation, so nobody is denied a payout they've already contributed
  // toward). rotationService.advance() checks this on every lap completion.
  closure_scheduled:        boolean('closure_scheduled').notNull().default(false),
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
  // Set whenever the most recent charge attempt for this contribution never
  // reached the payment provider at all (PaymentProviderConfigError — a
  // missing PadiHub-side secret key/Price ID, not a member-facing card
  // issue). Cleared the moment a REAL attempt happens (success or genuine
  // decline). dailyOverdueCheck must never call markMissed — and
  // dailyContributionDefaultRetry must never call markFailed — while this is
  // set, since that would impose a customer-facing consequence (Trust Score
  // penalty, strike, "missed"/"defaulted" status) for a charge Stripe never
  // even saw. See chargeContributionForUser in paymentController.ts.
  provider_config_error_at: timestamp('provider_config_error_at'),
  // Dedicated throttle/dedup column (never a generic onUpdateNow() column —
  // see contributionService.markPaid/markFailed which also touch this row)
  // for dailyContributionReminders: guarantees the "contribution due soon"
  // email is sent at most ONCE per contribution, instead of re-sending it
  // every day the cron runs for as long as due_date stays within the
  // reminder window.
  reminder_sent_at:   timestamp('reminder_sent_at'),
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
  // Dedicated throttle/dedup column: the "you're scheduled to receive a
  // payout" email must only go out once, ~1 week before scheduled_payout_date
  // (see scheduledJobs.dailyUpcomingPayoutReminders) — never immediately at
  // rotation-record creation time, which can be a full cycle length before
  // the actual payout and previously caused members to be emailed about a
  // payout that was "way too early".
  upcoming_payout_reminder_sent_at: timestamp('upcoming_payout_reminder_sent_at'),
  // Dedicated throttle/dedup column: the "your payout is delayed, here's
  // why" group-wide notice must only go out once per rotation, the first
  // time the frequent payout catch-up sweep (or the login-triggered check)
  // finds scheduled_payout_date has already arrived but the cycle still
  // isn't fully resolved (some member hasn't paid/defaulted/missed yet) —
  // see rotationService.sendPayoutDelayNoticeIfDue.
  payout_delay_notice_sent_at: timestamp('payout_delay_notice_sent_at'),
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
  // group-wide vote. 'member_removal' is a unanimous group-wide vote (like
  // member_admission/contribution_claim) EXCEPT the target_member_id is
  // excluded from both the voting body and the eligible-voter tally — see
  // voteService.proposeMemberRemoval.
  proposal_type:  mysqlEnum('proposal_type', ['payout_swap', 'exceptional_request', 'member_admission', 'contribution_claim', 'member_removal']).notNull(),
  proposer_id:    varchar('proposer_id', { length: 36 }).notNull().references(() => users.id),
  proposal_text:  text('proposal_text').notNull(),
  // The other party this vote concerns — the swap target for 'payout_swap'
  // (a direct 1:1 accept/decline), the member being voted out for
  // 'member_removal' (a group-wide unanimous vote excluding this member),
  // or left null for other group-wide votes ('member_admission',
  // 'contribution_claim').
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
  // 'paused': set when a user's active-group membership count hits exactly
  // zero (Section D.2 — billing must stay inert until the member is
  // verified in an active 3+ member group). Excluded from
  // monthlySubscriptionRenewalCharge's Flutterwave renewal charging. For
  // Stripe, subscriptionService also calls the provider's real
  // pause_collection API (see StripeProvider.pauseBilling/resumeBilling)
  // so the card is genuinely never charged while paused, not just a DB flag.
  billing_status:          mysqlEnum('billing_status', ['active', 'past_due', 'cancelled', 'trialing', 'paused']).notNull().default('trialing'),
  renewal_date:            timestamp('renewal_date'),
  // A downgrade requested mid-cycle keeps the member on their current tier's
  // price/limits until the next renewal (no proration refund); this holds
  // the tier they'll move to at that point. Applied and cleared by the
  // renewal job (scheduledJobs.ts) / Stripe invoice.payment_succeeded
  // webhook (webhookStripeController.ts). Null when no downgrade is pending.
  pending_tier:            mysqlEnum('pending_tier', ['basic', 'premium']),
  // Stamped every time activation (createSubscription) is actually attempted
  // with the provider — deliberately separate from `updated_at`, which also
  // gets bumped by unrelated writes (billing-status reconciliation on group
  // join/leave, Stripe invoice webhooks) that have nothing to do with an
  // activation retry. paymentEligibilityService's stuck-subscription self-heal
  // throttles on THIS column so those unrelated writes can never starve it of
  // ever retrying; subscriptionService also uses it to avoid re-sending the
  // "payment could not be completed" email on every single onboarding action
  // for a member whose activation is still (genuinely) failing.
  last_activation_attempt_at: timestamp('last_activation_attempt_at'),
  // Section 3 — stamped whenever billing_status is set to 'cancelled' via
  // subscriptionService.cancelSubscription (never via account deletion,
  // which cancels for an unrelated reason). Anchors the 7-day
  // resubscribe-reminder / 60-day auto-deletion workflow — see
  // scheduledJobs.weeklyResubscribeFollowUp. Deliberately separate from
  // updated_at for the same reason as last_activation_attempt_at above.
  cancelled_at:            timestamp('cancelled_at'),
  // Section 7 — stamped when the synchronous Flutterwave "first charge on
  // joining an active group" attempt fails (see subscriptionService's
  // reconcileBillingForActiveGroupMembership). Anchors the one-time 72-hour
  // retry (scheduledJobs.dailySubscriptionFirstChargeRetry) — after which,
  // if still failing, the member is removed from the group they just
  // joined and notified, per the "never send a payment-failure email except
  // for an actual failed charge attempt" policy. Cleared as soon as the
  // retry succeeds (or the member is removed), so it never re-fires.
  first_charge_failed_at: timestamp('first_charge_failed_at'),
  // Stripe sends BOTH `invoice.paid` and `invoice.payment_succeeded` for the
  // exact same successful invoice (and may redeliver either one on retry) —
  // webhookStripeController.ts's shared handler for those two event types
  // stamps the invoice.id here the first time it fully processes a given
  // invoice, and short-circuits (skips re-sending the confirmation
  // email/notification/audit-log) on every subsequent delivery for that
  // same invoice, however it arrives. Flutterwave has no equivalent
  // duplicate-event risk, so this column is Stripe-only.
  last_processed_invoice_id: varchar('last_processed_invoice_id', { length: 255 }),
  // Throttles scheduledJobs.dailySubscriptionPastDueRecovery's "Subscription
  // Payment Overdue" notification to once every PAST_DUE_NOTIFICATION_
  // COOLDOWN_DAYS (see constants.ts) instead of every single daily run —
  // that job's Stripe/Flutterwave self-heal retry attempt must stay daily
  // (a stuck past_due subscription shouldn't wait longer to self-heal), but
  // re-notifying the member every day for the same still-unresolved
  // problem, with no cooldown, is just alert fatigue, not new information.
  past_due_notification_sent_at: timestamp('past_due_notification_sent_at'),
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

// ─── Email Logs ───────────────────────────────────────────────────────────────
// One row per outbound transactional email attempt, logged from the single
// internal send() wrapper in integrations/email/emailService.ts (every one of
// the ~60 sendXxxEmail() helpers funnels through it), so the admin dashboard's
// "Email usage" KPI reflects real send volume/success rate, not an estimate.
export const emailLogs = mysqlTable('email_logs', {
  id:            varchar('id', { length: 36 }).primaryKey(),
  recipient:     varchar('recipient', { length: 255 }).notNull(),
  subject:       varchar('subject', { length: 255 }).notNull(),
  status:        mysqlEnum('status', ['sent', 'failed']).notNull(),
  error_message: text('error_message'),
  created_at:    timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  statusIdx:    index('email_logs_status_idx').on(t.status),
  createdAtIdx: index('email_logs_created_at_idx').on(t.created_at),
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
