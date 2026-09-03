import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import AiroErrorBoundary from '../dev-tools/src/AiroErrorBoundary';
import App from './App';
import './styles/globals.css';

if (import.meta.env.MODE === 'development') {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
}

const providers = (
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Root element not found');

// DiagnosticErrorOverlay has been removed. It was a temporary diagnostic
// tool that wrapped hydrateRoot in a class-component ErrorBoundary. Its
// componentDidCatch fired during hydration errors, triggering a re-render
// mid-hydration and creating a cascade that made #418 self-perpetuating.
// Root-level error boundary: AiroErrorBoundary in dev only (it touches
// window APIs that are fine post-hydration but must not wrap hydrateRoot
// itself in a way that interferes with the hydration pass).
const tree = (
  <StrictMode>
    {import.meta.env.MODE === 'development' ? (
      <AiroErrorBoundary>{providers}</AiroErrorBoundary>
    ) : (
      providers
    )}
  </StrictMode>
);

// window.__SSR_OK__ is set to true by the server only on a successful
// renderToString path (see src/server/entry.ts). It is the authoritative
// signal that the server completed a full render and the client should
// hydrate rather than mount fresh. The data-ssr attribute approach was
// unreliable because anything that alters the DOM in transit (CDN edge
// workers, browser extensions, hosting injections) can make #app appear
// to have children even when the server never rendered into it.
// Casting to any is intentional — __SSR_OK__ is not in the Window type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((window as any).__SSR_OK__ === true) {
  hydrateRoot(rootElement, tree);
} else {
  createRoot(rootElement).render(tree);
}

// Clear the one-shot chunk-reload guard (see RouteErrorBoundary.tsx) once
// the app has mounted successfully, so a *later* stale-chunk error in the
// same browser tab (e.g. after another deploy happens mid-session) can
// still trigger one more automatic recovery reload instead of being
// silently suppressed for the rest of the session.
try {
  window.sessionStorage?.removeItem('padihub_chunk_reload_attempted');
} catch {
  // sessionStorage can throw in private-browsing/locked-down contexts; safe to ignore.
}
