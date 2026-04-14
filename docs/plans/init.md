# Monorepo Starter Kit Plan

## Context

Bootstrap a production-grade pnpm monorepo from an empty directory. The goal is a fully typed, linted, tested, and observable full-stack starter kit with shared schema contracts between the API and web app.

---

## Final Directory Structure

```
web-starterkit/
├── .husky/pre-commit
├── .gitignore
├── .prettierrc.json
├── docker-compose.yml
├── eslint.config.mjs
├── package.json                  # root – private, workspace scripts, lint-staged, husky
├── pnpm-workspace.yaml           # workspace globs + catalog versions
├── tsconfig.base.json            # strict TS base extended by all packages
├── apps/
│   ├── api/                      # NestJS v11 + TypeORM + PostgreSQL + Sentry
│   └── web/                      # React Router v7 (framework) + Vite v7 + Tailwind v4 + shadcn/ui + Sentry
│       └── app/components/ui/    # shadcn/ui components live here (not a separate workspace)
└── packages/
    └── interface/                 # zod v4 schemas → dual ESM+CJS build via tsup v8 (only shared package)
```

---

## Key Version Decisions

| Tool           | Version | Notes                                            |
| -------------- | ------- | ------------------------------------------------ |
| pnpm           | 10.x    | workspaces, no catalog needed for 3 packages     |
| Node.js        | 22.x    | LTS                                              |
| TypeScript     | ^5.8    | catalog                                          |
| Zod            | ^4.3    | catalog; 14x faster than v3                      |
| NestJS         | ^11.0   | requires CommonJS + emitDecoratorMetadata        |
| TypeORM        | ^0.3    | @nestjs/typeorm integration                      |
| React Router   | ^7.9    | framework mode (Remix merged in)                 |
| Vite           | ^7.3    | @react-router/dev Vite plugin                    |
| Tailwind CSS   | ^4.2    | CSS-first config (no tailwind.config.js)         |
| shadcn/ui      | 4.0 CLI | installed directly into apps/web (no --monorepo) |
| tsup           | ^8.5    | dual CJS+ESM+dts build for interface             |
| @sentry/nestjs | ^8.0    | instrument.ts pattern, setupNestErrorHandler     |
| @sentry/react  | ^8.0    | reactErrorHandler, browserTracingIntegration     |
| ESLint         | ^9.0    | flat config (eslint.config.mjs), defineConfig    |
| Husky          | ^9.0    | prepare: "husky", pnpm exec husky init           |
| lint-staged    | ^16.0   | root package.json lint-staged key                |

---

## Implementation Steps

### Step 1 – Root Scaffold

```bash
git init
```

Create these files manually:

**`pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

No `catalog` / `catalogs` entries — the monorepo only has 3 packages, so declaring shared versions directly in each `package.json` is simpler and more transparent. Catalogs are a pnpm convenience for larger repos with many duplicated deps.

**`package.json`** (root, private)

- Scripts: `dev` (parallel), `build`, `lint`, `lint:fix`, `format`, `format:check`, `type-check`, `prepare: "husky"`
- devDeps: `eslint ^9`, `@typescript-eslint/eslint-plugin ^8`, `@typescript-eslint/parser ^8`, `eslint-config-prettier ^10`, `prettier ^3`, `prettier-plugin-tailwindcss`, `husky ^9`, `lint-staged ^16`, `typescript ^5.8`
- `lint-staged`: `*.{ts,tsx,js,jsx,mjs}` → `["eslint --fix", "prettier --write"]`; `*.{json,css,md,yaml}` → `["prettier --write"]`

**`tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

**`eslint.config.mjs`**

- `defineConfig()` + `globalIgnores(["**/dist/**", "**/node_modules/**", "**/.react-router/**"])`
- Base rule set: `@typescript-eslint/recommended`, `no-explicit-any: error`, `consistent-type-imports`
- `parserOptions.projectService: true`
- NestJS override (files: `apps/api/**`): relax `no-unsafe-call/member-access` (decorator metadata)
- React override (files: `apps/web/**`): React-specific rules
- `eslintConfigPrettier` last

