import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { membershipService } from '../services/membershipService.js';
import { validate } from '../middleware/validate.js';
import { qs, pp, ip } from '../lib/reqHelpers.js';

const joinSchema = z.object({
  group_id:     z.string().uuid(),
  invite_token: z.string().uuid().optional(),
});

const removeSchema = z.object({
  member_id: z.string().uuid(),
  group_id:  z.string().uuid(),
});

export const membershipController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = qs(req.query.group_id);
      const data = groupId
        ? await membershipService.getForGroup(groupId)
        : await membershipService.getForUser(req.user!.userId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  join: [
    validate(joinSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await membershipService.join(
          req.user!.userId,
          req.body.group_id,
          req.body.invite_token,
          ip(req.ip),
        );
        res.status(201).json({ success: true, message: data.message, data });
      } catch (e) { next(e); }
    },
  ],

  leave: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await membershipService.leave(req.user!.userId, pp(req.params.id), ip(req.ip));
      res.json({ success: true, message: 'Left group successfully.' });
    } catch (e) { next(e); }
  },

  /** POST /api/memberships/:id/approve — group leader approves a pending join request */
  approve: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await membershipService.approveJoinRequest(req.user!.userId, pp(req.params.id), ip(req.ip));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  /** POST /api/memberships/:id/reject — group leader rejects a pending join request */
  reject: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await membershipService.rejectJoinRequest(req.user!.userId, pp(req.params.id), ip(req.ip));
      res.json({ success: true, message: 'Join request rejected.' });
    } catch (e) { next(e); }
  },

  remove: [
    validate(removeSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await membershipService.remove(
          req.user!.userId,
          req.body.member_id,
          req.body.group_id,
          ip(req.ip),
        );
        res.json({ success: true, message: 'Member removed.' });
      } catch (e) { next(e); }
    },
  ],
};
