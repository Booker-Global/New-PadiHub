/**
 * OpenAPI 3.0 specification for PadiHub API.
 * Served at GET /api/docs via swagger-ui-express.
 */
import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

const spec = {
  openapi: '3.0.0',
  info: {
    title:       'PadiHub API',
    version:     '1.0.0',
    description: 'PadiHub — Save Together. Grow Together. Belong. REST API documentation.',
    contact:     { name: 'PadiHub Support', email: 'support@padihub.com' },
  },
  servers: [
    { url: '/api', description: 'Current server' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from POST /api/auth/login',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          code:    { type: 'string' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id:                  { type: 'string', format: 'uuid' },
          email:               { type: 'string', format: 'email' },
          first_name:          { type: 'string' },
          last_name:           { type: 'string' },
          country:             { type: 'string', enum: ['GB', 'NG'] },
          currency:            { type: 'string', enum: ['GBP', 'NGN'] },
          trust_score:         { type: 'integer' },
          account_status:      { type: 'string', enum: ['pending_verification', 'active', 'suspended', 'deactivated'] },
          subscription_status: { type: 'string', enum: ['free', 'trial', 'active', 'expired', 'cancelled'] },
          identity_verified:   { type: 'boolean' },
          role:                { type: 'string', enum: ['member', 'group_leader', 'admin'] },
        },
      },
      Group: {
        type: 'object',
        properties: {
          id:                     { type: 'string', format: 'uuid' },
          name:                   { type: 'string' },
          country:                { type: 'string' },
          currency:               { type: 'string' },
          contribution_amount:    { type: 'string' },
          contribution_frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
          payout_day:             { type: 'integer', nullable: true, description: 'Day of week (0-6) for weekly groups, or day of month (1-31) for monthly groups. Not used for daily groups.' },
          maximum_members:        { type: 'integer' },
          status:                 { type: 'string', enum: ['active', 'closed', 'suspended'] },
        },
      },
      Contribution: {
        type: 'object',
        properties: {
          id:             { type: 'string', format: 'uuid' },
          group_id:       { type: 'string', format: 'uuid' },
          member_id:      { type: 'string', format: 'uuid' },
          cycle_number:   { type: 'integer' },
          amount_due:     { type: 'string' },
          payment_status: { type: 'string', enum: ['scheduled', 'due', 'paid', 'failed', 'missed'] },
          due_date:       { type: 'string', format: 'date-time' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id:         { type: 'string', format: 'uuid' },
          type:       { type: 'string' },
          title:      { type: 'string' },
          message:    { type: 'string' },
          is_read:    { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      SupportTicket: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid' },
          subject:     { type: 'string' },
          category:    { type: 'string', enum: ['payments', 'groups', 'subscriptions', 'technical', 'general'] },
          description: { type: 'string' },
          priority:    { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          status:      { type: 'string', enum: ['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'] },
        },
      },
      Subscription: {
        type: 'object',
        properties: {
          id:                      { type: 'string', format: 'uuid' },
          provider:                { type: 'string', enum: ['stripe', 'flutterwave'] },
          plan:                    { type: 'string' },
          billing_status:          { type: 'string', enum: ['active', 'past_due', 'cancelled', 'trialing'] },
          renewal_date:            { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ── Auth ──────────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password', 'first_name', 'last_name', 'country', 'currency'], properties: { email: { type: 'string' }, password: { type: 'string' }, first_name: { type: 'string' }, last_name: { type: 'string' }, country: { type: 'string', enum: ['GB', 'NG'] }, currency: { type: 'string', enum: ['GBP', 'NGN'] } } } } } },
        responses: { '201': { description: 'User registered' }, '400': { description: 'Validation error' }, '409': { description: 'Email already in use' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login and receive JWT',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } },
        responses: { '200': { description: 'JWT token returned' }, '401': { description: 'Invalid credentials' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current authenticated user',
        responses: { '200': { description: 'Current user', content: { 'application/json': { schema: { '$ref': '#/components/schemas/User' } } } }, '401': { description: 'Unauthenticated' } },
      },
    },
    '/auth/logout': { post: { tags: ['Authentication'], summary: 'Logout', responses: { '200': { description: 'Logged out' } } } },
    '/auth/verify-email': { post: { tags: ['Authentication'], summary: 'Verify email address with token', security: [], responses: { '200': { description: 'Email verified' } } } },
    '/auth/forgot-password': { post: { tags: ['Authentication'], summary: 'Request password reset email', security: [], responses: { '200': { description: 'Reset email sent' } } } },
    '/auth/reset-password': { post: { tags: ['Authentication'], summary: 'Reset password with token', security: [], responses: { '200': { description: 'Password reset' } } } },
    '/auth/change-password': { post: { tags: ['Authentication'], summary: 'Change password (authenticated)', responses: { '200': { description: 'Password changed' } } } },
    '/auth/refresh': { post: { tags: ['Authentication'], summary: 'Refresh JWT token', responses: { '200': { description: 'New token issued' } } } },

    // ── Users ─────────────────────────────────────────────────────────────────
    '/users/profile': {
      get:  { tags: ['Users'], summary: 'Get own profile', responses: { '200': { description: 'User profile' } } },
      put:  { tags: ['Users'], summary: 'Update own profile', responses: { '200': { description: 'Profile updated' } } },
      delete: { tags: ['Users'], summary: 'Delete own account', responses: { '200': { description: 'Account deleted' } } },
    },

    // ── Groups ────────────────────────────────────────────────────────────────
    '/groups': {
      get:  { tags: ['Groups'], summary: 'List savings groups', responses: { '200': { description: 'Groups list' } } },
      post: { tags: ['Groups'], summary: 'Create a savings group (group_leader/admin, identity verification required)', responses: { '201': { description: 'Group created' }, '403': { description: 'Verification required or insufficient role' } } },
    },
    '/groups/{id}': {
      get:    { tags: ['Groups'], summary: 'Get group by ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Group detail' } } },
      put:    { tags: ['Groups'], summary: 'Update group', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Group updated' } } },
      delete: { tags: ['Groups'], summary: 'Close group', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Group closed' } } },
    },
    '/groups/{id}/invitations': {
      post: { tags: ['Groups'], summary: 'Create group invitation', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Invitation created' } } },
    },

    // ── Memberships ───────────────────────────────────────────────────────────
    '/memberships': {
      get:  { tags: ['Memberships'], summary: 'List own memberships', responses: { '200': { description: 'Memberships' } } },
      post: { tags: ['Memberships'], summary: 'Join a group', responses: { '200': { description: 'Joined group' } } },
    },
    '/memberships/{id}': {
      delete: { tags: ['Memberships'], summary: 'Leave a group', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Left group' } } },
    },
    '/memberships/remove': {
      post: { tags: ['Memberships'], summary: 'Remove a member (group_leader/admin)', responses: { '200': { description: 'Member removed' } } },
    },

    // ── Contributions ─────────────────────────────────────────────────────────
    '/contributions': {
      get: { tags: ['Contributions'], summary: 'List contributions', responses: { '200': { description: 'Contributions list' } } },
    },
    '/contributions/{id}': {
      put: { tags: ['Contributions'], summary: 'Update contribution', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } },
    },

    // ── Rotations ─────────────────────────────────────────────────────────────
    '/rotations': { get: { tags: ['Rotations'], summary: 'List rotations', responses: { '200': { description: 'Rotations' } } } },
    '/rotations/{id}/current':  { get: { tags: ['Rotations'], summary: 'Current rotation', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Current rotation' } } } },
    '/rotations/{id}/next':     { get: { tags: ['Rotations'], summary: 'Next rotation recipient', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Next recipient' } } } },
    '/rotations/{id}/previous': { get: { tags: ['Rotations'], summary: 'Previous rotation', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Previous rotation' } } } },
    '/rotations/{id}/advance':  { put: { tags: ['Rotations'], summary: 'Advance rotation (group_leader/admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Rotation advanced' } } } },

    // ── Votes ─────────────────────────────────────────────────────────────────
    '/votes': {
      get:  { tags: ['Votes'], summary: 'List votes', responses: { '200': { description: 'Votes' } } },
      post: { tags: ['Votes'], summary: 'Create vote', responses: { '201': { description: 'Vote created' } } },
    },
    '/votes/{id}': {
      put: { tags: ['Votes'], summary: 'Cast vote', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Vote cast' } } },
    },

    // ── Notifications ─────────────────────────────────────────────────────────
    '/notifications': {
      get: { tags: ['Notifications'], summary: 'List notifications (supports ?unread_only=true)', responses: { '200': { description: 'Notifications list' } } },
    },
    '/notifications/count': {
      get: { tags: ['Notifications'], summary: 'Get unread notification count', responses: { '200': { description: 'Unread count' } } },
    },
    '/notifications/read-all': {
      put: { tags: ['Notifications'], summary: 'Mark all notifications as read', responses: { '200': { description: 'All marked read' } } },
    },
    '/notifications/{id}/read': {
      put: { tags: ['Notifications'], summary: 'Mark single notification as read', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Marked read' } } },
    },
    '/notifications/{id}': {
      delete: { tags: ['Notifications'], summary: 'Delete notification', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' } } },
    },

    // ── Payments ──────────────────────────────────────────────────────────────
    '/payments/setup-intent': {
      post: { tags: ['Payments'], summary: 'Create Stripe SetupIntent (UK — returns client_secret for Stripe.js)', responses: { '200': { description: 'SetupIntent created' } } },
    },
    '/payments/connect-onboard': {
      post: { tags: ['Payments'], summary: 'Create Stripe Connect account (UK) or Flutterwave subaccount (NG)', responses: { '200': { description: 'Onboarding URL returned' } } },
    },
    '/payments/charge-contribution': {
      post: { tags: ['Payments'], summary: 'Manually trigger contribution charge', responses: { '200': { description: 'Charge initiated' } } },
    },

    // ── Subscriptions ─────────────────────────────────────────────────────────
    '/subscriptions/status': {
      get: { tags: ['Subscriptions'], summary: 'Get subscription status', responses: { '200': { description: 'Subscription status' } } },
    },
    '/subscriptions/cancel': {
      post: { tags: ['Subscriptions'], summary: 'Cancel subscription', responses: { '200': { description: 'Cancelled' } } },
    },
    '/subscriptions/reactivate': {
      post: { tags: ['Subscriptions'], summary: 'Reactivate subscription', responses: { '200': { description: 'Reactivated' } } },
    },

    // ── Identity Verification ─────────────────────────────────────────────────
    '/identity/verify/start': {
      post: { tags: ['Identity Verification'], summary: 'Start Stripe Identity session (UK users only)', responses: { '200': { description: 'Session created with client_secret and url' }, '403': { description: 'UK users only' } } },
    },
    '/identity/status': {
      get: { tags: ['Identity Verification'], summary: 'Get identity verification status', responses: { '200': { description: 'Verification status' } } },
    },
    '/identity/bvn/verify': {
      post: { tags: ['Identity Verification'], summary: 'Initiate BVN verification (NG users only)', responses: { '200': { description: 'OTP sent to BVN-registered phone' }, '403': { description: 'NG users only' } } },
    },
    '/identity/bvn/confirm': {
      post: { tags: ['Identity Verification'], summary: 'Confirm BVN OTP (NG users only)', responses: { '200': { description: 'BVN verified' } } },
    },
    '/identity/verify/webhook': {
      post: { tags: ['Identity Verification'], summary: 'Stripe Identity webhook (public)', security: [], responses: { '200': { description: 'Webhook received' } } },
    },

    // ── Legal ─────────────────────────────────────────────────────────────────
    '/legal/terms': {
      get: { tags: ['Legal'], summary: 'Terms of Service (public)', security: [], responses: { '200': { description: 'Terms of Service JSON' } } },
    },
    '/legal/privacy': {
      get: { tags: ['Legal'], summary: 'Privacy Policy (public)', security: [], responses: { '200': { description: 'Privacy Policy JSON' } } },
    },

    // ── Support ───────────────────────────────────────────────────────────────
    '/support': {
      get:  { tags: ['Support'], summary: 'List own support tickets', responses: { '200': { description: 'Tickets' } } },
      post: { tags: ['Support'], summary: 'Create support ticket', responses: { '201': { description: 'Ticket created' } } },
    },
    '/support/{id}': {
      get: { tags: ['Support'], summary: 'Get single ticket', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Ticket detail' } } },
      put: { tags: ['Support'], summary: 'Update ticket (user)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } },
    },

    // ── Administration ────────────────────────────────────────────────────────
    '/admin/dashboard': {
      get: { tags: ['Administration'], summary: 'Platform dashboard metrics (admin)', responses: { '200': { description: 'Dashboard metrics' } } },
    },
    '/admin/users': {
      get: { tags: ['Administration'], summary: 'List all users (admin, paginated, filterable)', responses: { '200': { description: 'Users list' } } },
    },
    '/admin/users/{id}': {
      get: { tags: ['Administration'], summary: 'Get full user detail (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'User detail' } } },
      delete: { tags: ['Administration'], summary: 'Soft delete user (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'User deactivated' } } },
    },
    '/admin/users/{id}/suspend': {
      put: { tags: ['Administration'], summary: 'Suspend user (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'User suspended' } } },
    },
    '/admin/users/{id}/reactivate': {
      put: { tags: ['Administration'], summary: 'Reactivate user (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'User reactivated' } } },
    },
    '/admin/groups': {
      get: { tags: ['Administration'], summary: 'List all groups (admin)', responses: { '200': { description: 'Groups' } } },
    },
    '/admin/groups/{id}': {
      get: { tags: ['Administration'], summary: 'Group detail (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Group detail' } } },
    },
    '/admin/groups/{id}/close': {
      put: { tags: ['Administration'], summary: 'Force close group (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Group closed' } } },
    },
    '/admin/subscriptions': {
      get: { tags: ['Administration'], summary: 'List all subscriptions (admin)', responses: { '200': { description: 'Subscriptions' } } },
    },
    '/admin/subscriptions/{id}/cancel': {
      put: { tags: ['Administration'], summary: 'Cancel subscription (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Cancelled' } } },
    },
    '/admin/support': {
      get: { tags: ['Administration'], summary: 'List all support tickets (admin)', responses: { '200': { description: 'Tickets' } } },
    },
    '/admin/support/{id}': {
      put: { tags: ['Administration'], summary: 'Update/respond to ticket (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } },
    },
    '/admin/support/{id}/close': {
      put: { tags: ['Administration'], summary: 'Close ticket (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Closed' } } },
    },
    '/admin/audit': {
      get: { tags: ['Administration'], summary: 'Audit logs (admin, read-only, paginated, filterable)', responses: { '200': { description: 'Audit logs' } } },
    },

    // ── Monitoring ────────────────────────────────────────────────────────────
    '/system/health': {
      get: { tags: ['Monitoring'], summary: 'System health check (public)', security: [], responses: { '200': { description: 'System healthy' }, '503': { description: 'System degraded' } } },
    },
    '/system/errors': {
      get: { tags: ['Monitoring'], summary: 'Recent system errors (admin)', responses: { '200': { description: 'Error log' } } },
    },
    '/system/jobs': {
      get: { tags: ['Monitoring'], summary: 'Scheduled job statuses (admin)', responses: { '200': { description: 'Job statuses' } } },
    },

    // ── Webhooks ──────────────────────────────────────────────────────────────
    '/webhooks/stripe': {
      post: { tags: ['Webhooks'], summary: 'Stripe payment webhook (public, raw body)', security: [], responses: { '200': { description: 'Received' } } },
    },
    '/webhooks/flutterwave': {
      post: { tags: ['Webhooks'], summary: 'Flutterwave payment webhook (public, raw body)', security: [], responses: { '200': { description: 'Received' } } },
    },
  },
};

export function registerSwagger(app: Express): void {
  app.get('/api/docs/spec', (_req, res) => res.json(spec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'PadiHub API Docs',
    customCss: '.swagger-ui .topbar { background-color: #1A1A2E; } .swagger-ui .topbar-wrapper img { content: none; } .swagger-ui .topbar-wrapper::before { content: "PadiHub API"; color: #2EAF6F; font-size: 20px; font-weight: bold; }',
  }));
}