**`.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

**`docker-compose.yml`** – postgres:16-alpine on port 5432

```bash
pnpm install
pnpm exec husky init
# Edit .husky/pre-commit → "pnpm exec lint-staged"
```

---

### Step 2 – `packages/interface`

```bash
mkdir -p packages/interface/src/schemas
```

Key files:

- **`package.json`**: name `@starterkit/interface`, `exports` with `.` → CJS (`dist/index.js`) + ESM (`dist/index.mjs`) + types; deps: `zod: "catalog:"`; devDeps: `tsup ^8`, `typescript: "catalog:"`
- **`tsconfig.json`**: extends `../../tsconfig.base.json`, `composite: true`, `module: NodeNext`, `moduleResolution: NodeNext`
- **`tsup.config.ts`**: entry `src/index.ts`, format `["cjs","esm"]`, `dts: true`, `clean: true`, `treeshake: true`
- **`src/schemas/user.ts`**: `CreateUserSchema`, `UserSchema` with zod v4
- **`src/schemas/common.ts`**: `PaginationSchema`, `ApiResponseSchema` generic helper
- **`src/index.ts`**: re-exports all schemas

```bash
pnpm --filter @starterkit/interface build
# Verify: packages/interface/dist/{index.js,index.mjs,index.d.ts,index.d.mts}
```

---

### Step 3 – `apps/api`

```bash
cd apps
pnpm dlx @nestjs/cli@latest new api --skip-git --package-manager pnpm
cd ..
```

Replace/update generated files:

**`apps/api/package.json`**: name `@starterkit/api`

- deps: `@nestjs/{common,core,config,platform-express,typeorm} ^11`, `typeorm ^0.3`, `pg ^8`, `@sentry/nestjs ^8`, `@sentry/profiling-node ^8`, `@starterkit/interface: "workspace:*"`, `zod ^4`, `reflect-metadata`, `rxjs`
- devDeps: `@nestjs/{cli,schematics,testing} ^11`, `jest ^29`, `ts-jest ^29`, `@types/{node,express,jest,pg}`, `typescript ^5.8`

**`apps/api/tsconfig.json`**:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "composite": true,
    "incremental": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@starterkit/interface": ["../../packages/interface/src/index.ts"]
    }
  }
}
```

> NestJS **must** use CommonJS + emitDecoratorMetadata (not NodeNext).
> The `paths` alias resolves interface from source during dev (no rebuild needed).

**`apps/api/src/instrument.ts`** – `Sentry.init()` with `nodeProfilingIntegration`, `enabled: NODE_ENV === "production"`

**`apps/api/src/main.ts`** – import `"./instrument"` first; `ValidationPipe(whitelist, transform)`; `Sentry.setupNestErrorHandler(app)`

**`apps/api/src/app.module.ts`** – `SentryModule.forRoot()`, `ConfigModule.forRoot({isGlobal:true})`, `TypeOrmModule.forRootAsync()` with `configService.getOrThrow()`, `synchronize: NODE_ENV !== "production"`

**`apps/api/src/app.controller.ts`** – `GET /health` → `{ status: "ok", timestamp: ISO string }`

**`apps/api/.env`** (from `.env.example`): `DATABASE_HOST/PORT/USER/PASSWORD/NAME`, `SENTRY_DSN`, `NODE_ENV=development`, `PORT=3000`

---

### Step 4 – `apps/web`

```bash
cd apps
pnpm dlx create-react-router@latest web --no-git-init
cd ..
```

Replace/update generated files:

**`apps/web/package.json`**: name `@starterkit/web`

- deps: `react-router ^7`, `@react-router/{node,serve} ^7`, `@sentry/react ^8`, `@starterkit/interface: "workspace:*"`, `axios ^1.7`, `react ^19`, `react-dom ^19`, `zod ^4`
- devDeps: `vite ^7`, `@react-router/dev ^7`, `@tailwindcss/vite ^4`, `tailwindcss ^4`, `vite-tsconfig-paths ^5`, `typescript ^5.8`, `@types/react ^19`, `@types/react-dom ^19`

