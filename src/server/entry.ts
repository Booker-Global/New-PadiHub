import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync } from "node:fs";

// <api-imports>
import geo_get_0 from "./api/geo/GET";
import health_get_1 from "./api/health/GET";
// </api-imports>

// PadiHub backend imports
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authController } from './controllers/authController.js';
import { userController } from './controllers/userController.js';
import { groupController } from './controllers/groupController.js';
import { membershipController } from './controllers/membershipController.js';
import { contributionController } from './controllers/contributionController.js';
import { rotationController } from './controllers/rotationController.js';
import { voteController } from './controllers/voteController.js';
import { notificationController } from './controllers/notificationController.js';
import { subscriptionController } from './controllers/subscriptionController.js';
import { supportController } from './controllers/supportController.js';
import { adminController } from './controllers/adminController.js';
import { paymentController } from './controllers/paymentController.js';
import { stripeWebhookHandler } from './controllers/webhookStripeController.js';
import { flutterwaveWebhookHandler } from './controllers/webhookFlutterwaveController.js';
import {
  startStripeIdentity,
  stripeIdentityWebhook,
  initiateBvn,
  confirmBvn,
  getIdentityStatus,
} from './controllers/identityController.js';
import { legalController } from './controllers/legalController.js';
import { monitoringController } from './controllers/monitoringController.js';
import { registerSwagger } from './swagger.js';
import { seoRoutes } from "../lib/seo-routes";
import { isSystemHost } from "./seo-host";

function normalizeCommerceApiBaseUrlEnv() {
	if (process.env.GODADDY_API_BASE_URL) return;
	const hostOnly = process.env.VITE_GODADDY_API_HOST;
	if (!hostOnly) return;
	const normalizedHost = hostOnly.replace(/^https?:\/\//, "").trim();
	if (!normalizedHost) return;
	process.env.GODADDY_API_BASE_URL = `https://${normalizedHost}`;
}

normalizeCommerceApiBaseUrlEnv();

// ── Required secrets validation ───────────────────────────────────────────────
// Fail fast at startup if critical secrets are missing, so a dropped secret
// surfaces immediately in logs rather than as a broken live site.
const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'FLUTTERWAVE_SECRET_KEY',
] as const;

