# PadiHub

PadiHub is a full-stack web application for managing rotating savings groups (ROSCA-style circles). Members contribute on a schedule, rotate payouts, build trust scores, and manage subscriptions with Stripe or Flutterwave.

This repository is the active development codebase for Booker Global. Use the branch workflow below when contributing.

---

## Table of contents

1. [Overview](#overview)
2. [Tech stack](#tech-stack)
3. [Repository branches](#repository-branches)
4. [Prerequisites](#prerequisites)
5. [Getting started](#getting-started)
6. [Environment variables](#environment-variables)
7. [Project structure](#project-structure)
8. [Application domains](#application-domains)
9. [Scripts](#scripts)
10. [Database](#database)
11. [API and server](#api-and-server)
12. [Frontend conventions](#frontend-conventions)
13. [Testing](#testing)
14. [Linting and type checking](#linting-and-type-checking)
15. [Development workflow](#development-workflow)
16. [Deployment notes](#deployment-notes)
17. [Security notes](#security-notes)

---

## Overview

PadiHub supports:

- User registration, email verification, and password reset
- Savings group creation, joining, leaving, and contributions
- Rotation schedules and payout management for group leaders
- Trust scores and identity verification (Stripe Identity / Flutterwave BVN flows)
- Membership and subscription billing (Stripe / Flutterwave)
- Notifications, help centre, and admin tooling
- Marketing and product pages (home, features, pricing, FAQ, legal)

The app is a Vite + React SPA with an Express TypeScript API, MySQL via Drizzle ORM, and scheduled jobs.

---

## Tech stack

### Frontend

| Technology | Role |
| --- | --- |
| React 19 | UI |
| TypeScript 5 | Type safety |
| Vite 6 | Dev server and builds |
| React Router 7 | Client routing |
| Tailwind CSS 3 | Styling |
| shadcn/ui + Radix | Accessible UI primitives |
| TanStack Query | Server state |
| Zustand | Client state |
| React Hook Form + Zod | Forms and validation |
| Motion | Animations |

### Backend

| Technology | Role |
| --- | --- |
| Express 5 | HTTP API |
| Drizzle ORM | MySQL schema and queries |
| JWT + bcrypt | Auth |
| Stripe / Flutterwave | Payments and identity |
| Resend | Transactional email |
| Trigger.dev | Background / scheduled jobs |
| Swagger | API documentation |

### Tooling

- ESLint 9, Prettier, Vitest, Testing Library
- Node.js 22 or newer (`engines.node >= 22`)

---

## Repository branches

| Branch | Purpose |
| --- | --- |
| `main` | Stable / production-ready baseline |
| `developer` | Integration branch for backend, API, database, and full-stack work |
| `frontend` | UI, pages, layouts, and client-side feature work |

**Recommended flow**

1. Branch from `developer` for API/backend tasks, or from `frontend` for UI-only tasks.
2. Open a pull request into the matching long-lived branch.
3. Merge long-lived branches into `main` when a release is ready.

Do not commit secrets, `.env` files, or `node_modules`.

---

## Prerequisites

- Node.js **22+**
- npm (comes with Node)
- MySQL 8+ (local or remote) for database-backed features
- Git

Optional for full feature parity:

- Stripe account (payments + Identity)
- Flutterwave account (payments + identity where configured)
- Resend API key (email)
- Trigger.dev project (scheduled jobs)

---

## Getting started

```bash
# Clone
git clone https://github.com/Booker-Global/New-PadiHub.git
cd New-PadiHub

# Install dependencies
npm install

# Configure environment
cp env.example .env
# Edit .env with your local values

# Start the development server
npm run dev
```

The Vite dev server typically runs on port **5173**. API configuration is controlled by `PORT` and `VITE_API_URL` in `.env` (see `env.example`).

---

## Environment variables

Copy `env.example` to `.env`. Never commit `.env`.

### Required for local UI development

```env
VITE_APP_NAME=PadiHub
VITE_PUBLIC_URL=http://localhost:5173
VITE_API_URL=http://localhost:3000/api
NODE_ENV=development
PORT=3000
```

### Database (when using MySQL)

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_user
DB_PASS=your_password
DB_NAME=padihub
```

Or a single connection string where your deployment supplies one (see `src/server/db/config.ts` and `drizzle.config.ts`).

### Auth and integrations (enable as needed)

```env
JWT_SECRET=replace-with-a-long-random-secret
SESSION_SECRET=replace-with-a-long-random-secret

# Stripe / Flutterwave / Resend / AI keys as documented in env.example
```

Feature flags in `env.example`:

- `VITE_ENABLE_SOURCE_MAPPING` — component source mapping in development
- `VITE_ENABLE_SSR` — SSR-related build behaviour
- `VITE_SHOW_DEV_TOOLS` — in-app developer tools

---

## Project structure

```
PadiHub/
├── public/                 # Static assets, favicons, marketing PDFs
├── src/
│   ├── components/         # Shared React components (including ui/)
│   ├── content/            # Content schemas and page JSON
│   ├── layouts/            # RootLayout, Website, Dashboard + Header/Footer
│   ├── lib/                # Client utilities, SEO, API client, analytics
│   ├── pages/              # Route pages (marketing, auth, app, admin)
│   ├── server/             # Express API, services, DB, jobs, middleware
│   │   ├── api/            # Lightweight route handlers (health, contact, geo)
│   │   ├── controllers/    # HTTP controllers
│   │   ├── db/             # Drizzle client, config, schema
│   │   ├── integrations/   # Email, payments, identity providers
│   │   ├── jobs/           # Daily / weekly / monthly jobs
│   │   ├── middleware/     # Auth, validation, errors, audit logging
│   │   ├── services/       # Business logic
│   │   └── __tests__/      # Server unit tests
│   ├── styles/             # Global and responsive CSS
│   ├── test/               # Vitest setup
│   ├── trigger/            # Trigger.dev job entry points
│   ├── App.tsx             # Router shell
│   ├── main.tsx            # Client entry
│   ├── routes.tsx          # Route table
│   └── router.ts           # Route helpers
├── airo-secrets/           # Local stub for platform secrets module
├── content-plugin/         # Vite content plugin
├── dev-tools/              # Dev-only Vite plugins and overlays
├── source-mapper/          # Component introspection for AI-assisted work
├── drizzle.config.ts       # Drizzle Kit config
├── env.example             # Environment template
├── package.json
└── vite.config.ts
```

---

## Application domains

| Area | Location | Notes |
| --- | --- | --- |
| Auth | `src/pages/login.tsx`, `forgot-password`, `verify-email`, `src/server/services/authService.ts` | JWT sessions, email verification |
| Savings groups | `src/pages/savings-groups/**`, `groupService`, `contributionService`, `rotationService` | Create, join, contribute, rotate |
| Leader tools | `src/pages/leader/**`, `leader-dashboard` | Members and contributions |
| Trust | `src/pages/trust/**`, `trustScoreService`, identity integrations | Scores and verification |
| Subscriptions | `src/pages/subscription/**`, `subscriptionService`, payment providers | Billing lifecycle |
| Notifications | `src/pages/notifications/**`, `notificationService` | In-app prefs and delivery |
| Admin | `src/pages/admin`, `adminController` | Operational controls |
| Marketing / legal | `index`, `features`, `pricing`, `faq`, `terms`, `privacy`, `contact` | Public site |

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite development server with HMR |
| `npm run build` | Production client build + SSR server entry build |
| `npm run preview` | Preview the production client build locally |
| `npm run test` | Run Vitest |
| `npm run test:ui` | Vitest UI |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run type-check` | TypeScript (`tsc --noEmit`) |
| `npm run format` | Prettier on `src/**/*.{ts,tsx,json,md}` |
| `npm run clean` | Remove `dist` and Vite cache |
| `npm run reset` | Clean and reinstall dependencies |

---

## Database

Schema lives in `src/server/db/schema.ts` (MySQL via Drizzle).

Core tables include users, email/password tokens, savings groups, memberships, contributions, rotations, votes, subscriptions, and related audit fields.

### Drizzle commands

```bash
npx drizzle-kit generate   # Generate migrations from schema
npx drizzle-kit push       # Push schema to the configured database
```

Credentials are resolved through `src/server/db/config.ts` / `getDatabaseCredentials()` as used by `drizzle.config.ts`. Ensure your DB env vars or platform config are set before running migrations.

---

## API and server

Server entry: `src/server/entry.ts`.

Patterns:

- **Controllers** accept HTTP requests and delegate to **services**
- **Services** own business rules and persistence
- **Integrations** wrap Stripe, Flutterwave, Resend, and identity providers
- **Middleware** handles auth, validation, rate limiting concerns, and errors
- **Jobs** under `src/server/jobs` and `src/trigger` cover scheduled work

Health and utility routes exist under `src/server/api/` (for example health and contact). Swagger setup is in `src/server/swagger.ts`.

Client calls should go through `src/lib/api-client.ts` rather than ad-hoc `fetch` scattered across pages.

---

## Frontend conventions

- Pages under `src/pages` should be content-focused; shared chrome belongs in layouts (`RootLayout`, `Website`, `Dashboard`).
- Reusable primitives live in `src/components/ui`.
- Prefer TypeScript types and Zod schemas at API and form boundaries.
- Use TanStack Query for remote data; keep ephemeral UI state local or in Zustand when shared across a feature.
- Follow existing naming: PascalCase for components, camelCase for functions and hooks.
- Keep accessibility: prefer Radix-based controls and meaningful labels.

Adding shadcn components:

```bash
npx shadcn-ui@latest add <component-name>
```

---

## Testing

```bash
npm run test
```

- Unit tests for services live under `src/server/__tests__`
- Component tests live next to components or under `__tests__` folders
- Shared Vitest setup: `src/test/setup.ts`

When changing business logic (contributions, rotations, trust, payments), add or update service tests before opening a PR.

---

## Linting and type checking

Before every pull request:

```bash
npm run type-check
npm run lint
npm run test
```

Fix formatting with:

```bash
npm run format
```

---

## Development workflow

1. Sync the target long-lived branch (`git pull origin developer` or `frontend`).
2. Create a short-lived branch, for example `feature/group-invite-link` or `fix/trust-score-rounding`.
3. Implement the change with focused commits.
4. Run type-check, lint, and tests locally.
5. Push and open a PR into `developer` or `frontend` as appropriate.
6. After review and merge, coordinate promotion into `main` for release.

### Commit message guidance

- Prefer imperative summaries: `Add contribution receipt email`, `Fix rotation position reset`
- Keep PRs small and reviewable; separate backend and pure UI when practical

---

## Deployment notes

```bash
npm run build
```

This produces the client build and the SSR/server entry build (`vite build --ssr src/server/entry.ts`). Host according to your infrastructure (Node process, container, or platform). Ensure production env vars for database, JWT, payment providers, and public URLs are set before starting the server.

Suggested checklist for a release:

- [ ] Migrations applied
- [ ] Env vars verified (no placeholder secrets)
- [ ] `npm run build` succeeds
- [ ] Smoke-test auth, group create/join, and a payment webhook path in staging
- [ ] Monitoring / health endpoint responding

---

## Security notes

- Never commit `.env`, API keys, or private keys
- Use strong `JWT_SECRET` / `SESSION_SECRET` values in every non-local environment
- Treat webhook handlers (`webhookStripeController`, `webhookFlutterwaveController`) as trusted-entry points: verify signatures and keep handlers idempotent
- Prefer server-side validation (Zod + middleware) even when the client already validates
- Keep dependency installs locked to `package-lock.json`

---

## License

Private repository — Booker Global. All rights reserved unless a separate license file is added.
```