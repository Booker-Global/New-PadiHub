import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { groupService } from '../services/groupService.js';
import { validate } from '../middleware/validate.js';
import { qsOpt, pp, ip } from '../lib/reqHelpers.js';
import { payoutDayBounds } from '../lib/payoutSchedule.js';
import { GROUP_MAX_MEMBERS, GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH } from '../lib/constants.js';

const baseGroupSchema = z.object({
  name:                   z.string().min(2).max(200),
  description:            z.string().max(1000).optional(),
  country:                z.enum(['GB', 'NG']),
  currency:               z.enum(['GBP', 'NGN']),
  contribution_amount:    z.string().regex(/^\d+(\.\d{1,2})?$/),
  contribution_frequency: z.enum(['daily', 'weekly', 'monthly']),
  payout_day:             z.number().int().min(0).max(31).optional(),
  // A rotating savings group needs at least GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH
  // members to ever launch, so a smaller group size can never be valid.
  maximum_members:        z.number().int().min(GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH).max(GROUP_MAX_MEMBERS),
  min_trust_score:        z.number().int().min(0).max(100).optional(),
  rotation_method:        z.enum(['trust_score', 'random']).transform(value => value === 'trust_score' ? 'manual' : value),
  strike_threshold:       z.number().int().min(1).optional(),
  suspension_threshold:   z.number().int().min(1).optional(),
  voting_threshold:       z.number().int().min(51).max(100).optional(),
  allow_payout_swaps:     z.boolean().optional(),
  // Group lifecycle length, chosen once at creation (see schema.ts
  // savingsGroups.group_duration_type doc comment).
  group_duration_type:      z.enum(['fixed', 'indefinite']).optional().default('indefinite'),
  group_duration_rotations: z.number().int().min(1).max(60).optional(),
});

function refinePayoutDay(data: { contribution_frequency: 'daily' | 'weekly' | 'monthly'; payout_day?: number }, ctx: z.RefinementCtx) {
  const bounds = payoutDayBounds(data.contribution_frequency);
  if (bounds) {
    if (data.payout_day === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payout_day'],
        message: data.contribution_frequency === 'weekly'
          ? 'payout_day is required for weekly groups (0=Sunday..6=Saturday).'
          : 'payout_day is required for monthly groups (1-31).',
      });
    } else if (data.payout_day < bounds.min || data.payout_day > bounds.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payout_day'],
        message: `payout_day must be between ${bounds.min} and ${bounds.max} for ${data.contribution_frequency} groups.`,
      });
    }
  }
}

function refineGroupDuration(data: { group_duration_type?: 'fixed' | 'indefinite'; group_duration_rotations?: number }, ctx: z.RefinementCtx) {
  if (data.group_duration_type === 'fixed' && !data.group_duration_rotations) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['group_duration_rotations'],
      message: 'group_duration_rotations is required (1-60) when group_duration_type is "fixed".',
    });
  }
}

const createSchema = baseGroupSchema.superRefine(refinePayoutDay).superRefine(refineGroupDuration);

const updateSchema = baseGroupSchema.partial().omit({
  country: true, currency: true,
  contribution_amount: true, contribution_frequency: true,
  // Lifecycle length is a one-time choice made at creation — never editable
  // afterwards (see groupService.scheduleClosure for the one allowed
  // post-creation change: an indefinite group's Owner scheduling closure).
  group_duration_type: true, group_duration_rotations: true,
});

// A single invite (`email`) or a batch of them (`emails`) — the create-group
// wizard collects a comma-separated list, so both shapes are accepted.
const inviteSchema = z.object({
  email:  z.string().email().optional(),
  emails: z.array(z.string().email()).max(50).optional(),
});

export const groupController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await groupService.list({ status: qsOpt(req.query.status) });
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  /**
   * GET /api/groups/search — group discovery, always scoped to a single
   * country so members only see groups they're actually eligible to join
   * (per requirement: "Users should only be able to see groups in their
   * location (UK or Nigeria) when searching"). Signed-in callers (a valid
   * bearer token — see optionalAuthenticate) are scoped to their own
   * server-verified profile country, ignoring any client-supplied
   * `country` param, since group membership itself is enforced by profile
   * country and search results must match. Anonymous visitors fall back to
   * the `country` param the frontend resolves from IP (see /api/geo).
   */
  search: async (req: Request, res: Response, next: NextFunction) => {
    try {
      let country: 'GB' | 'NG';
      if (req.user) {
        const profileCountry = await groupService.getUserCountry(req.user.userId);
        country = profileCountry === 'NG' ? 'NG' : 'GB';
      } else {
        const countryParam = (qsOpt(req.query.country) ?? 'GB').toUpperCase();
        country = countryParam === 'NG' ? 'NG' : 'GB';
      }
      const data = await groupService.search(country, qsOpt(req.query.query));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  getOne: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await groupService.getById(pp(req.params.id));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  /**
   * GET /api/groups/leader-dashboard — the "Manage Group" dashboard. Always
   * scoped to the authenticated user's own led groups; returns
   * `isLeader: false` (with empty stats) if they don't lead any group.
   */
  getLeaderDashboard: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await groupService.getLeaderDashboard(req.user!.userId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  create: [
    validate(createSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await groupService.create(
          { ...req.body, leader_id: req.user!.userId },
          ip(req.ip),
        );
        res.status(201).json({ success: true, data });
      } catch (e) { next(e); }
    },
  ],

  update: [
    validate(updateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await groupService.update(
          pp(req.params.id),
          req.user!.userId,
          req.body,
          ip(req.ip),
        );
        res.json({ success: true, data });
      } catch (e) { next(e); }
    },
  ],

  close: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await groupService.close(pp(req.params.id), req.user!.userId, ip(req.ip));
      res.json({ success: true, message: 'Group closed.' });
    } catch (e) { next(e); }
  },

  /**
   * POST /api/groups/:id/schedule-closure — Owner's "Close Group" button for
   * an *indefinite* group only (fixed-length groups already have a defined
   * end and can't be closed early). Never ends the in-progress rotation
   * early — rotationService.advance() performs the actual close once the
   * current rotation finishes.
   */
  scheduleClosure: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await groupService.scheduleClosure(pp(req.params.id), req.user!.userId, ip(req.ip));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  activate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await groupService.activateGroup(pp(req.params.id), req.user!.userId, ip(req.ip));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  createInvitation: [
    validate(inviteSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { email?: string; emails?: string[] };
        const emails = [...(body.emails ?? []), ...(body.email ? [body.email] : [])];

        if (!emails.length) {
          const data = await groupService.createInvitation(pp(req.params.id), req.user!.userId);
          res.status(201).json({ success: true, data });
          return;
        }

        const data = await groupService.createInvitations(pp(req.params.id), req.user!.userId, emails);
        res.status(201).json({ success: true, data });
      } catch (e) { next(e); }
    },
  ],
};
