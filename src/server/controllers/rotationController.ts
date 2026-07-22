import type { Request, Response, NextFunction } from 'express';
import { rotationService } from '../services/rotationService.js';
import { qs, pp, ip } from '../lib/reqHelpers.js';

export const rotationController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = qs(req.query.group_id);
      const data = await rotationService.getHistory(groupId);
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
