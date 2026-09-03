import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService.js';
import { validate } from '../middleware/validate.js';
import { ip } from '../lib/reqHelpers.js';

const registerSchema = z.object({
  first_name:   z.string().min(1).max(100),
  last_name:    z.string().min(1).max(100),
  display_name: z.string().max(100).optional(),
  email:        z.string().email(),
  password:     z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain number'),
  phone_number: z.string().optional(),
  country:      z.enum(['GB', 'NG']),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const forgotSchema        = z.object({ email: z.string().email() });
const verifySchema        = z.object({ token: z.string().uuid() });
const resendVerifySchema  = z.object({ email: z.string().email() });
const resetSchema   = z.object({ token: z.string().uuid(), password: z.string().min(8) });
const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password:     z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain number'),
});

export const authController = {
  register: [
    validate(registerSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.register(req.body, ip(req.ip));
        res.status(201).json({ success: true, data: { userId: result.userId } });
      } catch (e) { next(e); }
    },
  ],

  login: [
    validate(loginSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.login(req.body.email, req.body.password, ip(req.ip));
        res.json({ success: true, data: result });
      } catch (e) { next(e); }
    },
  ],

  logout: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // JWT is stateless; client discards token.
      res.json({ success: true, message: 'Logged out successfully.' });
    } catch (e) { next(e); }
  },

  verifyEmail: [
    validate(verifySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.verifyEmail(req.body.token, ip(req.ip));
        // Return the JWT + user so the frontend can establish a session immediately
        // and redirect straight to onboarding without a separate login step.
        res.json({ success: true, message: 'Email verified successfully.', data: result });
      } catch (e) { next(e); }
    },
  ],

  resendVerification: [
    validate(resendVerifySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.resendVerificationEmail(req.body.email, ip(req.ip));
        res.json({ success: true, message: 'If that email exists and is unverified, a new link has been sent.' });
      } catch (e) { next(e); }
    },
  ],

  forgotPassword: [
    validate(forgotSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.forgotPassword(req.body.email, ip(req.ip));
        res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
      } catch (e) { next(e); }
    },
  ],

  resetPassword: [
    validate(resetSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.resetPassword(req.body.token, req.body.password, ip(req.ip));
        res.json({ success: true, message: 'Password reset successfully.' });
      } catch (e) { next(e); }
    },
  ],

  getMe: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getMe(req.user!.userId);
      res.json({ success: true, data: user });
    } catch (e) { next(e); }
  },

  changePassword: [
    validate(changePasswordSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.changePassword(
          req.user!.userId,
          req.body.current_password,
          req.body.new_password,
          ip(req.ip),
        );
        res.json({ success: true, message: 'Password changed successfully.' });
      } catch (e) { next(e); }
    },
  ],

  refresh: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.refresh(req.user!.userId);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },
};
