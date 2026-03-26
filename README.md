# furigana

React Router v7 web application with SSR, Tailwind CSS v4, and shadcn/ui.

## Stack

- **React Router v7** — SSR enabled, framework mode
- **Vite v7** — bundler with `vite-tsconfig-paths`
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin
- **shadcn/ui** — component library built on Base UI
- **Axios** — API client with auth interceptors
- **Sentry v10** — `@sentry/react` with browser tracing and replay

## Scripts

```bash
pnpm dev           # Dev server with HMR (port 5173)
pnpm build         # Production build to build/
pnpm start         # Serve production build
pnpm type-check    # react-router typegen + tsc --noEmit
pnpm db:generate   # Generate versioned SQL migrations from Drizzle schema
pnpm db:migrate    # Apply pending migrations (local file DB or Turso, via env vars)
```

## Environment variables

Create `.env` in the project root:

```
VITE_API_BASE_URL=http://localhost:3000
VITE_SENTRY_DSN=
TURSO_DATABASE_URL=file:local.db
TURSO_AUTH_TOKEN=
```

`TURSO_AUTH_TOKEN` may be empty only for `file:` URLs. For remote `libsql://` or `https://` URLs, it must be set.

## Database migrations

This project uses **versioned Drizzle migrations** committed under `drizzle/`. Use migrations for schema changes; do **not** use `drizzle-kit push`.

### Local workflow

```bash
# 1) Generate SQL from schema changes
pnpm db:generate

# 2) Review generated SQL in drizzle/*.sql
#    (especially index SQL and WHERE clauses)

# 3) Apply migrations
pnpm db:migrate
```

Notes:

- `drizzle.config.ts` defaults to `file:local.db` if `TURSO_DATABASE_URL` is unset.
- `*.db` files are gitignored to avoid committing local SQLite data.
- `drizzle/migration.test.ts` is a regression guard that validates committed migration SQL shape.

### Production Turso apply flow

```bash
# 0) Backup before migration
turso db dump <db-name> > backup-$(date +%Y%m%d-%H%M%S).sql

# 1) Apply migrations to remote Turso
TURSO_DATABASE_URL=libsql://<db-name>-<org>.turso.io \
TURSO_AUTH_TOKEN=<token> \
pnpm db:migrate
```

Recommended:

- Run migrations in staging first, then production.
- Keep `drizzle/` artifacts in git so teammates and CI run the same migration history.

## Project structure

```
app/
├── instrument.ts         Sentry initialisation — imported first in root.tsx
├── root.tsx              HTML shell, Layout, global ErrorBoundary
├── entry.client.tsx      Client-side hydration with Sentry error callbacks
├── routes.ts             Route config (React Router framework mode)
├── app.css               Global styles, Tailwind CSS v4 entrypoint
├── lib/
│   ├── axios/
│   │   └── instance.ts   Axios instance with auth token + 401 interceptors
│   └── utils.ts          cn() helper (clsx + tailwind-merge)
├── components/
│   └── ui/               shadcn/ui components (Button, Card, …)
└── routes/
    └── home.tsx          Example route: health check + schema demo
```

## Routing

Routes are declared in `app/routes.ts` using the `@react-router/dev/routes` API. SSR is enabled by default in `react-router.config.ts`. Use `loader` for server-side data fetching and `clientLoader` for client-only fetches.

## API client

`app/lib/axios/instance.ts` exports a pre-configured Axios instance:

- Base URL from `VITE_API_BASE_URL`
- Attaches `Authorization: Bearer <token>` from `localStorage`
- Redirects to `/login` on 401 responses

## shadcn/ui

Components live in `app/components/ui/`. Add new ones with:

```bash
pnpx shadcn@latest add <component> --defaults
```

The `~/` path alias maps to `app/`, so imports look like `~/components/ui/button`.

## Sentry

`instrument.ts` is imported before anything else in both `root.tsx` and `entry.client.tsx`. Error tracking in `hydrateRoot` uses manual `captureException` calls (instead of `reactErrorHandler`) to stay compatible with `exactOptionalPropertyTypes`.
