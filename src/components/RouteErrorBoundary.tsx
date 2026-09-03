import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

const CHUNK_LOAD_ERROR_PATTERN = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to fetch a dynamically imported module/i;
const RELOAD_FLAG_KEY = 'padihub_chunk_reload_attempted';

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return CHUNK_LOAD_ERROR_PATTERN.test(message);
}

/**
 * Root route error boundary (React Router's `errorElement`). Without this,
 * ANY error thrown while rendering a lazily-loaded page — most commonly a
 * stale/mismatched JS chunk after a new deploy (the browser still has an
 * old index.html referencing a chunk hash that no longer exists on the
 * server) — bubbled all the way up to React Router's default error UI
 * ("Unexpected Application Error! Failed to fetch dynamically imported
 * module..."), which affected every lazily-loaded route (Notifications,
 * Payments, Manage Membership, Subscription & Billing, Billing History,
 * Settings, Edit Profile, etc). A stale chunk is recoverable with a single
 * hard reload (fetches a fresh index.html + current chunk manifest), so we
 * do that automatically instead of showing a dead end — guarded by a
 * sessionStorage flag so a genuinely broken chunk doesn't reload forever.
 */
export default function RouteErrorBoundary() {
  const error = useRouteError();
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    if (!chunkError || typeof window === 'undefined') return;
    const alreadyTried = window.sessionStorage?.getItem(RELOAD_FLAG_KEY);
    if (alreadyTried) return;
    window.sessionStorage?.setItem(RELOAD_FLAG_KEY, '1');
    window.location.reload();
  }, [chunkError]);

  if (chunkError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 px-6 text-center">
        <p className="text-lg font-bold text-gray-900">Loading the latest version…</p>
        <p className="text-sm text-gray-500">This page needs a quick refresh to pick up the newest update.</p>
      </div>
    );
  }

  const status = isRouteErrorResponse(error) ? error.status : undefined;
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 px-6 text-center">
      <p className="text-lg font-bold text-gray-900">{status === 404 ? 'Page not found' : 'Something went wrong'}</p>
      <p className="text-sm text-gray-500 max-w-md">{status === 404 ? "The page you're looking for doesn't exist." : message}</p>
      <button
        type="button"
        onClick={() => window.location.assign('/')}
        className="mt-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
        style={{ background: '#2EAF6F' }}
      >
        Go to Dashboard
      </button>
    </div>
  );
}
