# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prerequisites

- **Node.js**: ≥22.0.0
- **pnpm**: ≥10.0.0

## Commands

```bash
# Install dependencies
pnpm install

# Development server (HMR on port 5173)
pnpm dev

# Production build to build/
pnpm build

# Serve the production build locally
pnpm start

# Type-check (react-router typegen + tsc)
pnpm type-check

# Run unit and integration tests (vitest)
pnpm test

# Run E2E tests (Playwright)
pnpm exec playwright test

# Debug E2E tests in headed mode
pnpm exec playwright test --headed

# Lint code
pnpm exec eslint .

# Fix lint errors
pnpm exec eslint . --fix

# Format code with Prettier
pnpm exec prettier --write .

# Run pre-commit checks (lint-staged)
pnpm exec lint-staged
```

## Project structure

```
app/
├── instrument.ts            Sentry initialization (imported first)
├── root.tsx                 HTML shell, Layout, ErrorBoundary
├── entry.client.tsx         Client hydration with Sentry callbacks
├── routes.ts                Route config (React Router framework mode)
├── app.css                  Global styles, Tailwind v4 entrypoint
├── lib/
│   ├── axios/
│   │   └── instance.ts      Axios client with auth token + 401 interceptor
│   └── utils.ts             cn() helper (clsx + tailwind-merge)
├── components/
│   └── ui/                  shadcn/ui components
├── routes/                  Route components
├── schema/                  Zod schemas
├── services/                Business logic (furigana, token storage)
├── constants/               App constants
├── test/                    Test setup and utilities
├── public/                  Static assets
└── api/                     Backend API routes (if any)
```

## Environment variables

Create `.env` in the project root:

```
VITE_SENTRY_DSN=
```

## React Router v7 frontend

- **SSR enabled** (`ssr: true` in `react-router.config.ts`). Routes are defined in `app/routes.ts` with the `@react-router/dev/routes` API.
- **Data fetching**: Use `loader` for SSR data and `clientLoader` for client-only fetches.
- **Sentry**: `instrument.ts` imported first in both `root.tsx` and `entry.client.tsx`. Use manual `captureException` in `hydrateRoot` error callbacks (avoids incompatibility with `exactOptionalPropertyTypes`).
- **API client**: `app/lib/axios/instance.ts` exports a pre-configured Axios instance with:
  - Base URL from `VITE_API_BASE_URL`
  - Authorization header with token from `localStorage`
  - Auto-redirect to `/login` on 401
- **shadcn/ui**: Components live in `app/components/ui/`. Add new ones with `pnpx shadcn@latest add <component> --defaults`.
- **Path alias**: `~/` maps to `app/` (defined in `tsconfig.json`).

## TypeScript configuration

- **Compiler**: `tsconfig.json` sets `moduleResolution: Bundler` (Vite target).
- **Strict mode**: Enables `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`.
- **Type imports**: ESLint enforces `consistent-type-imports` with inline style (`import type {}`).
- **No `any`, no `as` casts**: Use `satisfies` operator or proper generics instead.

## Testing

- **Unit & integration tests**: Vitest with v8 coverage provider (`vitest.config.ts`)
- **E2E tests**: Playwright configured in `playwright.config.ts` (run with `pnpm exec playwright test`)
- **Test files**: Co-located with source code using `.test.ts` or `.test.tsx` suffix
- **Coverage**: v8 provider enabled for detailed coverage reports

## ESLint & Prettier

- **Config**: Single flat config at `eslint.config.mjs`.
- **Prettier integration**: Runs last in the ESLint chain to disable conflicting formatting rules.
- **Pre-commit hooks**: `lint-staged` runs ESLint and Prettier on staged files via Husky.
- **Pre-push hooks**: Runs type-check and tests before push (`.husky/pre-push`).

## Git Hooks

- **Pre-commit** (`.husky/pre-commit`): Runs `lint-staged` to lint and format staged files
- **Pre-push** (`.husky/pre-push`): Runs `pnpm type-check` and `pnpm test` before pushing

## Task Master AI Instructions

**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
