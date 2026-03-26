# CLAUDE.md — Furigana Project

Development guidance for working on the Furigana web application.

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

# Type-check + tsc
pnpm type-check

# Run unit and integration tests
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

# Run pre-commit checks
pnpm exec lint-staged
```

## Code Quality Workflow

**When changing code, always run this sequence:**

```bash
pnpm type-check    # TypeScript type checking
pnpm exec eslint . --fix  # Lint and auto-fix
pnpm test          # Unit and integration tests
pnpm exec playwright test # E2E tests (if touching routes/UI)
```

This ensures all changes meet type safety, code style, and functional requirements before committing.

## Project Structure

```
app/
├── instrument.ts            # Sentry initialization (imported first)
├── root.tsx                 # HTML shell, Layout, ErrorBoundary
├── entry.client.tsx         # Client hydration with Sentry callbacks
├── routes.ts                # Route config (React Router v7 framework mode)
├── app.css                  # Global styles, Tailwind v4 entrypoint
├── lib/
│   ├── axios/
│   │   └── instance.ts      # Axios client with auth token + 401 interceptor
│   └── utils.ts             # cn() helper (clsx + tailwind-merge)
├── components/
│   └── ui/                  # shadcn/ui components
├── routes/                  # Route components
├── schema/                  # Zod schemas for validation
├── services/                # Business logic (furigana processing, storage)
├── constants/               # App constants
├── test/                    # Test setup and utilities
├── public/                  # Static assets
└── api/                     # Backend API routes (if any)
```

## Technology Stack

- **Framework**: React Router v7 (SSR enabled)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Language**: TypeScript (strict mode with `exactOptionalPropertyTypes`)
- **Testing**: Vitest + Playwright
- **Code Quality**: ESLint + Prettier + Husky hooks
- **Data**: Turso (SQLite) for persistent storage
- **Monitoring**: Sentry for error tracking

## Domain Terms & Entities

See [Domain Terms](./rules/domain.md) for detailed definitions of core entities used in this project.

## Key Principles

1. **Type Safety First**: No `any`, no `as` casts. Use `satisfies` or proper generics.
2. **Test Everything**: Type-check, lint, and test before committing.
3. **React Modern**: Prefer hooks, transitions, and deferred updates over older patterns.
4. **Explicit Over Implicit**: Clear domain terms, obvious intent, minimal magic.
5. **Performance Matters**: Measure before optimizing; use profiling tools for data-heavy flows.

## Git Hooks

- **Pre-commit** (`.husky/pre-commit`): Runs `lint-staged` to lint and format staged files
- **Pre-push** (`.husky/pre-push`): Runs `pnpm type-check` and `pnpm test`

## CI/CD

Deployment and release workflows are configured via GitHub Actions. See `.github/workflows/` for details.

## Task Master

See [Task Master AI - Agent Integration Guide](../.taskmaster/CLAUDE.md) for detailed instructions when using task-master-ai.
