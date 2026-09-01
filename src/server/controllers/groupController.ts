import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { groupService } from '../services/groupService.js';
import { validate } from '../middleware/validate.js';
import { qsOpt, pp, ip } from '../lib/reqHelpers.js';
import { payoutDayBounds } from '../lib/payoutSchedule.js';

const baseGroupSchema = z.object({
  name:                   z.string().min(2).max(200),
  description:            z.string().max(1000).optional(),
  country:                z.enum(['GB', 'NG']),
  currency:               z.enum(['GBP', 'NGN']),
  contribution_amount:    z.string().regex(/^\d+(\.\d{1,2})?$/),
  contribution_frequency: z.enum(['daily', 'weekly', 'monthly']),
  payout_day:             z.number().int().min(0).max(31).optional(),
  maximum_members:        z.number().int().min(2).max(50),
  min_trust_score:        z.number().int().min(0).max(100).optional(),
  rotation_method:        z.enum(['manual', 'random']),
  strike_threshold:       z.number().int().min(1).optional(),
  suspension_threshold:   z.number().int().min(1).optional(),
  voting_threshold:       z.number().int().min(51).max(100).optional(),
  allow_payout_swaps:     z.boolean().optional(),
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

const createSchema = baseGroupSchema.superRefine(refinePayoutDay);

const updateSchema = baseGroupSchema.partial().omit({
  country: true, currency: true,
  contribution_amount: true, contribution_frequency: true,
});

const inviteSchema = z.object({ email: z.string().email().optional() });

export const groupController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await groupService.list({ status: qsOpt(req.query.status) });
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  /**
   * GET /api/groups/search — public (no auth) group discovery, always scoped
   * to a single country so members only see groups they're eligible to join
   * (per requirement: "Users should only be able to see groups in their
   * location (UK or Nigeria) when searching"). The frontend resolves the
   * country from the visitor's IP (see /api/geo) or, if logged in, from
   * their profile country.
   */
  search: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const countryParam = (qsOpt(req.query.country) ?? 'GB').toUpperCase();
      const country = countryParam === 'NG' ? 'NG' : 'GB';
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

  createInvitation: [
    validate(inviteSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await groupService.createInvitation(
          pp(req.params.id),
          req.user!.userId,
          req.body.email,
        );
        res.status(201).json({ success: true, data });
      } catch (e) { next(e); }
    },
  ],
};
