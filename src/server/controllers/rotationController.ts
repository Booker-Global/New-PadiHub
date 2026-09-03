import type { Request, Response, NextFunction } from 'express';
import { rotationService } from '../services/rotationService.js';
import { qsOpt, pp, ip } from '../lib/reqHelpers.js';

export const rotationController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = qsOpt(req.query.group_id);
      // Mirrors contributionController.list's getForGroup/getForMember split —
      // no group_id means "every rotation payout across all of my groups",
      // used by the cross-group Contributions & Payouts summary.
      const data = groupId
        ? await rotationService.getHistory(groupId)
        : await rotationService.getForUser(req.user!.userId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  getCurrent: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await rotationService.getCurrent(pp(req.params.id));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  getNext: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await rotationService.getNext(pp(req.params.id));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  getPrevious: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await rotationService.getPrevious(pp(req.params.id));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  advance: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await rotationService.advance(pp(req.params.id), req.user!.userId, ip(req.ip));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },
};
