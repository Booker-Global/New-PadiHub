/**
 * Type-safe helpers for Express request values.
 *
 * Express types req.params, req.query, and req.ip as broad union types
 * (string | string[] | ParsedQs etc.). These helpers normalise them to
 * plain strings so every controller stays concise and type-error-free.
 */

/** Normalise a query-string value to a plain string (empty string if absent). */
export function qs(val: unknown): string {
  if (Array.isArray(val)) return val.length > 0 ? String(val[0]) : '';
  if (typeof val === 'string') return val;
  return '';
}

/** Normalise a query-string value to a plain string or undefined. */
export function qsOpt(val: unknown): string | undefined {
  if (Array.isArray(val)) return val.length > 0 ? String(val[0]) : undefined;
  if (typeof val === 'string') return val;
  return undefined;
}

/** Normalise a route param (req.params.x) to a plain string. */
export function pp(val: unknown): string {
  if (Array.isArray(val)) return val.length > 0 ? String(val[0]) : '';
  if (typeof val === 'string') return val;
  return String(val ?? '');
}

/** Normalise req.ip to string | undefined (safe for service ipAddress? params). */
export function ip(val: unknown): string | undefined {
  if (Array.isArray(val)) return val.length > 0 ? String(val[0]) : undefined;
  if (typeof val === 'string') return val;
  return undefined;
}
