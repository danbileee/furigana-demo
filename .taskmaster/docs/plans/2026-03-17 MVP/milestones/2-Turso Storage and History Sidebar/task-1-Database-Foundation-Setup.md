# Task 1: Database Foundation Setup

**Project**: Furigana MVP
**Generated**: 2026-03-26
**Source PRD**: `.taskmaster/docs/plans/2026-03-17 MVP/milestones/2-Turso Storage and History Sidebar/prd.md`
**Branch**: `feature/database-foundation-setup`

---

## Overview

This task establishes the complete database foundation for Milestone 2. It installs the
Turso/libSQL and Drizzle ORM packages, defines the `furiganas` table schema with a partial
unique index for cursor-based pagination, creates a server-only database client singleton
with fail-fast env-var validation, and configures `drizzle.config.ts` for versioned
migrations. No query functions are written here — those belong to Task 3. This task has zero
dependencies and is the critical-path blocker for every other M2 task.

---

## Requirements Analysis

### Functional Requirements

- Install `@libsql/client` (libSQL/Turso driver), `drizzle-orm` (≥0.30.0 for `.where()` on
  indexes), and `drizzle-kit` (migration CLI) as the correct dependency types.
- Define `app/lib/db/schema.ts` with a `furiganas` SQLite table containing exactly 7
  columns: `id`, `raw_text`, `raw_text_snippet`, `annotation_string`, `title`, `created_at`,
  `deleted_at` — with the correct nullability, types, and constraints specified in the PRD.
- Add a `UNIQUE` partial index `idx_furiganas_active_cursor` on `(created_at DESC, id DESC)
WHERE deleted_at IS NULL` using Drizzle's `.where(sql\`...\`)` API.
- Create `app/lib/db/client.ts` as a server-only singleton that calls `createClient()` from
  `@libsql/client` and wraps it with `drizzle()` from `drizzle-orm/libsql`.
- Implement startup validation in `client.ts` that throws a descriptive error if
  `TURSO_DATABASE_URL` is missing, and a separate error if `TURSO_AUTH_TOKEN` is missing and
  the URL does not start with `file:`.
- Configure `drizzle.config.ts` at the repo root for versioned migrations with
  `dialect: "turso"`, pointing to `app/lib/db/schema.ts` and a `drizzle/` output directory.
- Update `.env.example` to document both Turso env vars (they already exist in the file; no
  change needed).

### Non-Functional Requirements

- `client.ts` must be server-only — it must never be imported client-side. No
  `VITE_`-prefixed variables; all env access via `process.env["VAR"]`.
- The database client must be a module-level singleton to avoid creating a new connection on
  every server request in the SSR environment.
- Full TypeScript strict mode compliance: `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, no `any`, no `as` casts.
- The migration output directory (`drizzle/`) must be committed to the repository so the
  migration history is version-controlled, but the generated SQL files themselves are
  reviewed before applying.
- `drizzle-orm` must be pinned to a version that includes the new index API (≥0.30.0 for the
  `.where()` method on `uniqueIndex`/`index`). Given the known partial-index WHERE-clause
  migration bug (Issue #3349, unresolved as of August 2025), the WHERE clause in the schema
  definition must use `sql\`...\`` with literal SQL text — not parameterized column
  references — to ensure the generated migration SQL is valid.

### Dependencies & Constraints

- No internal task dependencies (Task 1 is the foundation).
- `zod` is already installed at `^4.0.0`. The `drizzle-zod` plugin (which handles
  `createInsertSchema`/`createSelectSchema`) requires careful version selection: `drizzle-zod
v0.8.1` added Zod v4 support, but has a known issue with the `./v4` specifier. Task 3
  (queries) will determine whether `drizzle-zod` is needed; this task does NOT install
  `drizzle-zod`. Zod schemas for DB input/output will be hand-written in Task 3 if needed.
- `drizzle-kit` is a dev-only CLI tool; it must be installed in `devDependencies`.
- `@libsql/client` and `drizzle-orm` are production runtime dependencies.
- Node.js ≥22.0.0 satisfies `@libsql/client`'s requirement of Node ≥18.
- The project uses ESM (`"type": "module"` in `package.json`), so `drizzle.config.ts` must
  use ESM `export default` syntax.

---

## Implementation Plan

### Phase 1: Install Dependencies

**Objective**: Add the three required packages to `package.json` and lock file.

#### Subtask 1.1: Install production dependencies

- Files to modify: `package.json`, `pnpm-lock.yaml` (auto-updated)
- Command:
  ```bash
  pnpm add @libsql/client drizzle-orm
  ```
- Key considerations:
  - `@libsql/client` and `drizzle-orm` go into `dependencies` (required at runtime during
    SSR).
  - Verify the installed `drizzle-orm` version is ≥0.30.0 after install. The npm registry
    shows the latest stable is `0.45.x` — this satisfies the constraint.
  - Do NOT add `drizzle-zod` at this stage.
- Acceptance criteria: `package.json` `dependencies` contains both packages; `pnpm install`
  runs cleanly; `pnpm type-check` still passes after install.

#### Subtask 1.2: Install dev dependency

- Files to modify: `package.json`, `pnpm-lock.yaml` (auto-updated)
- Command:
  ```bash
  pnpm add -D drizzle-kit
  ```
- Key considerations:
  - `drizzle-kit` is the migration CLI, only needed in development — it must not be in
    `dependencies`.
  - `drizzle-kit` and `drizzle-orm` should be kept at compatible versions (both from the
    same release cycle). The drizzle team ships them together.
