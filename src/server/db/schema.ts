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
  // The subscription tier the user chose during onboarding — 'pro' or 'elite'
  // (see SUBSCRIPTION_TIERS in src/server/lib/constants.ts). Null until the
  // user picks a plan; group creation/joining requires this to be set — see
  // paymentEligibilityService.ts.
  subscription_tier:           mysqlEnum('subscription_tier', ['pro', 'elite']),
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
  stripe_identity_session_id:  varchar('stripe_identity_session_id', { length: 255 }),
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
  suspension_threshold:     int('suspension_threshold').notNull().default(3),
  voting_threshold:         int('voting_threshold').notNull().default(51),
  allow_payout_swaps:       boolean('allow_payout_swaps').notNull().default(true),
  payment_provider:         mysqlEnum('payment_provider', ['stripe', 'flutterwave']).notNull(),
  status:                   mysqlEnum('status', ['active', 'closed', 'suspended']).notNull().default('active'),
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
  // Provider processing fee charged on top of amount_due (not deducted from
  // the group pot) — see src/server/lib/paymentFees.ts. Null until charged.
  fee_amount:         decimal('fee_amount', { precision: 12, scale: 2 }),
  due_date:           timestamp('due_date').notNull(),
  paid_date:          timestamp('paid_date'),
  payment_status:     mysqlEnum('payment_status', ['scheduled', 'due', 'paid', 'failed', 'missed']).notNull().default('scheduled'),
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
  proposal_type:  mysqlEnum('proposal_type', ['payout_swap', 'exceptional_request']).notNull(),
  proposer_id:    varchar('proposer_id', { length: 36 }).notNull().references(() => users.id),
  proposal_text:  text('proposal_text').notNull(),
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
  billing_status:          mysqlEnum('billing_status', ['active', 'past_due', 'cancelled', 'trialing']).notNull().default('trialing'),
  renewal_date:            timestamp('renewal_date'),
  // A downgrade requested mid-cycle keeps the member on their current tier's
  // price/limits until the next renewal (no proration refund); this holds
  // the tier they'll move to at that point. Applied and cleared by the
  // renewal job (scheduledJobs.ts) / Stripe invoice.payment_succeeded
  // webhook (webhookStripeController.ts). Null when no downgrade is pending.
  pending_tier:            mysqlEnum('pending_tier', ['pro', 'elite']),
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
