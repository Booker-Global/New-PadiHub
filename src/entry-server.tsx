import { StrictMode, Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
// NOTE: MotionConfig has no `initial` prop — it cannot globally default
// `initial={false}` for descendant motion.* elements (confirmed against the
// installed framer-motion types; passing it is a type error and has no
// runtime effect on SSR output). The only mechanism that actually suppresses
// inline "hidden" styles during renderToString — and therefore the only
// real defence against React hydration error #418 — is passing
// `initial={false}` directly on each motion component, which is exactly
// what MotionDiv/MotionSection/MotionCircle/MotionProgressBar in
// src/lib/motion-safe.tsx already do by default. Every animated element in
// this app renders through those wrappers (no raw motion.* usage exists
// outside motion-safe.tsx), so MotionConfig here is kept only as a shared
// context provider for any future direct motion.* usage — not as an
// initial-state override.
// Import from 'motion/react' (NOT 'framer-motion') so Vite's optimizeDeps
// pre-bundles it as ESM and the CJS filter-props.mjs chunk never reaches
// the browser bundle.
import { MotionConfig } from 'motion/react';
import type { HelmetServerState } from '@dr.pogodin/react-helmet';
import {
  Outlet,
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
  type RouteObject,
} from 'react-router-dom';

import RootLayout from './layouts/RootLayout';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import Spinner from './components/Spinner';
import { routes } from './routes';

export interface RenderResult {
  html: string;
  head: string;
  status: number;
  redirect?: string;
}

const SpinnerFallback = () => (
  <div className="flex justify-center py-8 h-screen items-center">
    <Spinner />
  </div>
);

// Mirrors the layout wrapping in App.tsx so client and server render the same
// tree. Kept separate from the client `router` in App.tsx because
// createBrowserRouter touches `window` at module load and must never be
// evaluated in the SSR bundle.
const routeTree: RouteObject[] = [
  {
    element: (
      <Suspense fallback={<SpinnerFallback />}>
        <RootLayout>
          <Outlet />
        </RootLayout>
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
    children: routes,
  },
];

const handler = createStaticHandler(routeTree);

export async function render(url: string): Promise<RenderResult> {
  // createStaticHandler works off a WHATWG Request. We only need the pathname +
  // search; scheme/host don't affect routing. Using a stable sentinel host
  // avoids env-dependent URL parsing.
  const context = await handler.query(new Request(`http://ssr${url}`));

  // A loader/action that throws a Response (or calls redirect()) surfaces here
  // as a Response instead of a StaticHandlerContext. Forward the redirect.
  if (context instanceof Response) {
    return {
      html: '',
      head: '',
      status: context.status,
      redirect: context.headers.get('Location') ?? undefined,
    };
  }

  const router = createStaticRouter(routeTree, context);
  const helmetContext: { helmet?: HelmetServerState } = {};

  // SSR_MOTION_CONFIG: MotionConfig has no `initial` prop to suppress
  // inline style injection tree-wide — that protection comes from every
  // animated element rendering through MotionDiv/MotionSection/etc.
  // (src/lib/motion-safe.tsx), which pass `initial={false}` directly and
  // are what actually prevent React hydration error #418. MotionConfig is
  // kept here only as the shared context provider for any future direct
  // motion.* usage. Using the public <MotionConfig> component (not the
  // internal MotionConfigContext) avoids importing framer-motion's CJS
  // internals into the browser bundle.
  const html = renderToString(
    <StrictMode>
      <MotionConfig>
        <HelmetProvider context={helmetContext}>
          <StaticRouterProvider router={router} context={context} />
        </HelmetProvider>
      </MotionConfig>
    </StrictMode>
  );

  const h = helmetContext.helmet;
  const head = h
    ? [
        h.title?.toString() ?? '',
        h.meta?.toString() ?? '',
        h.link?.toString() ?? '',
        h.script?.toString() ?? '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  // Prepend the SSR success flag into the <head> output. The platform's
  // renderSsrDocument injects head via <!--app-head-->, which is inside
  // <head> — completely outside the React hydration boundary. The script
  // runs synchronously before main.tsx, setting window.__SSR_OK__ = true
  // only when renderToString completed successfully. main.tsx reads this
  // flag to decide between hydrateRoot (server rendered) and createRoot
  // (fallback / error path). The flag is absent from the fallback shell
  // the platform serves when SSR fails, so createRoot is always used then.
  const ssrFlag = '<script>window.__SSR_OK__=true</script>';
  return { html, head: ssrFlag + '\n' + head, status: context.statusCode ?? 200 };
}
