import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { userService } from '../services/userService.js';
import { notificationService } from '../services/notificationService.js';
import { getOnboardingProgress } from '../services/paymentEligibilityService.js';
import { validate } from '../middleware/validate.js';
import { qs, ip } from '../lib/reqHelpers.js';

const updateProfileSchema = z.object({
  display_name:             z.string().max(100).optional(),
  phone_number:             z.string().optional(),
  notification_preferences: z.record(z.unknown()).optional(),
});

export const userController = {
  getProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await userService.getProfile(req.user!.userId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  getStats: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await userService.getStats(req.user!.userId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  /**
   * GET /api/users/onboarding-status — the member's progress through the
   * required onboarding path (confirm email → verify identity → choose plan
   * → payment card → payout details), with a dashboard link for each
   * outstanding step. Drives the dashboard's profile-completion card.
   */
  getOnboardingStatus: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getOnboardingProgress(req.user!.userId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  getTrustHistory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(100, parseInt(qs(req.query.limit) || '20', 10));
      const data = await userService.getTrustHistory(req.user!.userId, limit);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  updateProfile: [
    validate(updateProfileSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await userService.updateProfile(req.user!.userId, req.body, ip(req.ip));
        res.json({ success: true, data });
      } catch (e) { next(e); }
    },
  ],

  deleteProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.deleteAccount(req.user!.userId, ip(req.ip));
      res.json({ success: true, message: 'Your account has been deleted. A confirmation email has been sent.' });
    } catch (e) { next(e); }
  },

  getNotifications: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const unreadOnly = qs(req.query.unread) === 'true';
      const data = await notificationService.getForUser(req.user!.userId, unreadOnly);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  updatePreferences: [
    validate(z.object({ preferences: z.record(z.unknown()) })),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await userService.updatePreferences(req.user!.userId, req.body.preferences);
        res.json({ success: true, message: 'Preferences updated.' });
      } catch (e) { next(e); }
    },
  ],
};
