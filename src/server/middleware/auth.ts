import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { JWT_SECRET } from '../lib/constants.js';
import { AppError } from './errorHandler.js';

export interface JwtPayload {
  userId: string;
  email:  string;
  role:   string;
  iat?:   number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required.', 401, 'UNAUTHENTICATED'));
  }
  const token = header.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET()) as unknown as JwtPayload;
  } catch {
    next(new AppError('Invalid or expired token.', 401, 'INVALID_TOKEN'));
    return;
  }

  try {
    const userRows = await db.select({
      password_changed_at: schema.users.password_changed_at,
      account_status:      schema.users.account_status,
      active:              schema.users.active,
    }).from(schema.users).where(eq(schema.users.id, payload.userId)).limit(1);
    const user = userRows[0];
    if (!user || !user.active || user.account_status === 'deactivated') {
      throw new AppError('Invalid or expired token.', 401, 'INVALID_TOKEN');
    }
    if (user.account_status === 'suspended') {
      throw new AppError('Your account has been suspended.', 403, 'ACCOUNT_SUSPENDED');
    }
    if (user.password_changed_at && payload.iat && payload.iat < Math.floor(user.password_changed_at.getTime() / 1000)) {
      throw new AppError('Your session has expired. Please sign in again.', 401, 'INVALID_TOKEN');
    }
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Authentication required.', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions.', 403, 'FORBIDDEN'));
    }
    next();
  };
}

/**
 * Best-effort auth for public endpoints that behave differently for signed-in
 * visitors (e.g. group search, which must use the caller's own profile
 * country rather than a client-supplied query param once they're logged in).
 * Never rejects the request — an absent/invalid token just leaves
 * `req.user` unset, same as an anonymous visitor.
 */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET()) as unknown as JwtPayload;
    const userRows = await db.select({
      password_changed_at: schema.users.password_changed_at,
      account_status:      schema.users.account_status,
      active:              schema.users.active,
    }).from(schema.users).where(eq(schema.users.id, payload.userId)).limit(1);
    const user = userRows[0];
    const tokenStillValid = user && user.active && user.account_status !== 'deactivated'
      && (!user.password_changed_at || !payload.iat || payload.iat >= Math.floor(user.password_changed_at.getTime() / 1000));
    if (tokenStillValid) req.user = payload;
  } catch {
    // Ignore — treat as anonymous.
  }
  next();
}
