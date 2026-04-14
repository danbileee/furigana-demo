# @starterkit/api

NestJS v11 REST API with TypeORM, PostgreSQL, and Sentry error tracking.

## Stack

- **NestJS v11** — `NodeNext` module resolution
- **TypeORM v0.3** — PostgreSQL via `pg`
- **Sentry v10** — `@sentry/nestjs` with `@sentry/profiling-node`
- **class-validator** / **class-transformer** — request DTO validation
- **Zod v4** — shared schemas from `@starterkit/interface`
- **Jest v30** — unit and e2e tests

## Scripts

```bash
pnpm dev           # Watch mode (port 3000)
pnpm build         # Compile TypeScript to dist/
pnpm start         # Run compiled dist/main.js
pnpm type-check    # TypeScript check without emit
pnpm test          # Unit tests
pnpm test:watch    # Unit tests in watch mode
pnpm test:cov      # Unit tests with coverage report
pnpm test:e2e      # End-to-end tests (Supertest)
```

## Environment variables

Create `apps/api/.env`:

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

All required variables use `config.getOrThrow<T>()`, which causes the process to fail fast at startup if any are missing.

## Project structure

```
src/
├── instrument.ts       Sentry initialisation — MUST be first import in main.ts
├── main.ts             Bootstrap: CORS, global ValidationPipe, listen
├── app.module.ts       Root module: SentryModule, ConfigModule, TypeOrmModule
├── app.controller.ts   GET /health
└── app.service.ts      AppService.getHealth()

test/
├── app.e2e-spec.ts     Supertest e2e suite
└── jest-e2e.json       e2e Jest config
```

## Conventions

### NodeNext imports

All intra-package imports use explicit `.js` extensions (required by `NodeNext` module resolution). Jest strips these automatically via `moduleNameMapper`:

```typescript
import { AppService } from "./app.service.js";
```

### Sentry setup

`instrument.ts` must be the **first import** in `main.ts`. Unhandled exceptions are captured by `SentryGlobalFilter`, registered as `APP_FILTER` in `AppModule.providers`.

### Validation

Global `ValidationPipe` runs with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true`. DTO classes use `class-validator` decorators; shared shape contracts use Zod schemas from `@starterkit/interface`.

### TypeORM entities and migrations

- Entity files follow the `**/*.entity.ts` naming convention and are auto-discovered.
- `synchronize: true` is enabled in `development` only — use migrations in production.
- Migration files go in `src/migrations/`.

### Adding a feature module

```bash
npx nest generate module features/my-feature
npx nest generate controller features/my-feature
npx nest generate service features/my-feature
```

Add a `*.entity.ts` in the module directory — TypeORM will pick it up automatically.
