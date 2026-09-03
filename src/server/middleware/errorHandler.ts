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

/**
 * Serialise an error together with its full `.cause` chain. Libraries like
 * drizzle-orm wrap the real driver error (e.g. a mysql2 error with its own
 * `code`/`errno`/`sqlMessage`/`sqlState`) inside a generic wrapper error
 * (e.g. "Failed query: ...") and only preserve the original on `.cause` —
 * logging `err.stack` alone (as this handler used to) shows just the
 * wrapper's generic message, hiding the actual reason a query failed. This
 * walks the whole chain so every unexpected error is fully debuggable from
 * server logs alone.
 */
function serializeErrorChain(err: unknown, depth = 0): unknown {
  if (!(err instanceof Error) || depth > 5) return err;
  const { code, errno, sqlMessage, sqlState } = err as Error & {
    code?: string; errno?: number; sqlMessage?: string; sqlState?: string;
  };
  const serialized: Record<string, unknown> = { message: err.message, stack: err.stack };
  if (code !== undefined) serialized.code = code;
  if (errno !== undefined) serialized.errno = errno;
  if (sqlMessage !== undefined) serialized.sqlMessage = sqlMessage;
  if (sqlState !== undefined) serialized.sqlState = sqlState;
  if (err.cause !== undefined) serialized.cause = serializeErrorChain(err.cause, depth + 1);
  return serialized;
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

  // Log the full error (including its full `.cause` chain) with request
  // context for easier debugging
  console.error('[PadiHub Error]', {
    method: req.method,
    path:   req.path,
    error:  serializeErrorChain(err),
  });
  return res.status(500).json({
    success: false,
    message: 'An unexpected error occurred.',
  });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: 'Route not found.' });
}
