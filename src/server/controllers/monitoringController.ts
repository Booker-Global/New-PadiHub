import type { Request, Response, NextFunction } from 'express';
import { monitoringService } from '../services/monitoringService.js';

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

  jobs: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await monitoringService.getJobStatuses();
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },
};
