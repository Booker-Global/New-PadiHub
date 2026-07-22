/**
 * Auto-synced registry of publicly-crawlable routes. Consumed by the
 * /sitemap.xml handler in src/server/entry.ts.
 *
 * DO NOT add or remove paths by hand. Static paths are mirrored here from
 * src/routes.tsx automatically whenever that file is edited (any manual
 * path edit would be overwritten on the next routes.tsx change). For sync
 * to pick up a route, its `path` must be a literal string starting with "/";
 * template literals and identifier refs are skipped, and dynamic-param routes
 * like "/products/:id" are excluded.
 *
 * The only fields safe to hand-edit are the per-entry metadata below, after a
 * sync:
 * - `priority` (0.0–1.0): Home = 1.0, main sections = 0.8, deep pages = 0.5.
 * - `changefreq` and `lastmod`.
 */

export interface SeoRoute {
  path: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
  lastmod?: string;
}

export const seoRoutes: SeoRoute[] = [
  { path: "/", changefreq: "weekly", priority: 1.0 },
  { path: "/login", changefreq: "monthly", priority: 0.8 },
  { path: "/get-started", changefreq: "monthly", priority: 0.8 },
  { path: "/forgot-password", changefreq: "monthly", priority: 0.8 },
  { path: "/verify-email", changefreq: "monthly", priority: 0.8 },
  { path: "/onboarding", changefreq: "monthly", priority: 0.8 },
  { path: "/dashboard", changefreq: "monthly", priority: 0.8 },
  { path: "/savings-groups", changefreq: "monthly", priority: 0.8 },
  { path: "/trust", changefreq: "monthly", priority: 0.8 },
  { path: "/subscription", changefreq: "monthly", priority: 0.8 },
  { path: "/settings", changefreq: "monthly", priority: 0.8 },
  { path: "/leader-dashboard", changefreq: "monthly", priority: 0.8 },
  { path: "/about", changefreq: "monthly", priority: 0.8 },
  { path: "/how-it-works", changefreq: "monthly", priority: 0.8 },
  { path: "/features", changefreq: "monthly", priority: 0.8 },
  { path: "/pricing", changefreq: "monthly", priority: 0.8 },
  { path: "/trust-security", changefreq: "monthly", priority: 0.8 },
  { path: "/faq", changefreq: "monthly", priority: 0.8 },
  { path: "/contact", changefreq: "monthly", priority: 0.8 },
  { path: "/privacy", changefreq: "monthly", priority: 0.8 },
  { path: "/terms", changefreq: "monthly", priority: 0.8 },
  { path: "/reset-password", changefreq: "monthly", priority: 0.8 },
  { path: "/membership", changefreq: "monthly", priority: 0.8 },
  { path: "/subscription/confirm", changefreq: "monthly", priority: 0.5 },
  { path: "/subscription/success", changefreq: "monthly", priority: 0.5 },
  { path: "/subscription/billing", changefreq: "monthly", priority: 0.5 },
  { path: "/subscription/manage", changefreq: "monthly", priority: 0.5 },
  { path: "/subscription/renew", changefreq: "monthly", priority: 0.5 },
  { path: "/subscription/cancel", changefreq: "monthly", priority: 0.5 },
  { path: "/savings-groups/create", changefreq: "monthly", priority: 0.5 },
  { path: "/savings-groups/contribution-success", changefreq: "monthly", priority: 0.5 },
  { path: "/savings-groups/history", changefreq: "monthly", priority: 0.5 },
  { path: "/trust/history", changefreq: "monthly", priority: 0.5 },
  { path: "/notifications", changefreq: "monthly", priority: 0.8 },
  { path: "/notifications/settings", changefreq: "monthly", priority: 0.5 },
  { path: "/profile", changefreq: "monthly", priority: 0.8 },
  { path: "/profile/edit", changefreq: "monthly", priority: 0.5 },
  { path: "/leader", changefreq: "monthly", priority: 0.8 },
  { path: "/leader/members", changefreq: "monthly", priority: 0.5 },
  { path: "/leader/contributions", changefreq: "monthly", priority: 0.5 },
  { path: "/help", changefreq: "monthly", priority: 0.8 },
  { path: "/help/ticket", changefreq: "monthly", priority: 0.5 },
  { path: "/admin", changefreq: "monthly", priority: 0.8 },
];
