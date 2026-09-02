import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { subscriptionService } from '../services/subscriptionService.js';
import { validate } from '../middleware/validate.js';

const planSchema = z.object({
  tier: z.enum(['basic', 'premium']),
});

export const subscriptionController = {
  get: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await subscriptionService.getSubscriptionStatus(req.user!.userId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  /** POST /api/subscriptions/select-plan — onboarding: choose Basic or Premium */
  selectPlan: [
    validate(planSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await subscriptionService.selectPlan(req.user!.userId, req.body.tier);
        res.json({ success: true, data });
      } catch (e) { next(e); }
    },
  ],

  /** POST /api/subscriptions/switch-plan — change tier after onboarding */
  switchPlan: [
    validate(planSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await subscriptionService.switchPlan(req.user!.userId, req.body.tier);
        res.json({ success: true, data });
      } catch (e) { next(e); }
    },
  ],

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