const missedSecrets = REQUIRED_SECRETS.filter(k => !process.env[k]);
if (missedSecrets.length > 0) {
  const msg = `[PadiHub FATAL] Missing required secrets at startup: ${missedSecrets.join(', ')}. ` +
    'The app cannot start safely. Add these secrets in the Airo Secrets panel and redeploy.';
  console.error(msg);
  // In production, exit so the platform restarts and the error is visible in logs.
  // In development, warn only so the dev server keeps running.
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const app = express();

// Honour x-forwarded-* from the load balancer so req.protocol/req.hostname
// reflect the public-facing values. Using a hop count (1) instead of `true`
// satisfies express-rate-limit's ERR_ERL_PERMISSIVE_TRUST_PROXY validation —
// `true` allows unlimited proxy hops which rate-limit flags as a bypass risk.
app.set("trust proxy", 1);

// ── Webhook routes — raw body required, registered BEFORE express.json() ─────
// Stripe requires the raw buffer to verify the webhook signature.
// Flutterwave uses a secret hash header; raw body needed for HMAC.
app.post('/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler,
);
app.post('/api/webhooks/flutterwave',
  express.raw({ type: 'application/json' }),
  flutterwaveWebhookHandler,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Security headers + CORS ───────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // managed separately for SSR pages
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (no origin header), the custom domain,
    // any *.airoapp.ai preview, and localhost dev
    if (
      !origin ||
      /\.airoapp\.ai$/.test(origin) ||
      /localhost/.test(origin) ||
      origin === 'https://padihub.com' ||
      origin === 'http://padihub.com'
    ) {
      return cb(null, true);
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// <api-registrations>
app.get("/api/geo", geo_get_0);
app.get("/api/health", health_get_1);
// </api-registrations>

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const apiLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);
app.use('/api',      apiLimiter);

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/register',        ...authController.register);
app.post('/api/auth/login',           ...authController.login);
app.post('/api/auth/logout',          authenticate, authController.logout);
app.post('/api/auth/verify-email',         ...authController.verifyEmail);
app.post('/api/auth/resend-verification',  ...authController.resendVerification);
app.post('/api/auth/forgot-password', ...authController.forgotPassword);
app.post('/api/auth/reset-password',  ...authController.resetPassword);
app.get( '/api/auth/me',              authenticate, authController.getMe);
app.post('/api/auth/change-password', authenticate, ...authController.changePassword);
app.post('/api/auth/refresh',         authenticate, authController.refresh);

// ── Contact ───────────────────────────────────────────────────────────────────
import contactPost from './api/contact/POST.js';
app.post('/api/contact', contactPost);

// ── Users ─────────────────────────────────────────────────────────────────────
app.get(   '/api/users/profile',       authenticate, userController.getProfile);
app.put(   '/api/users/profile',       authenticate, ...userController.updateProfile);
app.delete('/api/users/profile',       authenticate, userController.deleteProfile);
app.get(   '/api/users/notifications', authenticate, userController.getNotifications);
app.put(   '/api/users/preferences',   authenticate, ...userController.updatePreferences);

// ── Groups ────────────────────────────────────────────────────────────────────
app.get(   '/api/groups',                    authenticate, groupController.list);
app.get(   '/api/groups/:id',                authenticate, groupController.getOne);
app.post(  '/api/groups',                    authenticate, ...groupController.create);
app.put(   '/api/groups/:id',                authenticate, ...groupController.update);
app.delete('/api/groups/:id',                authenticate, groupController.close);
app.post(  '/api/groups/:id/invitations',    authenticate, ...groupController.createInvitation);

// ── Memberships ───────────────────────────────────────────────────────────────
app.get(   '/api/memberships',     authenticate, membershipController.list);
app.post(  '/api/memberships',     authenticate, ...membershipController.join);
app.delete('/api/memberships/:id', authenticate, membershipController.leave);
app.post(  '/api/memberships/remove', authenticate, ...membershipController.remove);

// ── Contributions ─────────────────────────────────────────────────────────────
app.get( '/api/contributions',                  authenticate, contributionController.list);
app.post('/api/contributions/generate-schedule', authenticate, ...contributionController.generateSchedule);
app.put( '/api/contributions/:id',              authenticate, ...contributionController.update);

// ── Rotations ─────────────────────────────────────────────────────────────────
app.get('/api/rotations',                authenticate, rotationController.list);
app.get('/api/rotations/:id/current',    authenticate, rotationController.getCurrent);
app.get('/api/rotations/:id/next',       authenticate, rotationController.getNext);
app.get('/api/rotations/:id/previous',   authenticate, rotationController.getPrevious);
app.put('/api/rotations/:id/advance',    authenticate, rotationController.advance);

// ── Votes ─────────────────────────────────────────────────────────────────────
app.get('/api/votes',            authenticate, voteController.list);
app.post('/api/votes',           authenticate, ...voteController.create);
app.put('/api/votes/:id',        authenticate, ...voteController.cast);
app.put('/api/votes/:id/close',  authenticate, voteController.close);

// ── Notifications ─────────────────────────────────────────────────────────────
app.get(   '/api/notifications',              authenticate, notificationController.list);
app.get(   '/api/notifications/count',        authenticate, notificationController.count);
app.put(   '/api/notifications/read-all',     authenticate, notificationController.markAllRead);
app.put(   '/api/notifications/:id/read',     authenticate, notificationController.markRead);
app.delete('/api/notifications/:id',          authenticate, notificationController.delete);

// ── Subscriptions ─────────────────────────────────────────────────────────────
app.get( '/api/subscriptions',            authenticate, subscriptionController.get);
app.get( '/api/subscriptions/status',     authenticate, subscriptionController.get);
app.post('/api/subscriptions/cancel',     authenticate, subscriptionController.cancel);
app.post('/api/subscriptions/reactivate', authenticate, subscriptionController.reactivate);

// ── Payments ──────────────────────────────────────────────────────────────────
app.post('/api/payments/setup-intent',       authenticate, paymentController.setupIntent);
app.post('/api/payments/connect-onboard',    authenticate, requireRole('group_leader', 'admin'), paymentController.connectOnboard);
app.post('/api/payments/charge-contribution', authenticate, paymentController.chargeContribution);

// ── Support ───────────────────────────────────────────────────────────────────
app.get( '/api/support',     authenticate, supportController.list);
app.get( '/api/support/:id', authenticate, supportController.getOne);
app.post('/api/support',     authenticate, ...supportController.create);
app.put( '/api/support/:id', authenticate, ...supportController.update);

// ── Admin ─────────────────────────────────────────────────────────────────────
app.get(   '/api/admin/dashboard',                authenticate, requireRole('admin'), adminController.dashboard);
app.get(   '/api/admin/users',                    authenticate, requireRole('admin'), adminController.listUsers);
app.get(   '/api/admin/users/:id',                authenticate, requireRole('admin'), adminController.getUserDetail);
app.put(   '/api/admin/users/:id/suspend',        authenticate, requireRole('admin'), adminController.suspendUser);
app.put(   '/api/admin/users/:id/reactivate',     authenticate, requireRole('admin'), adminController.reactivateUser);
app.delete('/api/admin/users/:id',                authenticate, requireRole('admin'), adminController.deleteUser);
app.get(   '/api/admin/groups',                   authenticate, requireRole('admin'), adminController.listGroups);
app.get(   '/api/admin/groups/:id',               authenticate, requireRole('admin'), adminController.getGroupDetail);
app.put(   '/api/admin/groups/:id/close',         authenticate, requireRole('admin'), adminController.forceCloseGroup);
app.get(   '/api/admin/subscriptions',            authenticate, requireRole('admin'), adminController.listSubscriptions);
app.put(   '/api/admin/subscriptions/:id/cancel', authenticate, requireRole('admin'), adminController.cancelSubscription);
app.get(   '/api/admin/support',                  authenticate, requireRole('admin'), adminController.listTickets);
app.put(   '/api/admin/support/:id',              authenticate, requireRole('admin'), adminController.updateTicket);
app.put(   '/api/admin/support/:id/close',        authenticate, requireRole('admin'), adminController.closeTicket);
app.get(   '/api/admin/audit',                    authenticate, requireRole('admin'), adminController.auditLogs);

// ── Identity Verification ─────────────────────────────────────────────────────
// Webhook must be public and receive raw body for signature verification
app.post('/api/identity/verify/webhook',
  express.raw({ type: 'application/json' }),
  stripeIdentityWebhook,
);
app.post('/api/identity/verify/start', authenticate, startStripeIdentity);
app.get( '/api/identity/status',       authenticate, getIdentityStatus);
app.post('/api/identity/bvn/verify',   authenticate, initiateBvn);
app.post('/api/identity/bvn/confirm',  authenticate, confirmBvn);

// ── Legal ─────────────────────────────────────────────────────────────────────
app.get('/api/legal/terms',   legalController.terms);
app.get('/api/legal/privacy', legalController.privacy);

// ── Monitoring ────────────────────────────────────────────────────────────────
app.get('/api/system/health', monitoringController.health);
app.get('/api/system/errors', authenticate, requireRole('admin'), monitoringController.errors);
app.get('/api/system/jobs',   authenticate, requireRole('admin'), monitoringController.jobs);

// ── API Documentation ─────────────────────────────────────────────────────────
registerSwagger(app);

// ── Central error handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

// Error middleware must be registered AFTER the routes it protects; Express
// only passes errors to middleware defined later in the stack.
app.use("/api", (err: unknown, req: Request, res: Response, _next: NextFunction) => {
	// Always respond JSON on /api so clients parsing response.json() don't
	// receive Express's default HTML error page for non-Error throws.
	console.error("ssr.api.error", {
		url: req.url,
		error: err instanceof Error ? err.stack : String(err),
	});
	res.status(500).json({ error: "Internal server error" });
});

function baseUrl(req: Request): string {
	return `${req.protocol}://${req.hostname}`;
}

function escapeXml(s: string): string {
	return s.replace(/[&<>"']/g, (c) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
	);
}

app.get("/robots.txt", (req, res) => {
	if (isSystemHost(req)) {
		res
			.type("text/plain")
			.set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host")
			.send("User-agent: *\nDisallow: /\n");
		return;
	}
	const base = baseUrl(req);
	const body = [
		"User-agent: *",
		"Allow: /",
		"",
		`Sitemap: ${base}/sitemap.xml`,
		"",
	].join("\n");
	res.type("text/plain").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

app.get("/sitemap.xml", (req, res) => {
	if (isSystemHost(req)) {
		const empty = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n`;
		res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(empty);
		return;
	}
	const base = baseUrl(req);
	const urls = seoRoutes
		.filter((r) => typeof r.path === "string" && r.path.startsWith("/"))
		.map((r) => {
			const loc = `${base}${r.path}`;
			const parts = [`    <loc>${escapeXml(loc)}</loc>`];
			if (r.lastmod) parts.push(`    <lastmod>${escapeXml(r.lastmod)}</lastmod>`);
			if (r.changefreq) parts.push(`    <changefreq>${r.changefreq}</changefreq>`);
			if (r.priority !== undefined)
				parts.push(`    <priority>${r.priority.toFixed(1)}</priority>`);
			return `  <url>\n${parts.join("\n")}\n  </url>`;
		})
		.join("\n");
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

if (import.meta.env.PROD) {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const clientDir = join(__dirname, "client");

	app.use(
		express.static(clientDir, {
			index: false,
			setHeaders(res, filePath) {
				res.set(
					"Cache-Control",
					filePath.includes("/assets/")
						? "public, max-age=31536000, immutable"
						: "no-cache",
				);
			},
		}),
	);

	app.use((_req, res, next) => {
		res.set("Cache-Control", "no-cache");
		next();
	});

	let template: string;
	try {
		template = readFileSync(join(clientDir, "index.html"), "utf-8");
	} catch (err) {
		console.error("ssr.template.load-failed", {
			path: join(clientDir, "index.html"),
			error: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	}
	if (!template.includes("<!--app-head-->") || !template.includes("<!--app-html-->")) {
		// Fail fast at boot, same as a template load failure above: without
		// markers, every .replace() call on the render path is a no-op and we
		// would serve a shell with no <head> content and no rendered body on
		// every request. Preferring process.exit over a degraded mode ensures
		// an operator notices and fixes the build rather than serving broken
		// SEO-invisible pages indefinitely.
		console.error("ssr.template.markers-missing", {
			hasHead: template.includes("<!--app-head-->"),
			hasHtml: template.includes("<!--app-html-->"),
		});
		process.exit(1);
	}
	const fallbackShell = template
		.replace("<!--app-head-->", "")
		.replace("<!--app-html-->", "");

	// Resolve the SSR module once into a stable render function. A failed
	// load is unrecoverable at runtime - exiting lets the container
	// scheduler restart with a clean slate rather than leaving the server
	// to serve silent 503s indefinitely against a single startup log.
	type RenderResult = {
		html: string;
		head: string;
		status: number;
		redirect?: string;
	};
	let renderFn: ((url: string) => Promise<RenderResult>) | null = null;
	const SSR_MODULE_LOAD_TIMEOUT_MS = 30_000;
	const loadTimeout = setTimeout(() => {
		if (renderFn !== null) return;
		console.error("ssr.module.load-timeout", {
			timeoutMs: SSR_MODULE_LOAD_TIMEOUT_MS,
		});
		process.exit(1);
	}, SSR_MODULE_LOAD_TIMEOUT_MS);
	loadTimeout.unref();
	import("../entry-server").then(
		(mod) => {
			clearTimeout(loadTimeout);
			renderFn = mod.render;
		},
		(err) => {
			clearTimeout(loadTimeout);
			console.error("ssr.module.load-failed", {
				error: err instanceof Error ? err.stack : String(err),
			});
			process.exit(1);
		},
	);

	app.get(/.*/, async (req, res, next) => {
		if (req.method !== "GET") return next();
		if (req.path.startsWith("/api")) return next();
		if (extname(req.path)) return next();
		const sendFallback = () =>
			res
				.status(503)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-store")
				.send(fallbackShell);
		if (renderFn === null) {
			// Module not yet resolved; fall back without logging to avoid startup
			// noise before the first render is even possible. A terminal load
			// failure (import reject or 30s timeout) process.exit(1)s from the
			// loader above, so this branch is only the brief warmup window.
			return sendFallback();
		}
		try {
			const result = await renderFn(req.url);
			if (result.redirect) {
				// Redirect thrown from a loader/action surfaces as a Response.
				// Forward it so the browser actually navigates to the new URL
				// instead of seeing an empty shell with a stale status.
				res.redirect(result.status, result.redirect);
				return;
			}
			if (!result.html) {
				// A non-redirect Response was thrown from a loader (e.g.
				// `throw new Response(null, { status: 404 })`). renderToString
				// produced no markup, so we have a real status but no body.
				// Log so the case is observable in ops dashboards, and mark
				// no-store so CDNs don't cache an empty page as a valid hit.
				// User-visible 404 / error pages should come from a route
				// errorElement, not from this fallback path.
				console.error("ssr.render.error-response", {
					url: req.url,
					status: result.status,
				});
				res
					.status(result.status)
					.set("Content-Type", "text/html; charset=utf-8")
					.set("Cache-Control", "no-store")
					.send(fallbackShell);
				return;
			}
			// Per-host SEO injection. System URLs get a noindex meta so
			// crawlers drop them from the index over time; customer-attached
			// hosts get a self-canonical link so search engines treat them
			// as authoritative for the rendered content.
			const seoHead = isSystemHost(req)
				? `<meta name="robots" content="noindex,nofollow">`
				: `<link rel="canonical" href="${escapeXml(`${req.protocol}://${req.hostname}${req.path}`)}">`;
			// Function replacements disable String.replace's $-special sequences
			// ($&, $', $`, $$) so user-authored titles / JSON-LD like
			// "Save $& today" insert literally instead of being interpolated.
			// The SSR success flag (window.__SSR_OK__) is injected by
			// entry-server.tsx into result.head so the platform's renderSsrDocument
			// carries it through <!--app-head--> automatically.
			const out = template
				.replace("<!--app-head-->", () => seoHead + result.head)
				.replace("<!--app-html-->", () => result.html);
			res
				.status(result.status)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-cache")
				.send(out);
		} catch (err) {
			// 503 surfaces the failure in CDN/monitoring without caching a broken
			// page as success. console.error (not warn) puts it at the right log
			// level for the observability pipeline to alert on.
			console.error("ssr.render.failed", {
				url: req.url,
				// Log the full stack — React's renderToString annotates it with
				// the failing component's call tree, which the message alone
				// discards.
				error: err instanceof Error ? err.stack : String(err),
			});
			sendFallback();
		}
	});

	const shutdown = async (signal: string) => {
		console.log(`Got ${signal}, shutting down gracefully...`);
		// Scope the ERR_MODULE_NOT_FOUND suppression to the import() only.
		// A closeConnection() failure that happens to carry the same code
		// (unlikely but possible for wrapped errors) must not be silently
		// swallowed - it indicates a real db-close failure worth logging.
		let mod: { closeConnection?: () => Promise<void> | void } | null = null;
		try {
			const dbClient = "./db/client" + ".js";
			mod = await import(/* @vite-ignore */ dbClient);
		} catch (error: unknown) {
			const code = (error as { code?: string } | null)?.code;
			if (code !== "ERR_MODULE_NOT_FOUND") {
				console.error("ssr.shutdown.db-import-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		if (mod && typeof mod.closeConnection === "function") {
			try {
				await mod.closeConnection();
				console.log("Database connections closed");
			} catch (error: unknown) {
				console.error("ssr.shutdown.db-close-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		process.exit(0);
	};

	(["SIGTERM", "SIGINT"] as const).forEach((signal) => {
		process.once(signal, () => {
			void shutdown(signal);
		});
	});

	const rawPort = process.env.PORT || "3000";
	const port = parseInt(rawPort, 10);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		// parseInt("abc") returns NaN; passing that to app.listen throws
		// synchronously before the server.on("error") handler below can catch
		// it. Fail fast with an actionable log rather than a cryptic crash.
		console.error("ssr.server.invalid-port", { rawPort });
		process.exit(1);
	}
	const host = process.env.HOST || "0.0.0.0";
	const server = app.listen(port, host, () => {
		console.log(`Server listening on http://${host}:${port}`);
	});
	server.on("error", (err: NodeJS.ErrnoException) => {
		console.error("ssr.server.listen-failed", {
			port,
			host,
			code: err.code,
			error: err.message,
		});
		process.exit(1);
	});
}

export default app;

// ---------------------------------------------------------------------------
// Exported utilities (used by tests)
// ---------------------------------------------------------------------------

export interface AdSenseConfig {
  publisherId: string | null;
  scriptHtml: string;
  adsTxt: string | null;
  appAdsTxt: string | null;
}

export interface AdSenseScriptConfig {
  scriptHtml: string;
}

export function registerAdSenseTextRoutes(
  expressApp: import("express").Express,
  config: AdSenseConfig,
): void {
  expressApp.get("/ads.txt", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/plain");
    if (config.adsTxt) {
      res.status(200).send(config.adsTxt);
    } else {
      res.status(404).send("Not found");
    }
  });

  expressApp.get("/app-ads.txt", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/plain");
    if (config.appAdsTxt) {
      res.status(200).send(config.appAdsTxt);
    } else {
      res.status(404).send("Not found");
    }
  });
}

export function renderSsrDocument(
  template: string,
  rendered: { head: string; html: string },
  adSense: AdSenseScriptConfig,
): string {
  const headContent = rendered.head + (adSense.scriptHtml ? `\n${adSense.scriptHtml}` : "");
  return template
    .replace("<!--app-head-->", headContent)
    .replace("<!--app-html-->", rendered.html);
}
