import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { groupService } from '../services/groupService.js';
import { validate } from '../middleware/validate.js';
import { qsOpt, pp, ip } from '../lib/reqHelpers.js';

const createSchema = z.object({
  name:                   z.string().min(2).max(200),
  description:            z.string().max(1000).optional(),
  country:                z.enum(['GB', 'NG']),
  currency:               z.enum(['GBP', 'NGN']),
  contribution_amount:    z.string().regex(/^\d+(\.\d{1,2})?$/),
  contribution_frequency: z.enum(['weekly', 'monthly']),
  maximum_members:        z.number().int().min(2).max(50),
  rotation_method:        z.enum(['manual', 'random']),
  strike_threshold:       z.number().int().min(1).optional(),
  suspension_threshold:   z.number().int().min(1).optional(),
  voting_threshold:       z.number().int().min(51).max(100).optional(),
  allow_payout_swaps:     z.boolean().optional(),
});

const updateSchema = createSchema.partial().omit({
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

  getOne: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await groupService.getById(pp(req.params.id));
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