**`apps/web/tsconfig.json`**:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "composite": true,
    "paths": {
      "~/*": ["./app/*"],
      "@starterkit/interface": ["../../packages/interface/src/index.ts"]
    }
  },
  "include": ["app", "vite.config.ts", "react-router.config.ts"]
}
```

**`apps/web/vite.config.ts`**: plugins: `[tailwindcss(), reactRouter(), tsconfigPaths()]`

**`apps/web/react-router.config.ts`**: `{ ssr: true, buildDirectory: "build" }`

**`apps/web/app/app.css`**: Tailwind v4 CSS-first

```css
@import "tailwindcss";
@theme {
  --font-sans: "Inter", ...;
  --radius: 0.5rem;
}
```

**`apps/web/app/instrument.ts`** – `Sentry.init()` with `browserTracingIntegration`, `replayIntegration`, `enabled: import.meta.env.PROD`

**`apps/web/app/root.tsx`** – import `"./instrument"` first; standard React Router root with `ErrorBoundary` calling `Sentry.captureException`

**`apps/web/app/entry.client.tsx`** – `hydrateRoot` with `Sentry.reactErrorHandler` on `onUncaughtError/onCaughtError/onRecoverableError`

**`apps/web/app/lib/api.ts`** – axios instance with `VITE_API_BASE_URL` baseURL, request interceptor for Bearer token, response interceptor for 401 redirect

**`apps/web/.env`** (from `.env.example`): `VITE_SENTRY_DSN=`, `VITE_API_BASE_URL=http://localhost:3000`

---

### Step 5 – shadcn/ui

Run from within `apps/web` — no `--monorepo` flag, so components install directly into `apps/web/app/components/ui/`.

```bash
cd apps/web
pnpm dlx shadcn@latest init -t react-router
pnpm dlx shadcn@latest add button card
cd ../..
```

The CLI will prompt for:

- Style: Default (or New York)
- Base color: Slate
- CSS variables: Yes

This generates `apps/web/components.json` and writes component files to `apps/web/app/components/ui/`. No new workspace package is created. `packages/interface` remains the only shared package in the monorepo.

---

### Step 6 – Final Install and Verification

```bash
pnpm install

# Build interface (must precede app builds)
pnpm --filter @starterkit/interface build

# Type-check all workspaces
pnpm -r run type-check

# Lint + format check
pnpm lint
pnpm format:check

# First commit (triggers pre-commit hook)
git add .
git commit -m "chore: initialize monorepo starter kit"
```

---

### Step 7 – Runtime Tests

#### API

```bash
# Start PostgreSQL
docker compose up -d

# Start API
pnpm --filter @starterkit/api dev

# Verify health endpoint
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}

# Unit tests
pnpm --filter @starterkit/api test
```

#### Web (Playwright MCP)

```bash
# Start web app
pnpm --filter @starterkit/web dev
# App runs at http://localhost:5173
```

Use **Playwright MCP** (project-scope server required) to:

1. Navigate to `http://localhost:5173` — verify the home page renders without errors
2. Check browser console for no errors
3. Navigate to a nonexistent route — verify the ErrorBoundary renders

#### Web ↔ API Integration

Add a loader in `apps/web/app/routes/home.tsx`:

```ts
export async function loader() {
  const { data } = await apiClient.get<{ status: string }>("/health");
  return { apiStatus: data.status };
}
```

Use Playwright MCP to verify the page shows API status `"ok"`.

#### packages/interface Import Test

In `apps/api/src/app.service.ts`, import and use `CreateUserSchema` from `@starterkit/interface` to validate a DTO — confirm TypeScript resolves types correctly without errors.

In `apps/web/app/routes/home.tsx`, import `UserSchema` from `@starterkit/interface` — confirm Vite resolves the package and the page still renders.

---

## Critical Files Reference

| File                                | Why Critical                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm-workspace.yaml`               | Workspace topology + catalog version pinning                         |
| `tsconfig.base.json`                | Single source of TS strictness for all packages                      |
| `packages/interface/tsup.config.ts` | Dual CJS+ESM build enabling cross-runtime compatibility              |
| `packages/interface/package.json`   | `exports` field routes CJS (NestJS) vs ESM (Vite) consumers          |
| `apps/api/tsconfig.json`            | CommonJS + emitDecoratorMetadata (NestJS requirement)                |
| `apps/web/vite.config.ts`           | Plugin ordering: tailwindcss → reactRouter → tsconfigPaths           |
| `apps/api/src/instrument.ts`        | Must be first import in main.ts for Sentry to instrument all modules |
| `.husky/pre-commit`                 | Triggers lint-staged on every commit                                 |
| `eslint.config.mjs`                 | Flat config v9; NestJS and React overrides in one file               |

---

## Sentry Setup Note

Both apps initialize Sentry **conditionally** (`enabled: NODE_ENV/import.meta.env.PROD === production`). DSN values are in `.env` files (gitignored). Without a real DSN the apps still run normally — errors are logged to console in development.
