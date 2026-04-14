# Monorepo Starterkit

A production-grade pnpm monorepo starter kit with a NestJS API, React Router web app, and a shared TypeScript interface package.

## Stack

| Layer   | Technology                                      |
| ------- | ----------------------------------------------- |
| API     | NestJS v11, TypeORM v0.3, PostgreSQL            |
| Web     | React Router v7 (SSR), Vite v7, Tailwind CSS v4 |
| UI      | shadcn/ui, lucide-react                         |
| Shared  | Zod v4 schemas (`packages/interface`)           |
| Tooling | TypeScript v5.8, ESLint v9, Prettier v3, Husky  |
| Runtime | Node ≥ 22, pnpm ≥ 10                            |

## Workspaces

```
apps/api/           @starterkit/api       — NestJS REST API (port 3000)
apps/web/           @starterkit/web       — React Router web app (port 5173)
packages/interface/ @starterkit/interface — Shared Zod schemas & TypeScript types
```

## Getting started

**Prerequisites:** Node ≥ 22, pnpm ≥ 10, Docker

```bash
# Install dependencies
pnpm install

# Start PostgreSQL
docker compose up -d

# Copy and fill in environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Build shared package (required before first run)
pnpm --filter @starterkit/interface build

# Run all apps in parallel
pnpm dev
```

## Scripts

| Command                                  | Description                  |
| ---------------------------------------- | ---------------------------- |
| `pnpm dev`                               | Start all apps in watch mode |
| `pnpm build`                             | Build all packages           |
| `pnpm type-check`                        | Type-check all workspaces    |
| `pnpm exec eslint .`                     | Lint all workspaces          |
| `pnpm exec eslint . --fix`               | Lint and auto-fix            |
| `pnpm exec prettier --write .`           | Format all files             |
| `pnpm --filter @starterkit/api test`     | Run API unit tests           |
| `pnpm --filter @starterkit/api test:e2e` | Run API e2e tests            |

## Environment variables

**`apps/api/.env`**

```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=starterkit_dev
DATABASE_SSL=false
NODE_ENV=development
PORT=3000
WEB_URL=http://localhost:5173
SENTRY_DSN=
```

**`apps/web/.env`**

```
VITE_API_BASE_URL=http://localhost:3000
VITE_SENTRY_DSN=
```

## Architecture overview

### Shared types flow

`packages/interface` is the single source of truth for API contracts. Zod schemas are defined once and consumed by both the NestJS API (validation) and the React Router web app (parsing/display). During development, both apps import directly from `packages/interface/src/index.ts` via TypeScript `paths` aliases — no rebuild required. A production build uses the compiled `dist/` output.

### API request lifecycle

1. Request hits NestJS controller
2. Global `ValidationPipe` validates DTOs using `class-validator` decorators
3. Controller delegates to service; service interacts with TypeORM repositories
4. Responses follow the `createApiResponseSchema` envelope from `@starterkit/interface`
5. Unhandled errors are caught by `SentryGlobalFilter` and reported to Sentry

### Web data flow

1. React Router loaders/actions run server-side (SSR) or client-side depending on export (`loader` vs `clientLoader`)
2. API calls go through the Axios client in `app/lib/api.ts`, which attaches auth tokens and handles 401 redirects
3. Components are built with shadcn/ui primitives and Tailwind CSS v4

## Code quality

- Pre-commit hooks via Husky + lint-staged run ESLint and Prettier on staged files
- Single ESLint v9 flat config at the repo root covers all workspaces
- TypeScript strict mode with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `noImplicitOverride`