- Acceptance criteria: `package.json` `devDependencies` contains `drizzle-kit`;
  `pnpm exec drizzle-kit --version` prints a version string.

---

### Phase 2: Create the Drizzle Schema

**Objective**: Define the `furiganas` table shape, nullability, and partial index in a
single schema file that Drizzle Kit and the query builder both read.

#### Subtask 2.1: Create `app/lib/db/schema.ts`

- Files to create: `app/lib/db/schema.ts`
- Code pattern: See **Code Patterns — Pattern 1** below.
- Key considerations:
  - Use `sqliteTable` from `drizzle-orm/sqlite-core`. Do NOT use `pgTable` or `mysqlTable`.
  - All 7 columns must match the PRD exactly:
    - `id`: `text("id").primaryKey()` — TEXT PRIMARY KEY, no autoincrement.
    - `raw_text`: `text("raw_text").notNull()` — TEXT NOT NULL.
    - `raw_text_snippet`: `text("raw_text_snippet").notNull()` — TEXT NOT NULL, no default
      (computed at insert time in the query layer, not in SQL).
    - `annotation_string`: `text("annotation_string").notNull()` — TEXT NOT NULL.
    - `title`: `text("title")` — nullable by default in Drizzle (no `.notNull()`), no
      default (remains NULL until M4).
    - `created_at`: `text("created_at").notNull()` — TEXT NOT NULL.
    - `deleted_at`: `text("deleted_at")` — nullable, no default.
  - The partial unique index must use `uniqueIndex("idx_furiganas_active_cursor")` with
    `.on(table.createdAt, table.id)` and `.where(sql\`${table.deletedAt} IS NULL\`)`.
  - **Critical**: Due to the known Drizzle bug (Issue #3349) where parameterized WHERE
    clauses in index definitions generate invalid migration SQL with `$1` placeholders, use
    the column reference form `sql\`${table.deletedAt} IS NULL\``rather than a raw string.
In Drizzle's SQLite dialect, column references inside`sql\`\``are rendered as column
names (not parameters), so this generates valid SQL:`WHERE "deleted_at" IS NULL`.
After running `drizzle-kit generate`, manually verify the output SQL contains
`WHERE "deleted_at" IS NULL`(not`WHERE $1`). If the placeholder appears, the workaround
is to use `sql\`deleted_at IS NULL\`` (bare string, no interpolation).
  - Export both the table object (`furiganas`) and its inferred TypeScript types
    (`type Furigana` and `type NewFurigana`) for use in the query layer.
  - The second argument to `sqliteTable` is the columns object. The third argument (or the
    new `(table) => [...]` callback form used in Drizzle ≥0.30.0) is for indexes. Use the
    callback form.
- Acceptance criteria:
  - `pnpm type-check` passes with no errors on `schema.ts`.
  - `typeof furiganas.$inferSelect` resolves to an object with all 7 fields and correct
    TypeScript types (string for all columns, `string | null` for nullable ones).

---

### Phase 3: Create the Database Client

**Objective**: Build the server-only Turso/libSQL client singleton with fail-fast
environment variable validation, following the exact same pattern as `app/lib/ai/client.ts`.

#### Subtask 3.1: Create `app/lib/db/client.ts`

- Files to create: `app/lib/db/client.ts`
- Code pattern: See **Code Patterns — Pattern 2** below.
- Key considerations:
  - Import `createClient` from `@libsql/client` and `drizzle` from `drizzle-orm/libsql`.
  - Read `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` via `process.env["TURSO_DATABASE_URL"]`
    and `process.env["TURSO_AUTH_TOKEN"]` — never `import.meta.env.*`.
  - Validation logic (executed at module import time, before the singleton is created):
    1. If `TURSO_DATABASE_URL` is `undefined` or empty string: throw with message
       `"Missing required environment variable: TURSO_DATABASE_URL. Set it in .env or your deployment config."`.
    2. If `TURSO_AUTH_TOKEN` is `undefined` AND the URL does not start with `"file:"`:
       throw with message `"Missing required environment variable: TURSO_AUTH_TOKEN. Set it in .env or your deployment config. (TURSO_AUTH_TOKEN may be empty for file: URLs.)"`.
    3. If `TURSO_AUTH_TOKEN` is `undefined` AND the URL starts with `"file:"`: continue
       without error (local SQLite file, no auth needed). Pass `authToken: ""` to
       `createClient`.
  - The exported `db` is the Drizzle instance wrapping the libSQL client — this is the
    object query functions import and call.
  - Pass `{ schema }` as the second argument to `drizzle()` so Drizzle can infer relational
    query types (used by Tasks 3+).
  - This file should have a comment at the top: `// Server-only — never import in client
bundles`.
  - Following the pattern in `app/lib/ai/client.ts`, the validation and `createClient()` call
    happen at module top-level (not inside a function), so any misconfiguration crashes the
    server at startup rather than at first query.
- Acceptance criteria:
  - `pnpm type-check` passes on `client.ts`.
  - Unit tests pass (see Test Cases section).
  - The exported `db` object has the correct Drizzle type inferred from the schema.

---

### Phase 4: Configure Drizzle Kit

**Objective**: Create `drizzle.config.ts` so `pnpm exec drizzle-kit generate` knows where
the schema is, what dialect to use, and where to output migration files.

#### Subtask 4.1: Create `drizzle.config.ts` at repo root

- Files to create: `drizzle.config.ts` (repo root, same level as `package.json`)
- Code pattern: See **Code Patterns — Pattern 3** below.
- Key considerations:
  - Use `dialect: "turso"` (not `"sqlite"`). The Turso dialect in Drizzle Kit handles
    both local `file:` URLs and remote `libsql://` URLs.
  - The `schema` path must point to `"./app/lib/db/schema.ts"` (relative to repo root).
  - The `out` directory should be `"./drizzle"` — a `drizzle/` folder at the repo root
    that will contain numbered migration SQL files and the `meta/` snapshot directory.
    Commit this folder to the repository for migration history tracking.
  - `dbCredentials` reads from `process.env` at config-read time. The `url` field is
    required; `authToken` is optional for `file:` URLs.
  - Use `defineConfig` from `drizzle-kit` for type-safe configuration.
  - Since `package.json` has `"type": "module"`, the `drizzle.config.ts` file uses ESM
    syntax (already the default for `.ts` files transpiled by `drizzle-kit`'s built-in tsx).
  - Do NOT add the `drizzle/` output directory to `.gitignore` — migration files must be
    committed.
- Acceptance criteria:
  - `pnpm exec drizzle-kit generate` runs without errors (requires `TURSO_DATABASE_URL` in
    `.env`).
  - The `drizzle/` directory is created with a `0000_*.sql` file and a `meta/` subdirectory.
  - The generated SQL contains `CREATE TABLE \`furiganas\`` with all 7 columns.
  - The generated SQL contains `CREATE UNIQUE INDEX \`idx_furiganas_active_cursor\``with`WHERE "deleted_at" IS NULL`.

---

### Phase 5: Verify Migration Output

**Objective**: Run `drizzle-kit generate` and inspect the generated SQL to confirm
correctness before any code uses the database.

#### Subtask 5.1: Run migration generation and verify SQL

- No code files to modify; this is a verification step.
- Commands:
  ```bash
  # Ensure TURSO_DATABASE_URL is set in .env (file:local.db works for local dev)
  pnpm exec drizzle-kit generate
  ```
- Checks to perform on the generated SQL file in `drizzle/`:
  1. `CREATE TABLE \`furiganas\`` is present.
  2. All 7 columns appear with correct SQL types and `NOT NULL` / nullable markers.
  3. `id TEXT PRIMARY KEY` is present.
  4. `CREATE UNIQUE INDEX \`idx_furiganas_active_cursor\`` is present.
  5. The index SQL includes `ON \`furiganas\`(\`created_at\` desc,\`id\` desc)`.
  6. The index SQL includes `WHERE \`deleted_at\` IS NULL`(or`WHERE "deleted_at" IS NULL`).
  7. No `$1` placeholder appears in the WHERE clause.
- If check 7 fails (placeholder bug): change the schema to use `sql\`deleted_at IS NULL\``(bare string, no column reference interpolation) in the`.where()`call, then re-run`drizzle-kit generate` and verify again.
- Acceptance criteria: All 7 checks pass on the generated SQL.

---

### Phase 6: Write Unit Tests

**Objective**: Cover schema definition correctness and client startup validation with focused
unit tests. Phase 1 tests (schema structural verification and high-priority client edge cases)
are the highest-value tests and must be completed before marking this task done. Phase 2
(migration SQL snapshot guard) is a long-term investment that prevents the Drizzle Issue
#3349 bug from silently regressing.

#### Subtask 6.1: Create `app/lib/db/schema.test.ts`

- Files to create: `app/lib/db/schema.test.ts`
- Key considerations:
  - Tests in this file are purely structural — they verify that the exported schema object
    has the correct column definitions without needing a real database connection.
  - Use `getTableColumns` from `drizzle-orm` to inspect the column map.
  - Use `getTableConfig` from `drizzle-orm/sqlite-core` to inspect indexes.
  - Target: 10 tests covering column structure, index structure, table naming, and type
    assertions. See Test Cases section for the full list.

#### Subtask 6.2: Create `app/lib/db/client.test.ts`

- Files to create: `app/lib/db/client.test.ts`
- Key considerations:
  - Follow the exact same `vi.resetModules()` + dynamic `import()` pattern from
    `app/lib/ai/client.test.ts`.
  - Save and restore all env vars touched by the tests in `beforeEach`/`afterEach`.
  - Mock `@libsql/client` with `vi.mock()` to prevent actual network/filesystem connections
    during unit tests. The mock just needs to return a dummy client object — the tests care
    about the validation logic, not the Drizzle instance itself.
  - Target: 10 tests covering all validation branches, including the edge cases identified
    by the test-enhancer (whitespace-only URL, empty-string authToken for `file:`, non-file
    schemes without token). See Test Cases section for the full list.

#### Subtask 6.3: Create `app/lib/db/migration.test.ts` (Phase 2 — migration guard)

- Files to create: `app/lib/db/migration.test.ts`
- Key considerations:
  - This test reads the generated SQL file from `drizzle/0000_*.sql` using Node `fs` and
    asserts its structure in automated form, complementing the manual Phase 5 verification.
  - This is a snapshot-style integration test that guards against the Drizzle Issue #3349
    `$1` placeholder regression after future `drizzle-kit generate` runs.
  - The test suite skips gracefully if no migration file exists yet (e.g., in CI before
    `drizzle-kit generate` has been run), rather than failing.
  - Target: 5 tests. See Test Cases section for the full list.
  - This subtask is lower priority than 6.1 and 6.2 — complete it after the schema and
    client tests pass.

---

## Third-Party Integration Research

### `drizzle-orm` v0.45.x (latest: v0.45.1)

- **Official docs**: [https://orm.drizzle.team/docs/connect-turso](https://orm.drizzle.team/docs/connect-turso), [https://orm.drizzle.team/docs/column-types/sqlite](https://orm.drizzle.team/docs/column-types/sqlite)
- **Recent changes**: v0.45.x is the latest stable (3 months ago as of March 2026). The v1.0.0-beta track is under active development but not used here. LibSQL batch API support was added; libSQL migrations now use batch execution. `drizzle-kit` normalizes SQLite URLs for both `libsql:` and `file:` prefixes.
- **Open issues / known bugs**: GitHub Issue #3349 — "Partial unique index migration does not generate valid WHERE clause" — is **unresolved as of August 2025**. When using parameterized column references inside `.where()` on an index definition, `drizzle-kit generate` can emit `WHERE $1` instead of the column name. The workaround is to use the `sql` template tag with a column reference (`sql\`${table.deletedAt} IS NULL\``) which renders as a column name in SQLite, or fall back to a bare string `sql\`deleted_at IS NULL\``if the reference form still generates a placeholder. This must be verified after running`drizzle-kit generate`.
- **Security advisories**: None found.
- **Performance notes**: Single partial index replacing two separate indexes reduces write overhead on INSERT/UPDATE. For a single-user MVP with low write volume, this is not a concern.
- **Case studies**: Drizzle + Turso is the recommended combination in Turso's own documentation. Widely adopted in the Next.js/React Router ecosystem for serverless SQLite.

> ⚠️ **Needs Review**: The partial index WHERE clause migration bug (Issue #3349) is unresolved. After running `drizzle-kit generate`, manually inspect the output SQL in `drizzle/` to confirm `WHERE \`deleted_at\` IS NULL`was rendered correctly. If`WHERE $1` appears instead, switch the `.where()` argument from `sql\`${table.deletedAt} IS NULL\``to`sql\`deleted_at IS NULL\`` (bare SQL string, no column interpolation) and regenerate. Do not proceed to Task 3 until the generated migration SQL is verified correct.

---

### `drizzle-kit` v0.45.x (matches drizzle-orm)

- **Official docs**: [https://orm.drizzle.team/docs/drizzle-config-file](https://orm.drizzle.team/docs/drizzle-config-file)
- **Recent changes**: Dialect `"turso"` is the correct value for both local `file:` and remote `libsql://` Turso databases. The `out` directory defaults to `"drizzle"` if omitted.
- **Open issues / known bugs**: Same Issue #3349 applies (see above).
- **Security advisories**: None found.
- **Performance notes**: N/A (dev-only tool).
- **Case studies**: N/A.

---

### `@libsql/client` v0.17.x (latest: v0.17.2)

- **Official docs**: [https://docs.turso.tech/sdk/ts/reference](https://docs.turso.tech/sdk/ts/reference)
- **Recent changes**: Node 18+ required (project uses ≥22, safe). The `libsql:` URL now uses HTTP instead of WebSockets by default. `Value` type now includes `bigint` (no impact on this task — all columns are `text`). The `./hrana` import was removed; `./ws` is now used for WebSocket-only access (not relevant for default `createClient` usage).
- **Open issues / known bugs**: None directly relevant to schema/client initialization.
- **Security advisories**: None found.
- **Performance notes**: The client reuses connections for local database access for improved performance. For SSR, the module-level singleton pattern ensures a single client instance per server process.
- **Case studies**: Official Turso + Drizzle guide at `docs.turso.tech` uses exactly the `createClient` + `drizzle` pattern described in this plan.

---

### `drizzle-zod` (NOT installed in this task)

- This task deliberately omits `drizzle-zod`. The project already uses `zod@^4.0.0`, and
  `drizzle-zod v0.8.1` introduced Zod v4 support but has reported issues with the `./v4`
  specifier and branded types. Since Task 1 only requires schema and client setup (no Zod
  validation of DB input/output yet), deferring this decision to Task 3 avoids introducing
  a risky dependency before it is needed. Task 3's plan should re-evaluate whether to use
  `drizzle-zod` or hand-write Zod schemas from the inferred Drizzle types.

> ⚠️ **Needs Review**: When Task 3 adds `drizzle-zod`, verify that `drizzle-zod v0.8.1+` works with the project's `zod@^4.0.0`. Run a basic `createInsertSchema(furiganas)` and confirm the returned schema has no `any` types and that `pnpm type-check` passes. If the `./v4` specifier issue appears, the fallback is to write manual Zod schemas using `furiganas.$inferInsert` and `furiganas.$inferSelect` as the source of truth.

---

## Code Patterns

### Pattern 1: `app/lib/db/schema.ts` — Table Definition with Partial Index

```typescript
import { sql } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema for the furiganas table.
 *
 * Column decisions:
 * - All timestamps are ISO 8601 TEXT strings for human readability.
 * - raw_text_snippet is stored (not computed) to avoid SUBSTR on list queries.
 * - title and deleted_at are nullable from the start for M4 and M6 readiness.
 * - id is TEXT UUID (not INTEGER) because it appears in the URL path.
 */
export const furiganas = sqliteTable(
  "furiganas",
  {
    id: text("id").primaryKey(),
    rawText: text("raw_text").notNull(),
    rawTextSnippet: text("raw_text_snippet").notNull(),
    annotationString: text("annotation_string").notNull(),
    title: text("title"),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    // Unique partial index for cursor-based pagination.
    // Covers only active (non-deleted) rows.
    // Replaces two separate indexes (cursor + deleted_at filter).
    uniqueIndex("idx_furiganas_active_cursor")
      .on(table.createdAt, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** Full row shape as returned by SELECT queries. */
export type Furigana = typeof furiganas.$inferSelect;

/** Shape expected for INSERT operations (all fields required at insert time). */
export type NewFurigana = typeof furiganas.$inferInsert;
```

**Where to apply**: `app/lib/db/schema.ts` only.

**Why this pattern**:

- `sqliteTable` from `drizzle-orm/sqlite-core` targets the SQLite dialect used by libSQL/Turso.
- The callback form `(table) => [...]` for the third argument (indexes/constraints) is the
  current Drizzle API (≥0.30.0). The older object form is deprecated.
- Column names use camelCase property names (`rawText`) mapping to snake_case SQL column
  names (`raw_text`). This keeps TypeScript idiomatic while respecting SQL conventions.
- `text("deleted_at")` with no `.notNull()` gives `string | null` in the TypeScript type —
  correct for a nullable soft-delete field.
- Exporting `Furigana` and `NewFurigana` types here (derived from `$inferSelect` /
  `$inferInsert`) lets query functions in Task 3 use precise types without any `as` casts.

> Note: If `drizzle-kit generate` emits `WHERE $1` (the known bug), change the `.where()`
> argument to `sql\`deleted_at IS NULL\`` (no column interpolation):
>
> ```typescript
> .where(sql`deleted_at IS NULL`)
> ```

---

### Pattern 2: `app/lib/db/client.ts` — Server-Only Client Singleton

```typescript
// Server-only — never import in client bundles
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env["TURSO_DATABASE_URL"];
const authToken = process.env["TURSO_AUTH_TOKEN"];

if (!url) {
  throw new Error(
    "Missing required environment variable: TURSO_DATABASE_URL. " +
      "Set it in .env or your deployment config.",
  );
}

if (authToken === undefined && !url.startsWith("file:")) {
  throw new Error(
    "Missing required environment variable: TURSO_AUTH_TOKEN. " +
      "Set it in .env or your deployment config. " +
      "(TURSO_AUTH_TOKEN may be omitted for file: URLs.)",
  );
}

const client = createClient({
  url,
  authToken: authToken ?? "",
});

export const db = drizzle({ client, schema });
```

**Where to apply**: `app/lib/db/client.ts` only.

**Why this pattern**:

- Mirrors the fail-fast pattern in `app/lib/ai/client.ts` (module-level throw, not a
  lazy getter).
- The `authToken === undefined` check (not `!authToken`) intentionally allows an empty
  string `""` for `TURSO_AUTH_TOKEN` when using `file:` URLs locally — an empty string is
  a valid no-auth configuration for libSQL's local file driver.
- `url.startsWith("file:")` is the correct test for local SQLite files (`file:local.db`,
  `file::memory:`, etc.).
- Passing `schema` to `drizzle()` enables relational query syntax (`db.query.furiganas`)
  used in Task 3. It does not affect plain `db.select()` / `db.insert()` calls.
- `createClient` is called once at module load time; the resulting `db` is re-used for
  every request in the SSR process.

---

### Pattern 3: `drizzle.config.ts` — Migration Configuration

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso",
  schema: "./app/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env["TURSO_DATABASE_URL"] ?? "file:local.db",
    authToken: process.env["TURSO_AUTH_TOKEN"],
  },
});
```

**Where to apply**: `drizzle.config.ts` at the repo root only.

**Why this pattern**:

- `dialect: "turso"` is required for Turso databases (both local file and remote libsql://).
- `out: "./drizzle"` stores versioned migration SQL and snapshot files in `drizzle/` at
  the repo root — committed to git for migration history.
- The `"file:local.db"` fallback in `url` allows `drizzle-kit generate` to run locally
  without the env var set, useful for CI or offline development. The generated SQL is
  dialect-agnostic (SQLite), so the actual runtime URL does not affect migration generation.
- `authToken` is `undefined` when unset — Drizzle Kit accepts `undefined` for `authToken`
  in local-file mode.

---

## Test Cases

Tests are organized into three files with a total target of ~21 tests. Phase 1 tests
(schema structural tests and client edge cases) are highest priority. The migration guard
(Phase 2) is a long-term investment.

---

### Unit Tests

#### Test Suite: `app/lib/db/schema.test.ts` — Schema Structure (10 tests)

**Test 1**: All 7 columns are present in the table definition

- **Given**: The `furiganas` table is imported from `~/lib/db/schema`
- **When**: `getTableColumns(furiganas)` is called
- **Then**: The returned object has exactly the keys `id`, `rawText`, `rawTextSnippet`,
  `annotationString`, `title`, `createdAt`, `deletedAt`
- **Coverage**: Detects if a column is accidentally omitted or renamed; strict key enumeration
  is stronger than a count check and already guards against silent additions

**Test 2**: Table name is exactly "furiganas" (HIGH PRIORITY)

- **Given**: The `furiganas` table is imported
- **When**: `getTableConfig(furiganas).name` is evaluated
- **Then**: The value equals `"furiganas"` exactly
- **Coverage**: A wrong table name causes every query to fail with "no such table"; catching
  it at test time is far cheaper than a runtime failure in production

**Test 3**: `id` is defined as primary key with TEXT type

- **Given**: The `furiganas` table is imported
- **When**: `getTableColumns(furiganas).id` is inspected
- **Then**: The column has `dataType === "text"` and `primary === true`
- **Coverage**: Ensures UUID primary key, not INTEGER autoincrement

**Test 4**: Non-nullable columns are marked NOT NULL

- **Given**: The `furiganas` table is imported
- **When**: `getTableColumns(furiganas)` is inspected for each NOT NULL column
- **Then**: `rawText.notNull === true`, `rawTextSnippet.notNull === true`,
  `annotationString.notNull === true`, `createdAt.notNull === true`
- **Coverage**: Detects if `.notNull()` is accidentally removed, which would allow NULL
  insertion and break downstream query assumptions

**Test 5**: Nullable columns have no NOT NULL constraint

- **Given**: The `furiganas` table is imported
- **When**: `getTableColumns(furiganas).title` and `.deletedAt` are inspected
- **Then**: `title.notNull === false` (or `undefined`), `deletedAt.notNull === false`
- **Coverage**: Ensures M4 title and M6 soft-delete columns accept NULL as intended

**Test 6**: All columns have TEXT data type

- **Given**: The `furiganas` table is imported
- **When**: `dataType` is checked for all 7 columns
- **Then**: Every column has `dataType === "text"` (no integer, blob, etc.)
- **Coverage**: Confirms ISO 8601 timestamp storage and UUID primary key are TEXT

**Test 7**: The partial index is defined with the correct name and uniqueness

- **Given**: The `furiganas` table is imported
- **When**: `getTableConfig(furiganas).indexes` is inspected
- **Then**: One index exists with `name === "idx_furiganas_active_cursor"` and
  `unique === true`
- **Coverage**: Detects index name typos or missing index definition

**Test 8**: The partial index covers the correct columns in DESC order (HIGH PRIORITY)

- **Given**: The `furiganas` table is imported
- **When**: The index columns from `getTableConfig(furiganas).indexes[0]` are inspected
- **Then**: The index has exactly 2 columns — `created_at` and `id` — both with
  `order: "desc"` (or equivalent representation in `getTableConfig` output)
- **Coverage**: Validates the cursor pagination contract; wrong column order or missing DESC
  would silently produce incorrect pagination results — this is the exact risk surface of
  Issue #3349 on the runtime side

**Test 9**: The partial index has a WHERE clause (HIGH PRIORITY)

- **Given**: The `furiganas` table is imported
- **When**: The index configuration from `getTableConfig(furiganas)` is inspected for the
  `idx_furiganas_active_cursor` index
- **Then**: The index object has a `where` property that is not `undefined` or `null`
- **Coverage**: Ensures the partial aspect of the index is present; without the WHERE clause
  the index becomes a full unique index that would reject all soft-deletes after the first
  one (since `deleted_at` would be duplicated)

**Test 10**: `Furigana` type has correct shape and `NewFurigana` type is exported
(HIGH PRIORITY)

- **Given**: The `Furigana` and `NewFurigana` types are imported
- **When**: Compile-time type assertions are written
- **Then**:
  - `Furigana` satisfies `{ id: string; rawText: string; rawTextSnippet: string; annotationString: string; title: string | null; createdAt: string; deletedAt: string | null }`
  - `NewFurigana` is assignable from an object with at least `{ id: string; rawText: string; rawTextSnippet: string; annotationString: string; createdAt: string }` (nullable columns are optional on insert)
- **Coverage**: Compile-time guard against type regressions on both read and write paths.
  These types derive from Drizzle's `$inferSelect`/`$inferInsert` and will persist across
  Task 3's Zod additions (which will be derived from these inferred types, not replace them).
  When columns are added in future tasks, updating this assertion is trivial and expected.

---

#### Test Suite: `app/lib/db/client.test.ts` — Client Startup Validation (10 tests)

**Note**: Client suite remains at 10 tests (unchanged from test-enhancer recommendations).

**Setup note**: All tests in this suite use `vi.resetModules()` in `beforeEach` and
`vi.mock("@libsql/client")` to intercept `createClient` so no real database connection is
made. This follows the exact pattern in `app/lib/ai/client.test.ts`.

**Test 1**: Throws when `TURSO_DATABASE_URL` is undefined

- **Given**: `TURSO_DATABASE_URL` is deleted from `process.env`
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: The import rejects with an error containing `"TURSO_DATABASE_URL"`
- **Coverage**: Fail-fast on missing URL prevents cryptic "invalid URL" errors at first query

**Test 2**: Throws when `TURSO_DATABASE_URL` is an empty string

- **Given**: `process.env["TURSO_DATABASE_URL"] = ""`
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: The import rejects with an error containing `"TURSO_DATABASE_URL"`
- **Coverage**: Empty string is not a valid URL; fail-fast applies

**Test 3**: Throws when `TURSO_DATABASE_URL` is whitespace only (HIGH PRIORITY)

- **Given**: `process.env["TURSO_DATABASE_URL"] = "   "` (spaces only)
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: The import rejects with an error containing `"TURSO_DATABASE_URL"`
- **Coverage**: A whitespace-only string passes `!url` (truthy) but is not a valid URL —
  catches the edge case where `"   "` would silently proceed past the empty-string guard
  and produce an unreadable `createClient` error at runtime

**Test 4**: Throws when `TURSO_AUTH_TOKEN` is undefined and URL is a remote libsql URL

- **Given**: `process.env["TURSO_DATABASE_URL"] = "libsql://test.turso.io"`;
  `TURSO_AUTH_TOKEN` is deleted
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: The import rejects with an error containing `"TURSO_AUTH_TOKEN"`
- **Coverage**: Remote Turso databases always require an auth token

**Test 5**: Throws when `TURSO_AUTH_TOKEN` is undefined and URL uses a non-file scheme
(HIGH PRIORITY)

- **Given**: `process.env["TURSO_DATABASE_URL"] = "https://example.turso.io"`;
  `TURSO_AUTH_TOKEN` is deleted from `process.env`
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: The import rejects with an error containing `"TURSO_AUTH_TOKEN"`
- **Coverage**: Non-`file:` schemes should always require auth regardless of the specific
  protocol (`https:`, `libsql:`, `wss:`); this test guards against inadvertently tightening
  the check to only match `"libsql:"` scheme

**Test 6**: Does NOT throw when `TURSO_AUTH_TOKEN` is undefined and URL starts with `file:`

- **Given**: `process.env["TURSO_DATABASE_URL"] = "file:local.db"`;
  `TURSO_AUTH_TOKEN` is deleted from `process.env`
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: The import resolves without throwing; the `db` export is defined
- **Coverage**: Local development with SQLite files must work without an auth token

**Test 7**: Does NOT throw when `TURSO_AUTH_TOKEN` is undefined and URL starts with `file:`
(in-memory variant)

- **Given**: `process.env["TURSO_DATABASE_URL"] = "file::memory:"`;
  `TURSO_AUTH_TOKEN` is deleted from `process.env`
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: The import resolves without throwing; the `db` export is defined
- **Coverage**: In-memory SQLite is a common test/CI pattern; confirms the `file:` prefix
  check handles the `:memory:` variant

**Test 8**: Does NOT throw when `TURSO_AUTH_TOKEN` is an empty string and URL is `file:`
(HIGH PRIORITY)

- **Given**: `process.env["TURSO_DATABASE_URL"] = "file:local.db"`;
  `process.env["TURSO_AUTH_TOKEN"] = ""`
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: The import resolves without throwing; the `db` export is defined
- **Coverage**: Empty string auth token is explicitly allowed per the client.ts validation
  rules; an overly strict check treating `""` as falsy would break this scenario

**Test 9**: Exports a `db` object when both env vars are valid

- **Given**: `process.env["TURSO_DATABASE_URL"] = "libsql://test.turso.io"`;
  `process.env["TURSO_AUTH_TOKEN"] = "test-token"`; `@libsql/client` is mocked
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: The `db` export is not `null` / `undefined`
- **Coverage**: Happy path — confirms no import-time error when configuration is complete

**Test 10**: Calls `createClient` with the URL from env

- **Given**: Valid env vars set; `createClient` spy is captured from the mock
- **When**: `import("~/lib/db/client")` is awaited
- **Then**: `createClient` was called exactly once with `{ url: "libsql://test.turso.io",
authToken: "test-token" }`
- **Coverage**: Confirms env var values are forwarded to the driver, not hardcoded

---

### Migration Guard Tests

#### Test Suite: `app/lib/db/migration.test.ts` — SQL Snapshot Verification (5 tests)

**Setup note**: These tests read the generated SQL file from `drizzle/0000_*.sql` at test
time using Node `fs`. If no migration file exists yet, all tests in this suite skip
gracefully with `test.skipIf`. This prevents CI failures before the first
`drizzle-kit generate` run while still providing automated verification once the file exists.

This suite automates the manual checks from Phase 5 (Subtask 5.1), ensuring that any future
`drizzle-kit generate` run that accidentally re-introduces the `$1` placeholder bug is
caught before it reaches a PR review.

**Test 1**: Migration file exists and is readable

- **Given**: `drizzle/` directory at the repo root
- **When**: The test suite initializes
- **Then**: At least one `*.sql` file exists in `drizzle/`; if none exist, all tests in
  this suite are skipped with a descriptive message
- **Coverage**: Guards the rest of the suite against false-positive passes on clean checkouts

**Test 2**: Generated SQL contains the `furiganas` table

- **Given**: The `0000_*.sql` file content is read
- **When**: The content is checked for `CREATE TABLE`
- **Then**: The SQL contains `CREATE TABLE` followed by `furiganas` (backtick-quoted or
  double-quoted)
- **Coverage**: Confirms Drizzle Kit picked up the schema and generated a table

**Test 3**: Generated SQL lists all 7 columns

- **Given**: The migration SQL content
- **When**: All 7 column names are searched for: `id`, `raw_text`, `raw_text_snippet`,
  `annotation_string`, `title`, `created_at`, `deleted_at`
- **Then**: Each of the 7 names appears at least once in the SQL
- **Coverage**: Detects column omissions before they cause runtime errors on first INSERT

**Test 4**: Generated SQL contains the partial index with DESC order

- **Given**: The migration SQL content
- **When**: The content is checked for the index definition
- **Then**: The SQL contains `CREATE UNIQUE INDEX` with `idx_furiganas_active_cursor`,
  `ON` a table with `furiganas`, and column references with `desc` (case-insensitive)
- **Coverage**: Validates that the cursor pagination index was generated with the correct
  columns and sort order

**Test 5**: Generated SQL does NOT contain the `$1` placeholder in the WHERE clause
(HIGH PRIORITY — Drizzle Issue #3349 regression guard)

- **Given**: The migration SQL content
- **When**: The WHERE clause of the `idx_furiganas_active_cursor` index is extracted
- **Then**: The WHERE clause does NOT contain `$1` and DOES contain `deleted_at`
- **Coverage**: Directly guards against the Drizzle Issue #3349 bug re-emerging after any
  future `drizzle-kit generate` run; a `$1` placeholder in the migration would cause SQLite
  to reject the index creation at migration time with a cryptic "near `$1`: syntax error"

---

### Integration Tests

No integration tests in this task. All DB operations (INSERT, SELECT) are implemented in
Task 3. Integration tests that verify real SQLite file reads/writes belong there.

---

### E2E Tests

No E2E tests in this task. The schema and client are infrastructure; they have no user-facing
surface to test via Playwright.

---

## Implementation Checklist

- [x] Phase 1.1: `pnpm add @libsql/client drizzle-orm` — production deps installed
- [x] Phase 1.2: `pnpm add -D drizzle-kit` — dev dep installed
- [x] Phase 1.3: Verify `drizzle-orm` version ≥0.30.0 in `pnpm-lock.yaml`
- [ ] Phase 2.1: `app/lib/db/schema.ts` created with all 7 columns and partial index
- [ ] Phase 2.2: `pnpm type-check` passes after schema creation
- [ ] Phase 3.1: `app/lib/db/client.ts` created with startup validation
- [ ] Phase 3.2: `pnpm type-check` passes after client creation
- [ ] Phase 4.1: `drizzle.config.ts` created at repo root
- [ ] Phase 5.1: `pnpm exec drizzle-kit generate` runs without errors
- [ ] Phase 5.2: Generated SQL verified — all 7 columns present
- [ ] Phase 5.3: Generated SQL verified — `idx_furiganas_active_cursor` present with DESC columns
- [ ] Phase 5.4: Generated SQL verified — `WHERE` clause has column name, not `$1` placeholder
- [ ] Phase 6.1: `app/lib/db/schema.test.ts` created (10 tests including structural validation and type assertions)
- [ ] Phase 6.2: `app/lib/db/client.test.ts` created (10 tests including 3 high-priority edge cases)
- [ ] Phase 6.3: `app/lib/db/migration.test.ts` created (5 tests — migration guard)
- [ ] `pnpm test` — all new tests pass
- [ ] `pnpm exec eslint . --fix` — no lint errors
- [ ] `pnpm type-check` — final clean pass

---

## Notes & Considerations

### Test Priority Summary

The test-enhancer identified critical gaps. This plan addresses them in priority order:

1. **High Priority (Phase 1 — add to existing test suites)**:
   - Schema: table name exactly "furiganas" (Test 2), index columns with DESC order (Test 8),
     index has WHERE clause (Test 9), `NewFurigana` type assertion (Test 10). Column presence
     is covered by the exact key-list check in Test 1; strict key enumeration is stronger than
     a count and already guards against silent additions.
   - Client: whitespace-only URL throws (Test 3), empty-string `authToken` allowed for
     `file:` URLs (Test 8), non-`file:` schemes require auth (Test 5)

2. **Migration Guard (Phase 2 — new file)**:
   - `app/lib/db/migration.test.ts` automates the manual SQL inspection from Phase 5.
     The `$1` placeholder test (Test 5 in that suite) is the direct automated guard for
     Drizzle Issue #3349.

### Partial Index WHERE Clause — The Critical Verification Step

The most fragile part of this task is the partial index definition. Drizzle Issue #3349
documents that `.where()` on index definitions can emit `$1` placeholders instead of
column names in the generated migration SQL. This bug is unresolved. The implementation
plan accounts for this with two fallback options:

1. **Primary approach**: `sql\`${table.deletedAt} IS NULL\`` — interpolates the column
   reference into the SQL template. In SQLite dialect, column references are rendered as
   quoted column names, not parameters. This is the most idiomatic form.
2. **Fallback if primary emits `$1`**: `sql\`deleted_at IS NULL\`` — bare SQL string,
   no interpolation. Less refactor-safe (rename won't update it) but guaranteed to work.

Always run `pnpm exec drizzle-kit generate` and read the output SQL before marking this
task done. The migration guard test in `app/lib/db/migration.test.ts` will catch any
regression if `drizzle-kit generate` is re-run in the future.

### `drizzle/` Directory in Git

The `drizzle/` output directory from `drizzle-kit generate` must be committed to the
repository. It contains:

- `drizzle/0000_*.sql` — the initial migration SQL (the ground truth for the schema)
- `drizzle/meta/` — Drizzle Kit's internal snapshot used to compute future diffs

Do NOT add `drizzle/` to `.gitignore`. Migration files are the audit trail for schema
changes and must be reviewed as part of every PR that touches the schema.

### Server-Only Boundary

`app/lib/db/client.ts` imports `@libsql/client`, which contains Node.js native bindings.
If it is accidentally imported in a client bundle (e.g., from a component or a
`clientLoader`), the build will fail with a bundler error. React Router v7's SSR mode keeps
loaders and actions server-only by default, but be cautious about any future import from
`~/lib/db/client` outside of server-execution contexts.
