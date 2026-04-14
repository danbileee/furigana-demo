# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Build shared package first (required before app builds)
pnpm --filter @starterkit/interface build

# Development (all apps in parallel)
pnpm dev

# Individual app development
pnpm --filter @starterkit/api dev       # NestJS on port 3000
pnpm --filter @starterkit/web dev       # React Router on port 5173

# Build all
pnpm build

# Type-check all workspaces
pnpm type-check

# Lint & format
pnpm exec eslint .
pnpm exec eslint . --fix
pnpm exec prettier --write .

# API tests
pnpm --filter @starterkit/api test
pnpm --filter @starterkit/api test --testPathPattern=app.service  # single test file
pnpm --filter @starterkit/api test:e2e

# Start PostgreSQL
docker compose up -d
```

### Environment variables

- `apps/api/.env` — `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`, `DATABASE_SSL`, `NODE_ENV`, `PORT`, `SENTRY_DSN`, `WEB_URL`
- `apps/web/.env` — `VITE_API_BASE_URL`, `VITE_SENTRY_DSN`

## Architecture

### Monorepo layout

```
apps/api/          NestJS v11, TypeORM v0.3, PostgreSQL
apps/web/          React Router v7 (SSR), Vite v7, Tailwind CSS v4, shadcn/ui
packages/interface/ Zod v4 schemas shared between API and web
```

### packages/interface — shared types

Single source of truth for API contracts. Exposes Zod v4 schemas and inferred TypeScript types used by both apps. tsup builds dual CJS+ESM output (`dist/index.js` + `dist/index.cjs`). During development, both apps resolve the package directly to `packages/interface/src/index.ts` via `paths` aliases (no rebuild needed).

Use `z.email()` / `z.uuid()` directly — **not** `z.string().email()` (deprecated in Zod v4).

### apps/api — NestJS backend

- **Module resolution**: `NodeNext` — all internal imports must use `.js` extensions (e.g., `./app.module.js`). Jest strips `.js` via `moduleNameMapper`.
- **Sentry**: `instrument.ts` must be the first import in `main.ts`. Error handling uses `SentryGlobalFilter` registered as `APP_FILTER` provider (not `setupNestErrorHandler`).
- **Database**: TypeORM entities auto-discovered via glob `**/*.entity.{js,ts}`. `synchronize: true` only in non-production. Never use `composite: true` in `tsconfig.json` — it silently breaks `nest build`.
- **Validation**: Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. DTOs use `class-validator` decorators alongside Zod schemas from `@starterkit/interface`.
- **Config**: `ConfigModule` is global; use `config.getOrThrow<T>()` for required env vars.

### apps/web — React Router frontend

- **SSR enabled** (`ssr: true` in `react-router.config.ts`). Routes are defined in `app/routes.ts`.
- **Sentry**: `instrument.ts` imported first in both `root.tsx` and `entry.client.tsx`. Use manual `captureException` in `hydrateRoot` error callbacks (avoids type incompatibility with `exactOptionalPropertyTypes`).
- **API client**: `app/lib/api.ts` exports an Axios instance with auth token interceptor and 401→login redirect.
- **shadcn/ui**: Components live in `app/components/ui/`. Add new components with `pnpx shadcn@latest add <component> --defaults`.
- **Path alias**: `~/` maps to `app/`.

## TypeScript conventions

- Root `tsconfig.base.json` enables `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- API uses `moduleResolution: NodeNext`; web uses `moduleResolution: Bundler`.
- No `any`, no `as` type casts. Use `satisfies` or proper generics instead.
- Use `type` imports everywhere — ESLint enforces `consistent-type-imports`.

## ESLint

Single flat config at root (`eslint.config.mjs`). NestJS decorator files relax `no-unsafe-call/member-access/assignment`. Prettier runs last to disable conflicting formatting rules.
