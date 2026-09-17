import type { Request, Response, NextFunction } from 'express';
import { monitoringService } from '../services/monitoringService.js';
import { pp } from '../lib/reqHelpers.js';

export const monitoringController = {
  health: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await monitoringService.getHealthStatus();
      res.status(status.status === 'ok' ? 200 : 503).json({ success: true, data: status });
    } catch (e) { next(e); }
  },

  errors: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await monitoringService.getRecentErrors(24);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  // Lets an admin dismiss a system_errors row (e.g. STRIPE_PAYOUT_TRANSFER_FAILED)
  // once investigated/fixed, so it stops cluttering the /api/system/errors list
  // and the dashboard's "Errors (last 24h)" unresolved count.
  resolveError: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await monitoringService.resolveError(pp(req.params.id));
      res.json({ success: true, data: null });
    } catch (e) { next(e); }
  },

  jobs: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await monitoringService.getJobStatuses();
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },
};
