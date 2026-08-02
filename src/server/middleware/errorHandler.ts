import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code:    err.code,
    });
  }

  // Log the full error with request context for easier debugging
  console.error('[PadiHub Error]', {
    method: req.method,
    path:   req.path,
    error:  err.stack || err.message || err,
  });
  return res.status(500).json({
    success: false,
    message: 'An unexpected error occurred.',
  });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: 'Route not found.' });
}
