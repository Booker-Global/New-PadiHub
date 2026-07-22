import { StrictMode, Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
// MotionConfig lets us inject `initial: false` globally so every motion.*
// element in the SSR tree skips inline style injection — the only reliable
// way to prevent React hydration error #418 across all pages.
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

  // SSR_MOTION_CONFIG: initial=false suppresses inline style injection on every
  // motion.* element in the tree. Without this, Motion writes opacity/transform
  // inline styles during renderToString; the client then hydrates against those
  // styles and immediately animates away — React sees the diff and throws #418.
  // Using the public <MotionConfig> component (not the internal MotionConfigContext)
  // avoids importing framer-motion's CJS internals into the browser bundle.
  const html = renderToString(
    <StrictMode>
      <MotionConfig initial={false}>
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
