// Shared helper for turning an API error response into a clear, human
// message instead of a generic banner.
//
// The server's `validate` middleware (src/server/middleware/validate.ts)
// responds to bad input with `{ success: false, message: 'Validation failed.',
// errors: { fieldName: ['reason', ...] } }`. Showing just `message` to the
// user produces an unhelpful "Validation failed." banner with no indication
// of what to fix. Prefer the first concrete field error when present, falling
// back to the server's message, and finally to a caller-supplied default.
export function getApiErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const body = json as { message?: string; errors?: Record<string, unknown> };

  if (body.errors && typeof body.errors === 'object') {
    for (const value of Object.values(body.errors)) {
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') {
        return value[0];
      }
    }
  }

  return typeof body.message === 'string' && body.message ? body.message : fallback;
}
