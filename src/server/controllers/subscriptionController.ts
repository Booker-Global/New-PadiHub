import type { Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../services/subscriptionService.js';

export const subscriptionController = {
  get: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await subscriptionService.getSubscriptionStatus(req.user!.userId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  cancel: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await subscriptionService.cancelSubscription(req.user!.userId);
      res.json({ success: true, message: 'Subscription cancelled.' });
    } catch (e) { next(e); }
  },

  reactivate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await subscriptionService.reactivateSubscription(req.user!.userId);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },
};
