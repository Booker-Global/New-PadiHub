// Session helpers — single source of truth for how PadiHub stores and
// validates the logged-in user's session on the client.
//
// The backend issues a stateless JWT (see src/server/services/authService.ts)
// with a `JWT_EXPIRES_IN` claim baked in. The client stores that token
// (plus a few display fields) in both localStorage ('padihub_user', so the
// session survives closing the tab) and sessionStorage ('padihub_session').
// Because localStorage never expires on its own, we must decode the JWT's
// `exp` claim ourselves and treat an expired token as "logged out" — otherwise
// the UI keeps showing a signed-in navbar/dashboard indefinitely with no
// re-authentication, even long after the token would be rejected by the API.

export interface SessionData {
  token?: string;
  name?: string;
  trust?: number;
  email?: string;
  userId?: string;
  role?: string;
}

const STORAGE_KEYS = ['padihub_user', 'padihub_session'] as const;

/** Reads the stored session (localStorage first, falling back to sessionStorage). */
export function readStoredSession(): SessionData | null {
  try {
    const raw = localStorage.getItem('padihub_user') || sessionStorage.getItem('padihub_session');
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

/**
 * Decodes a JWT's payload without verifying the signature (verification is
 * the server's job) purely so the client can read the `exp` claim.
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** True if the stored token is missing an `exp` claim we can trust, or is expired. */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeJwtPayload(token);
  if (!decoded?.exp) return false; // no claim to check against — don't force logout
  return Date.now() >= decoded.exp * 1000;
}

/** Clears the session from both storages. */
export function clearStoredSession(): void {
  for (const key of STORAGE_KEYS) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    try { sessionStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
}

/**
 * Returns the current session, automatically clearing and returning null if
 * the stored token has expired.
 */
export function getValidSession(): SessionData | null {
  const session = readStoredSession();
  if (!session) return null;
  if (session.token && isTokenExpired(session.token)) {
    clearStoredSession();
    return null;
  }
  return session;
}

/**
 * Signs the user out: best-effort call to the stateless logout endpoint
 * (mainly for audit logging), then always clears local session state.
 */
export async function logout(): Promise<void> {
  const session = readStoredSession();
  if (session?.token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token },
      });
    } catch {
      // Logout is client-authoritative — network failure shouldn't block it.
    }
  }
  clearStoredSession();
}
