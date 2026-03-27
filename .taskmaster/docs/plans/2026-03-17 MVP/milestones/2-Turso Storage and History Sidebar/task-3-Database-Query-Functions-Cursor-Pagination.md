# Task 3: Database Query Functions with Cursor Pagination

**Project**: Furigana MVP
**Generated**: 2026-03-27
**Updated**: 2026-03-27 (test strategy enhanced: layered test architecture, P0/P1/P2 phasing, projection leak, deleted-cursor boundary, invalid cursor variants, insert boundary checks, pagination contract guarantees, error propagation)
**Source PRD**: `.taskmaster/docs/plans/2026-03-17 MVP/milestones/2-Turso Storage and History Sidebar/prd.md`

---

## Overview

This task creates the typed query layer that sits between the Drizzle schema (Task 1) and every server-side route/action in subsequent tasks. It introduces a modular, domain-separated architecture:

1. **`app/services/cursor-pagination.service.ts`** — Abstract cursor pagination service (domain-agnostic). Handles all cursor encoding/decoding and the `limit + 1` probe pattern for detecting `hasMore`. Reusable for any entity that needs cursor-based keyset pagination with `(createdAt, id)` composite keys.

2. **`app/lib/db/queries/furigana.query.ts`** — Furigana-specific query functions: `insertFurigana`, `getFuriganaById`, and `listFuriganas`. Uses the cursor-pagination service for the list function's pagination logic.

All functions are independently testable via an in-memory libsql database using `pushSQLiteSchema` from `drizzle-kit/api`. Each module has a dedicated test file (`*.test.ts`).

---

## Requirements Analysis

### Functional Requirements

- `insertFurigana(input)` accepts a caller-supplied insert payload (id, rawText, annotationString, createdAt, title), derives `rawTextSnippet = rawText.slice(0, 30)` internally, and persists the row returning the full `FuriganaRow`.
- `getFuriganaById(id)` returns the matching non-deleted row as `FuriganaRow | null`.
- `listFuriganas({ cursor?, limit? })` returns `FuriganaPaginationResults` with `data: FuriganaPaginationItem[]`, `nextCursor: string | null`, and `hasMore: boolean`.
- Soft-deleted rows (`deleted_at IS NOT NULL`) are excluded from all read queries.
- Cursor is a base64-encoded JSON string `btoa(JSON.stringify({ createdAt, id }))`. Decoding must validate with `CursorSchema` and throw a typed error on malformed input rather than producing silent data corruption.
- List ordering is always `ORDER BY created_at DESC, id DESC` to align with the partial index `idx_furiganas_active_cursor`.
- Default `limit` is 20. Maximum enforced limit is not part of this task — callers are responsible for reasonable values.

### Non-Functional Requirements

- **Type safety**: No `any` or `as` casts. All return types are inferred from Drizzle's `$inferSelect` or explicitly typed using schema types. Use `satisfies` for shape verification.
- **Server-only**: `queries.ts` must only be imported by server modules. No "use client" banner should be added — the file has no explicit marker, relying on React Router's SSR boundary. Add a `// Server-only` comment at the top consistent with `client.ts`.
- **No silent failures**: Drizzle operations on libsql can throw `LibsqlError`. These propagate upward without being swallowed. Error wrapping happens at the route/action layer (Tasks 4–7), not here.
- **Deterministic ordering**: `(created_at DESC, id DESC)` ensures stable pages even when two rows share the same `created_at` timestamp, because `id` (UUID) is unique.
- **Performance**: The partial index on `(created_at DESC, id DESC) WHERE deleted_at IS NULL` makes the cursor WHERE clause hit the index directly. No `COUNT(*)` is ever performed.

### Dependencies and Constraints

- **Internal — Task 1**: `furiganas` table, `FuriganaRow`, `FuriganaInsert` types from `app/lib/db/furigana.db.ts`.
- **Internal — Task 2**: `db` singleton from `app/lib/db/client.ts`.
- **Internal — Existing schemas**: `FuriganaInsertSchema`, `FuriganaRowSchema`, `FuriganaPaginationItemSchema`, `FuriganaPaginationResultsSchema`, `CursorSchema` from `app/schema/`.
- **External**: `drizzle-orm` v0.45.1, `@libsql/client` v0.17.2.
- **Test-only external**: `drizzle-kit/api` `pushSQLiteSchema` for in-memory schema setup (no migration files needed in test).
- **Constraint — SQLite row-value syntax**: SQLite supports `(col_a, col_b) < (?, ?)` tuple comparison natively. Drizzle's built-in operators do not emit this syntax. The `or`/`and`/`lt`/`eq` composition approach from Drizzle's pagination guide is semantically equivalent but generates a longer WHERE clause. Both approaches are valid; this plan uses the `sql` template for the tuple form because it maps directly to what the partial index optimizer expects and keeps the query expression compact and readable. See Third-Party Research section for details.

---

## Implementation Plan

### Phase 1: Cursor Pagination Service (Domain-Agnostic)

**Objective**: Create `app/services/cursor-pagination.service.ts` with reusable cursor encoding/decoding and `hasMore` detection logic. This service is domain-agnostic and can be reused by any query layer that needs cursor-based keyset pagination.

#### Subtask 1.1: Create `app/services/cursor-pagination.service.ts`

- **Files to create**: `app/services/cursor-pagination.service.ts`
- **Code pattern**: A service module exporting two functions and one type helper:
  - `type CursorData = { createdAt: string; id: string }`
  - `decodeCursor(cursor: string): CursorData` — Base64 decode + Zod validation via `CursorSchema`
  - `encodeCursor(createdAt: string, id: string): string` — Buffer.from + base64 encode
- **Imports required**:
  - `{ CursorSchema }` from `~/schema/pagination.schema` — reuse existing schema
  - `{ ZodError }` from `zod` (for typed error handling)
- **Key consideration**: This service has NO knowledge of Drizzle, database tables, or any domain entity. It purely handles the mechanical encoding/decoding of cursor tuples and validation. This makes it testable in isolation and reusable in future milestones (e.g., for other paginated entity lists).
- **Acceptance criteria**:
  - `decodeCursor` throws for malformed base64, throws `ZodError` for invalid shape
  - `encodeCursor` produces a valid cursor that `decodeCursor` can reverse
  - File compiles with zero type errors
  - No `any` or `as` casts

#### Subtask 1.2: Create `app/lib/db/queries/` directory and `furigana.query.ts`

- **Files to create**:
  - Directory: `app/lib/db/queries/`
  - File: `app/lib/db/queries/furigana.query.ts`
- **Code pattern**: The module follows the same `// Server-only` comment convention as `client.ts`. Import `db` from `../client`, table reference from `../furigana.db`, Drizzle operators, cursor service, and all Zod schemas needed. Export only the three query functions.
- **Imports required**:
  - `{ db }` from `~/lib/db/client`
  - `{ furiganas }` from `~/lib/db/furigana.db`
  - `type { FuriganaRow }` from `~/lib/db/furigana.db`
  - `{ eq, isNull, and, desc, sql }` from `drizzle-orm`
  - `{ decodeCursor, encodeCursor }` from `~/services/cursor-pagination.service`
  - `type { CursorPaginationParams, FuriganaPaginationResults }` from `~/schema/pagination.schema`
  - `type { FuriganaPaginationItem }` from `~/schema/furigana.schema`
- **Key consideration**: `db` is a module-level singleton. Query functions receive no `db` parameter — they close over the exported singleton. This matches the pattern established by `client.ts` (singleton export) and keeps function call sites clean.
- **Acceptance criteria**:
  - File compiles cleanly with `pnpm type-check`
  - All three function names are exported
  - No `any` or type casts present
  - No circular imports (cursor service is imported, never the reverse)

---

### Phase 2: `insertFurigana` Implementation

**Objective**: Implement the insert function in the furigana query module that accepts a caller-supplied insert payload, computes `rawTextSnippet`, and returns the persisted `FuriganaRow`.

#### Subtask 2.1: Define `DEFAULT_PAGE_LIMIT` constant

- **Files to modify**: `app/lib/db/queries/furigana.query.ts`
- **Code pattern**: Module-level `const DEFAULT_PAGE_LIMIT = 20` — not exported. Callers pass an explicit `limit` in `CursorPaginationParams`; the default is a local concern of the query layer.
- **Acceptance criteria**: No magic number `20` appears inline in query logic.

#### Subtask 2.2: Function signature

```typescript
async function insertFurigana(input: Omit<FuriganaInsert, "rawTextSnippet">): Promise<FuriganaRow>;
```

- **Rationale**: The caller never computes `rawTextSnippet` — this function owns that derivation. By omitting it from the parameter type, the contract is self-documenting and prevents callers from supplying a mismatched snippet.
- **Note on `FuriganaInsert`**: The Drizzle-inferred type (`typeof furiganas.$inferInsert`) has `rawTextSnippet` as `string` (NOT NULL). Using `Omit<FuriganaInsert, "rawTextSnippet">` strips it from the input cleanly without `as` casts.

#### Subtask 2.3: Snippet derivation and insert

- **Files to modify**: `app/lib/db/queries/furigana.query.ts`
- **Code pattern**:
  ```typescript
  const rawTextSnippet = input.rawText.slice(0, 30);
  const [row] = await db
    .insert(furiganas)
    .values({ ...input, rawTextSnippet })
    .returning();
  if (!row) {
    throw new Error("Insert returned no rows");
  }
  return row;
  ```
- **Key consideration — `.returning()`**: Drizzle's `.returning()` on libsql/SQLite returns `FuriganaRow[]`. With `noUncheckedIndexedAccess` enabled in tsconfig, destructuring `const [row]` types `row` as `FuriganaRow | undefined`, requiring the null guard. This is correct — do not use `as FuriganaRow`.
- **Key consideration — updatedAt**: `baseColumns` wires `$defaultFn` on `updatedAt`. This means Drizzle calls `new Date().toISOString()` at insert time if `updatedAt` is not provided. The caller does not need to pass `updatedAt`.
- **Acceptance criteria**: Function returns the full `FuriganaRow` type. `rawTextSnippet` in the returned row is always `rawText.slice(0, 30)` regardless of what the caller provides for `rawText`.

---

### Phase 3: `getFuriganaById` Implementation

**Objective**: Implement a single-row fetch that excludes soft-deleted entries in the furigana query module.

#### Subtask 3.1: Function signature and query

```typescript
async function getFuriganaById(id: string): Promise<FuriganaRow | null>;
```

- **Files to modify**: `app/lib/db/queries/furigana.query.ts`
- **Code pattern**:
  ```typescript
  const rows = await db
    .select()
    .from(furiganas)
    .where(and(eq(furiganas.id, id), isNull(furiganas.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
  ```
- **Key consideration**: `.where(and(...))` uses Drizzle's typed `and`, `eq`, and `isNull` operators — no raw SQL needed here. `isNull` correctly emits `IS NULL` for the soft-delete check.
- **Key consideration — return type**: With `noUncheckedIndexedAccess`, `rows[0]` is `FuriganaRow | undefined`. The nullish coalescing `?? null` normalizes this to `FuriganaRow | null` as declared in the return type.
- **Acceptance criteria**: Returns `null` when the row does not exist. Returns `null` when `deletedAt IS NOT NULL`. Returns the full row when active. No `SELECT *` ambiguity — Drizzle's `.select()` without projection returns all typed columns.

---

### Phase 4: `listFuriganas` Implementation

**Objective**: Implement cursor-based keyset pagination using the cursor-pagination service and the `+1` row probe pattern.

#### Subtask 4.1: `listFuriganas` function signature

```typescript
async function listFuriganas(params: CursorPaginationParams): Promise<FuriganaPaginationResults>;
```

- `CursorPaginationParams` is `{ cursor?: string; limit?: number }` from `pagination.schema.ts`.

#### Subtask 4.2: The pagination query with row-value cursor comparison

- **Files to modify**: `app/lib/db/queries/furigana.query.ts`
- **Code pattern**:

  ```typescript
  async function listFuriganas(params: CursorPaginationParams): Promise<FuriganaPaginationResults> {
    const limit = params.limit ?? DEFAULT_PAGE_LIMIT;
    const fetchLimit = limit + 1;

    const baseCondition = isNull(furiganas.deletedAt);

    // Use the cursor-pagination service to decode the cursor (if provided)
    const cursorData = params.cursor ? decodeCursor(params.cursor) : null;

    const whereClause = cursorData
      ? and(
          baseCondition,
          sql`(${furiganas.createdAt}, ${furiganas.id}) < (${cursorData.createdAt}, ${cursorData.id})`,
        )
      : baseCondition;

    const rows = await db
      .select({
        id: furiganas.id,
        rawTextSnippet: furiganas.rawTextSnippet,
        title: furiganas.title,
        createdAt: furiganas.createdAt,
      })
      .from(furiganas)
      .where(whereClause)
      .orderBy(desc(furiganas.createdAt), desc(furiganas.id))
      .limit(fetchLimit);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);

    const lastRow = data[data.length - 1];
    const nextCursor = hasMore && lastRow ? encodeCursor(lastRow.createdAt, lastRow.id) : null;

    return { data, nextCursor, hasMore };
  }
  ```

- **Key consideration — cursor service usage**: `decodeCursor` is imported from `~/services/cursor-pagination.service`. It throws an `Error` for malformed base64 or a `ZodError` for invalid shape — both propagate to the route layer for error handling.

- **Key consideration — row-value vs. `or/and` composition**: Drizzle's docs show `or(gt(a, cursorA), and(eq(a, cursorA), gt(b, cursorB)))` for multi-column ascending cursors. For descending order, the inverse is `or(lt(a, cursorA), and(eq(a, cursorA), lt(b, cursorB)))`. Both are correct, but the row-value syntax `(a, b) < (cursorA, cursorB)` is SQLite-native and emits a single WHERE token that the query planner can match directly against the `(created_at DESC, id DESC)` index. The `sql` template with Drizzle column references (`${furiganas.createdAt}`) is properly parameterized — Drizzle binds the cursor values as positional parameters, so there is no SQL injection risk.

- **Key consideration — column projection**: `.select({ id, rawTextSnippet, title, createdAt })` returns only the fields in `FuriganaPaginationItem`. This avoids fetching `rawText` (potentially hundreds of characters) and `annotationString` (potentially larger) for every sidebar item. The return type is `{ id: string; rawTextSnippet: string; title: string | null; createdAt: string }[]` which matches `FuriganaPaginationItem`.

- **Key consideration — `noUncheckedIndexedAccess`**: `data[data.length - 1]` is `FuriganaPaginationItem | undefined`. The `hasMore && lastRow` guard handles this correctly — if `data` is empty, `lastRow` is `undefined` and `nextCursor` is `null`.

- **Key consideration — `hasMore` semantics**: `hasMore` is `true` if and only if we received `limit + 1` rows back, meaning there are more rows beyond the current page. The `+1` row is never included in `data`.

- **Acceptance criteria**: First-page call (no cursor) returns up to `limit` items in newest-first order. Subsequent calls with a valid cursor return the next page in correct order. Soft-deleted rows never appear. `hasMore` is `true` when there are more pages, `false` on the last page. `nextCursor` is `null` on the last page.

---

### Phase 5: Module Exports and Integration

**Objective**: Export the three query functions from the furigana query module and ensure the cursor service is properly isolated and reusable.

#### Subtask 5.1: Export from `app/lib/db/queries/furigana.query.ts`

- The three functions `insertFurigana`, `getFuriganaById`, `listFuriganas` are exported as named exports.
- No internal helpers or constants are exported.
- **Acceptance criteria**: All three query functions are publicly available; internal implementation details are private.

#### Subtask 5.2: Export from `app/services/cursor-pagination.service.ts`

- Export `decodeCursor` and `encodeCursor` as named exports.
- Export the `CursorData` type for type-aware imports.
- **Acceptance criteria**: The service is fully isolated and has no domain-specific knowledge; it can be imported and used by any query module that needs cursor pagination.

#### Subtask 5.3: Directory structure and imports

- Create `app/lib/db/queries/` directory to house all database query modules (furigana is the first, others may follow).
- Route modules import query functions directly:
  ```typescript
  import { insertFurigana, listFuriganas } from "~/lib/db/queries/furigana.query";
  ```
- The cursor-pagination service is imported only by query modules:
  ```typescript
  import { decodeCursor, encodeCursor } from "~/services/cursor-pagination.service";
  ```
- **Acceptance criteria**:
  - No circular dependencies (cursor service does not import from any query module)
  - `furigana.query.ts` imports from `cursor-pagination.service.ts` (one-way dependency)
  - Query functions are imported at the call site, not re-exported through a barrel

---

## Third-Party Integration Research

### drizzle-orm v0.45.1 (installed: 0.45.1)

- **Official docs**: [Cursor-based Pagination](https://orm.drizzle.team/docs/guides/cursor-based-pagination), [Magic `sql` operator](https://orm.drizzle.team/docs/sql), [Insert](https://orm.drizzle.team/docs/insert)
- **Row-value comparison**: Drizzle does not have a built-in operator for SQLite tuple comparison `(a, b) < (x, y)`. The `sql` template tag with column references (`${furiganas.createdAt}`) properly parameterizes values and escapes column names. This is the recommended escape-hatch pattern per official docs.
- **`.returning()` on SQLite**: Fully supported on libsql since SQLite 3.35.0. `@libsql/client` v0.17.x wraps Turso's remote SQLite which is 3.45+. The `.returning()` call returns `FuriganaRow[]` — Drizzle infers the full row type automatically.
- **Drizzle's `or`/`and` vs. `sql` row-value**: Drizzle docs show the `or(gt, and(eq, gt))` pattern for multi-column cursors. This emits a longer WHERE clause but avoids any raw SQL. For this project the `sql` template tuple form is preferred because it matches the `(created_at DESC, id DESC)` index semantics more directly. Both emit semantically equivalent query plans on SQLite.
- **Recent changes**: v0.45.0 added `casing` option to `drizzle()` config. Not relevant here. No breaking changes to `sql`, `select`, `insert`, or `returning` APIs between v0.44 and v0.45.
- **Open issues**: The partial index `WHERE $1` bug (Drizzle issue #3349) was documented in M2 Task 1 and already mitigated in the migration SQL. It does not affect runtime query functions.
- **Security advisories**: None found for drizzle-orm v0.45.x.
- **Performance notes**: Drizzle prepares statements by default on libsql when using batch. Single queries are not batched here — each query function is a standalone call.

### @libsql/client v0.17.2 (installed: 0.17.2)

- **Official docs**: [Turso + Drizzle](https://orm.drizzle.team/docs/tutorials/drizzle-with-turso)
- **In-memory support**: `createClient({ url: ":memory:" })` creates an in-process SQLite database via the libsql WASM/native implementation. This is confirmed as the correct URL format for in-memory test databases. Note: `file::memory:` also works but `:memory:` is canonical.
- **Transaction quirks**: A known issue (libsql-client-ts #140) states that in-memory databases may not commit transactions reliably in some edge cases. For these tests, no explicit transactions are used — all operations are auto-commit single statements. This is not a blocker.
- **Security advisories**: None found for @libsql/client v0.17.x.
- **Performance notes**: In-memory `:memory:` databases are per-client-instance (not shared). Each test file that creates a `createClient({ url: ":memory:" })` gets a fresh isolated database. This is the desired test isolation behavior.

> **Needs Review**: The known libsql transaction commit issue (#140) applies only to explicit transactions in `:memory:` mode. Since the query functions use no explicit transactions, this is low risk. If a future task wraps multiple queries in a transaction, re-evaluate this.

### drizzle-kit v0.31.10 (installed: 0.31.10) — Test setup only

- **Official API**: `drizzle-kit/api` exports `pushSQLiteSchema(imports: Record<string, unknown>, drizzleInstance: LibSQLDatabase): Promise<{ apply: () => Promise<void>; ... }>`.
- **Usage in tests**: `await (await pushSQLiteSchema(schema, db)).apply()` pushes the TypeScript schema definition directly to the in-memory database without needing migration files. This mirrors the existing `client.test.ts` pattern of isolating module-level effects.
- **Key detail**: The first argument is `Record<string, unknown>` — pass the star-import of the schema module (`import * as schema from "~/lib/db/schema"`). Drizzle-kit introspects the exports to find table definitions.
- **Security/reliability**: `pushSQLiteSchema` is a dev-time tool used only in test files. It must never be called in production code paths.
- **Performance notes**: Each `beforeEach` that calls `pushSQLiteSchema` spins up a fresh in-memory schema. This adds ~5–15ms per test suite setup. Acceptable for unit tests.

---

## Code Patterns

### Pattern 1: Cursor Service — Domain-Agnostic Encoding/Decoding

```typescript
// app/services/cursor-pagination.service.ts
import { CursorSchema } from "~/schema/pagination.schema";

type CursorData = { createdAt: string; id: string };

export function decodeCursor(cursor: string): CursorData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
  } catch {
    throw new Error(`Invalid cursor: base64 or JSON decode failed`);
  }
  return CursorSchema.parse(parsed); // throws ZodError on invalid shape
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64");
}
```

**Where to apply**: `app/services/cursor-pagination.service.ts` — a standalone service with no domain knowledge.

**Why this pattern**: Isolates cursor mechanics from domain-specific query logic. The service can be reused by any query module that needs cursor-based pagination. Testing the service independently ensures cursor correctness without needing a full database.

---

### Pattern 2: Row-Value Cursor Comparison in Query Module

```typescript
// app/lib/db/queries/furigana.query.ts
import { sql, isNull, and, desc } from "drizzle-orm";
import { furiganas } from "~/lib/db/furigana.db";
import { decodeCursor, encodeCursor } from "~/services/cursor-pagination.service";

const cursorData = params.cursor ? decodeCursor(params.cursor) : null;
const whereClause = cursorData
  ? and(
      isNull(furiganas.deletedAt),
      sql`(${furiganas.createdAt}, ${furiganas.id}) < (${cursorData.createdAt}, ${cursorData.id})`,
    )
  : isNull(furiganas.deletedAt);
```

**Where to apply**: `listFuriganas` in `app/lib/db/queries/furigana.query.ts`.

**Why this pattern**: The query module uses the cursor service for encoding/decoding, then applies the decoded cursor data in the WHERE clause. SQLite natively supports row-value comparisons. The `sql` template with `${furiganas.column}` references injects the correct quoted column name; the `${cursorData.value}` interpolations become bound parameters. This keeps the WHERE clause compact and aligns with the composite index `(created_at DESC, id DESC)` that the query planner uses.

---

### Pattern 3: `+1` Probe for `hasMore` Detection

```typescript
const fetchLimit = limit + 1;
const rows = await db.select(/* ... */).limit(fetchLimit);
const hasMore = rows.length > limit;
const data = rows.slice(0, limit);
const lastRow = data[data.length - 1];
const nextCursor = hasMore && lastRow ? encodeCursor(lastRow.createdAt, lastRow.id) : null;
```

**Where to apply**: `listFuriganas` in `app/lib/db/queries/furigana.query.ts`.

**Why this pattern**: Avoids a `COUNT(*)` query entirely. By requesting one extra row, we can determine if more pages exist using only the data already fetched. The next cursor is taken from the last row of the actual page (not the probe row), ensuring the next page starts immediately after the visible data.

---

### Pattern 4: In-Memory Database Test Setup with `pushSQLiteSchema`

```typescript
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { pushSQLiteSchema } from "drizzle-kit/api";
import * as schema from "~/lib/db/schema";

let db: ReturnType<typeof drizzle>;

beforeEach(async () => {
  const client = createClient({ url: ":memory:" });
  db = drizzle({ client, schema });
  const { apply } = await pushSQLiteSchema(schema, db);
  await apply();
});
```

**Where to apply**: Test files (`app/lib/db/queries/furigana.query.test.ts` and `app/services/cursor-pagination.service.test.ts`).

**Why this pattern**: `pushSQLiteSchema` pushes the live TypeScript schema to the in-memory database without needing pre-generated migration files. Using `beforeEach` (not `beforeAll`) ensures each test starts with a fully clean database. This is the pattern confirmed by `drizzle-kit/api.d.ts` — the function accepts the schema star-import and a `LibSQLDatabase` instance.

**Note on dependency injection for query tests**: The `furigana.query.ts` module imports `db` from `../client` directly (singleton pattern). To test with the in-memory `db`, the test file must mock the `client` module. The recommended approach is `vi.mock("~/lib/db/client", () => ({ db: testDb }))` where `testDb` is the in-memory instance created in `beforeEach`. This matches the `vi.mock` pattern already used in `client.test.ts`.

**Note on cursor service tests**: The `cursor-pagination.service.ts` has no database dependency, so its tests are simpler — pure function tests with hardcoded cursor data and no mocking required.

---

### Pattern 5: `Omit` on Drizzle Insert Type for Computed Fields

```typescript
import type { FuriganaInsert } from "~/lib/db/furigana.db";

async function insertFurigana(input: Omit<FuriganaInsert, "rawTextSnippet">): Promise<FuriganaRow> {
  const rawTextSnippet = input.rawText.slice(0, 30);
  const [row] = await db
    .insert(furiganas)
    .values({ ...input, rawTextSnippet })
    .returning();
  if (!row) {
    throw new Error("insertFurigana: insert returned no rows");
  }
  return row;
}
```

**Where to apply**: `insertFurigana` in `app/lib/db/queries/furigana.query.ts`.

**Why this pattern**: The Drizzle `$inferInsert` type reflects the database schema directly. `Omit<FuriganaInsert, "rawTextSnippet">` removes the computed field from the public API surface, making the derivation rule (`rawText.slice(0, 30)`) an enforced invariant rather than a convention.

---

## Test Strategy

### Current Strategy Assessment

The original plan included 12 test cases covering the happy paths for cursor encoding/decoding, basic insert/fetch/list operations, pagination navigation across multiple pages, and two error propagation cases. These tests establish a solid foundation, but several gaps leave critical-path behaviors unverified:

1. **No projection safety test for `listFuriganas`** — The column projection in `.select({ id, rawTextSnippet, title, createdAt })` is the key performance and data exposure guard for the sidebar. There is no test confirming that heavy columns (`rawText`, `annotationString`, `updatedAt`, `deletedAt`) are absent from pagination results. A regression here would silently inflate response payloads and potentially leak sensitive annotation data to the sidebar list.

2. **No deleted-cursor boundary test** — When a user deletes a history item that happens to be the last row of the previous page (the row whose `createdAt`/`id` is encoded as `nextCursor`), the cursor position is still valid as a keyset position. The next page should continue correctly from that boundary, not skip rows or crash. This is the most realistic multi-action user scenario (scroll + delete) and is completely untested.

3. **No invalid cursor variants beyond malformed base64 and wrong JSON shape** — The empty-string cursor (a stripped query parameter — the most common production error input) and a base64-valid payload that decodes to valid JSON but fails `CursorSchema` validation are distinct code paths that are not individually tested.

4. **No insert boundary contract tests** — The `rawTextSnippet = rawText.slice(0, 30)` rule has no off-by-one test (exactly 30 characters), and the `title` non-null case and `updatedAt` auto-population are not verified.

5. **No default limit behavioral verification** — The constant `DEFAULT_PAGE_LIMIT = 20` is untested, leaving accidental constant changes undetectable.

6. **No duplicate ID insert failure test** — The "no silent failures" NFR requires that unique constraint violations propagate loudly. This is currently not asserted.

7. **`nextCursor` derived from last visible row, not probe row** — The `+1` probe pattern requires that `nextCursor` is derived from `data[data.length - 1]` (last returned visible row), not from the `limit + 1` probe row. There is no explicit assertion that verifies this contract with `limit = 1` (the tightest boundary).

### Milestone Context

The sidebar's infinite scroll (PRD section 5 — Infinite Scroll in Sidebar) is the direct user-facing feature that these query functions underpin. The PRD specifies:

- The sidebar loads the first 20 entries on initial render via `useInfiniteQuery`.
- As the user scrolls to the bottom, the next page is fetched using cursor-based pagination.
- New entries are appended seamlessly.
- When `nextCursor` is `null`, scrolling stops triggering fetches.

**Correctness guarantees that matter for users**:

- No entries are duplicated or skipped across pages — a user scrolling through 100 entries must see exactly 100 unique entries.
- The sidebar does not crash or show broken state when cursor input is malformed (e.g., due to a network retry with a corrupted cursor parameter).
- The sidebar shows only the snippet and title, not the full source text — protecting performance and avoiding data over-serving.
- Deleting an entry mid-scroll does not corrupt the user's scroll position or cause the next page to return incorrect results.

### Layered Test Architecture

Tests are organized into three layers with different purposes and tooling:

#### Layer 1 — Unit Tests (Pure Functions)

**File**: `app/services/cursor-pagination.service.test.ts`
**Scope**: `decodeCursor` and `encodeCursor` in isolation. No database, no mocking.
**Rationale**: The cursor service is the shared foundation for all pagination. Any bug here propagates to every paginated entity. Pure function tests are fast, deterministic, and do not require any test infrastructure beyond calling the functions with known inputs.

#### Layer 2 — Integration Tests (In-Memory SQLite)

**File**: `app/lib/db/queries/furigana.query.test.ts`
**Scope**: `insertFurigana`, `getFuriganaById`, and `listFuriganas` against a real in-memory SQLite schema. Uses `vi.mock` to replace the `db` singleton.
**Rationale**: Query functions interact with Drizzle's SQL generation, SQLite's type coercion, and the schema's constraints. Mocking the database at a higher level would miss real behaviors (e.g., unique constraint enforcement, `IS NULL` filtering). In-memory SQLite provides isolation and speed while exercising the real query paths.

#### Layer 3 — E2E Tests (Future Scope)

**Scope**: Not part of this task. The API endpoint (`/api/furiganas`) introduced in Task 5 is where E2E tests validate the full request-response cycle against a live or staging Turso database. This task's tests stop at the query layer boundary.

### P0/P1/P2 Phased Implementation

Tests are phased by user-impact risk. P0 tests should be written first (TDD: before implementation). P1 tests accompany implementation completion. P2 tests are added before the PR is merged.

**P0 — User-Critical (write before implementing)**:

- No rows duplicated or skipped across pages (existing Test 8 — keep)
- Soft-deleted rows excluded from list (existing Test 5 — keep)
- Malformed cursor propagates error, not silent data (existing Tests 11, 12 — keep and extend with empty-string variant)
- Snippet invariant: `rawTextSnippet === rawText.slice(0, 30)` (existing Test 2 — keep and add boundary case)
- Projection safety: heavy columns absent from pagination items (new — P0.1)
- Deleted-cursor boundary: next page is correct when cursor's boundary row is soft-deleted mid-scroll (new — P0.2)

**P1 — Strong Regression Shield (write during implementation)**:

- Concurrent insert stability: row inserted after cursor capture does not appear on next page (existing Test 9 — keep)
- Default limit contract: `listFuriganas({})` with 25 rows returns 20 items, `hasMore === true` (new — P1.1)
- `nextCursor` boundary: with `limit = 1` and 2 rows, verify cursor is derived from first visible row, second page returns second row (new — P1.2)
- Duplicate ID insert throws, not silently succeeds (new — P1.3)
- `updatedAt` auto-population: returned row has `updatedAt` as a valid ISO string without caller providing it (new — P1.4)

**P2 — Edge and Polish (write before merge)**:

- Empty-string cursor: `listFuriganas({ cursor: "" })` throws `Error` (new — P2.1)
- Base64-valid non-JSON cursor: `decodeCursor` throws `Error` (new — P2.2)
- Non-null title insert: returns row with `title` set to the provided string (new — P2.3)
- Exactly 30-char `rawText`: snippet equals full text with no truncation (new — P2.4)

---

## Test Cases

### Unit Tests — Cursor Pagination Service (`app/services/cursor-pagination.service.test.ts`)

The cursor service has no database dependencies, so its tests are pure function tests:

#### Test Suite: Cursor Encoding/Decoding

**Test 1**: `encodeCursor` produces a valid base64 string.

- **Given**: `createdAt = "2026-03-27T10:00:00.000Z"`, `id = "550e8400-e29b-41d4-a716-446655440000"`.
- **When**: `encodeCursor(createdAt, id)` is called.
- **Then**: Returns a string that is valid base64 (decodable via `Buffer.from(..., "base64")`).
- **Coverage**: Basic encoding — ensures no encoding errors.

**Test 2**: `decodeCursor` reverses `encodeCursor` symmetrically.

- **Given**: `createdAt = "2026-03-27T10:00:00.000Z"`, `id = "550e8400-e29b-41d4-a716-446655440000"`.
- **When**: `encodeCursor(createdAt, id)` then `decodeCursor(result)`.
- **Then**: Returns `{ createdAt, id }` matching the originals exactly.
- **Coverage**: Encoding symmetry — a mismatch here would corrupt all subsequent pages.

**Test 3**: `decodeCursor` throws `Error` on malformed base64.

- **Given**: `cursor = "not-valid-base64!!!"`.
- **When**: `decodeCursor(cursor)` is called.
- **Then**: Throws an `Error` with message containing "Invalid cursor".
- **Coverage**: Defensive decoding — prevents a corrupt cursor from silently returning wrong data.

**Test 4**: `decodeCursor` throws `ZodError` on valid base64 with wrong JSON shape.

- **Given**: `cursor = Buffer.from('{"wrong": "shape"}').toString("base64")`.
- **When**: `decodeCursor(cursor)` is called.
- **Then**: Throws a `ZodError` (from `CursorSchema.parse`).
- **Coverage**: Schema validation — ensures the cursor shape contract is enforced.

**Test 5**: `decodeCursor` accepts valid cursor with both fields.

- **Given**: `cursor = Buffer.from(JSON.stringify({ createdAt: "2026-03-27T10:00:00.000Z", id: "uuid" })).toString("base64")`.
- **When**: `decodeCursor(cursor)` is called.
- **Then**: Returns `{ createdAt, id }` successfully.
- **Coverage**: Happy-path decoding.

**Test 6 (P2.2)**: `decodeCursor` throws `Error` on empty-string cursor.

- **Given**: `cursor = ""`.
- **When**: `decodeCursor("")` is called.
- **Then**: Throws an `Error`. `Buffer.from("", "base64")` decodes to an empty buffer; `JSON.parse("")` throws a `SyntaxError` which `decodeCursor` wraps as `Error("Invalid cursor: ...")`.
- **Coverage**: Most common production invalid cursor (stripped query param). This is a distinct failure path from non-base64 input.

**Test 7 (P2.2)**: `decodeCursor` throws `Error` when base64 decodes to non-JSON text.

- **Given**: `cursor = Buffer.from("this is not json").toString("base64")`.
- **When**: `decodeCursor(cursor)` is called.
- **Then**: Throws an `Error` from the JSON parse branch, not a `ZodError`.
- **Coverage**: Distinguishes the base64-valid/non-JSON path from the valid-JSON/wrong-shape path. Both must throw, but the error type differs.

---

### Integration Tests — Furigana Query Functions (`app/lib/db/queries/furigana.query.test.ts`)

The query test file uses `vi.mock` to substitute the `db` singleton with an in-memory instance. Each `describe` block gets a fresh database via `beforeEach`.

#### Test Suite Setup Pattern

```typescript
// furigana.query.test.ts
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { pushSQLiteSchema } from "drizzle-kit/api";
import * as schema from "~/lib/db/schema";

// Hoist the mock db reference so vi.mock closure captures it
const mockDbRef = { current: null as LibSQLDatabase | null };

vi.mock("~/lib/db/client", () => ({
  get db() {
    return mockDbRef.current;
  },
}));

beforeEach(async () => {
  const client = createClient({ url: ":memory:" });
  const db = drizzle({ client, schema });
  const { apply } = await pushSQLiteSchema(schema, db);
  await apply();
  mockDbRef.current = db;
});
```

---

#### Test Suite: `insertFurigana`

**Test 1**: Inserts a row and returns it with all fields populated.

- **Given**: A valid input `{ id, rawText: "東京は素晴らしい", annotationString, createdAt }` (no rawTextSnippet, no title).
- **When**: `insertFurigana(input)` is called.
- **Then**: Returns `FuriganaRow` with `id` matching input, `rawTextSnippet === "東京は素晴らしい"` (full text, under 30 chars), `title === null`, `deletedAt === null`, `updatedAt` is a valid ISO string.
- **Coverage**: Basic happy-path insert; verifies `.returning()` and type inference.

**Test 2**: Computes `rawTextSnippet` as first 30 characters when `rawText` exceeds 30 chars.

- **Given**: Input with `rawText` of exactly 50 characters.
- **When**: `insertFurigana(input)` is called.
- **Then**: Returned row has `rawTextSnippet.length === 30` and `rawTextSnippet === rawText.slice(0, 30)`.
- **Coverage**: Snippet derivation invariant — the most important business rule in this function.

**Test 3**: Stores `rawText` untruncated.

- **Given**: Input with `rawText` of 100 characters.
- **When**: `insertFurigana(input)` is called.
- **Then**: Returned row has `rawText.length === 100` (full text preserved).
- **Coverage**: Ensures `rawTextSnippet` derivation does not corrupt `rawText`.

**Test 4**: Accepts nullable `title`.

- **Given**: Input with `title: null`.
- **When**: `insertFurigana(input)` is called.
- **Then**: Returned row has `title === null`.
- **Coverage**: Nullable column handling.

**Test 5**: Persists the row (verify via follow-up SELECT).

- **Given**: An insert is performed.
- **When**: A direct Drizzle select is run on the test db after the insert.
- **Then**: The row exists in the database with matching `id`.
- **Coverage**: Confirms the insert is not a no-op — guards against a future refactor that breaks `.values()` wiring.

**Test 6 (P2.4)**: Exactly 30-char `rawText` produces snippet equal to full text.

- **Given**: Input with `rawText` of exactly 30 characters (e.g., `"あいうえおかきくけこさしすせそたちつてとなにぬねの"` — 25 hiragana, padded to 30 with ASCII).
- **When**: `insertFurigana(input)` is called.
- **Then**: `rawTextSnippet === rawText` (all 30 characters, no truncation).
- **Coverage**: Off-by-one boundary for `.slice(0, 30)`. Verifies `slice` includes character at index 29 and stops before index 30.

**Test 7 (P2.3)**: Accepts non-null `title`.

- **Given**: Input with `title: "東京の観光地"`.
- **When**: `insertFurigana(input)` is called.
- **Then**: Returned row has `title === "東京の観光地"`.
- **Coverage**: Non-null title path — M4 will UPDATE this field; insertion with a pre-set title (e.g., in tests or migration scripts) must work.

**Test 8 (P1.4)**: `updatedAt` is auto-populated without caller providing it.

- **Given**: Input with no `updatedAt` field provided (using `Omit<FuriganaInsert, "rawTextSnippet">` type which does not include `updatedAt` as required).
- **When**: `insertFurigana(input)` is called.
- **Then**: Returned row has `updatedAt` as a non-null string matching ISO 8601 format (validate with `new Date(row.updatedAt)` not throwing).
- **Coverage**: `$defaultFn` behavior — verifies Drizzle's `$defaultFn(nowIsoString)` runs at insert time. A regression here would leave `updatedAt` as `null`, breaking downstream M5 edit logic.

**Test 9 (P1.3)**: Duplicate ID insert throws, not silently succeeds.

- **Given**: A row inserted with a specific `id`.
- **When**: `insertFurigana` is called again with the identical `id` but different `rawText`.
- **Then**: Throws an error (SQLite `UNIQUE constraint failed: furiganas.id`). The error is not swallowed — it propagates from the function.
- **Coverage**: "No silent failures" NFR. Verifies that the PRIMARY KEY constraint is enforced and that the query function does not catch and suppress constraint errors.

---

#### Test Suite: `getFuriganaById`

**Test 1**: Returns the row for an existing active entry.

- **Given**: A row inserted via `insertFurigana`.
- **When**: `getFuriganaById(id)` is called with that row's `id`.
- **Then**: Returns `FuriganaRow` with matching `id`.
- **Coverage**: Basic happy-path fetch.

**Test 2**: Returns `null` for a non-existent ID.

- **Given**: An ID that has never been inserted.
- **When**: `getFuriganaById(unknownId)` is called.
- **Then**: Returns `null`.
- **Coverage**: Missing row handling — most common real-world edge case.

**Test 3**: Returns `null` for a soft-deleted row.

- **Given**: A row inserted via `insertFurigana`, then its `deletedAt` set to an ISO timestamp via direct test-db update.
- **When**: `getFuriganaById(id)` is called.
- **Then**: Returns `null`.
- **Coverage**: Soft-delete filter — critical for M6 correctness; a regression here would expose deleted data to the UI.

**Test 4**: Returns `null` for an empty string ID.

- **Given**: `id = ""`.
- **When**: `getFuriganaById("")` is called.
- **Then**: Returns `null` (no row matches).
- **Coverage**: Edge case input — empty strings should not throw.

---

#### Test Suite: `listFuriganas` — First Page

**Test 1**: Returns an empty list when the table is empty.

- **Given**: No rows in the database.
- **When**: `listFuriganas({})` is called.
- **Then**: `{ data: [], nextCursor: null, hasMore: false }`.
- **Coverage**: Empty state — common initial load scenario.

**Test 2**: Returns all rows when count is below default limit, no cursor.

- **Given**: 5 rows inserted.
- **When**: `listFuriganas({})` is called with default limit (20).
- **Then**: `data.length === 5`, `hasMore === false`, `nextCursor === null`.
- **Coverage**: Single-page result — `hasMore` must be `false` when data fits in one page.

**Test 3**: Returns newest-first ordering.

- **Given**: 3 rows inserted with distinct `createdAt` timestamps (oldest, middle, newest).
- **When**: `listFuriganas({})`.
- **Then**: `data[0].createdAt` is newest, `data[2].createdAt` is oldest.
- **Coverage**: DESC ordering — a sort regression would break the sidebar display.

**Test 4**: Returns exactly `limit` rows and sets `hasMore: true` when count exceeds limit.

- **Given**: 6 rows inserted; `limit = 5`.
- **When**: `listFuriganas({ limit: 5 })`.
- **Then**: `data.length === 5`, `hasMore === true`, `nextCursor !== null`.
- **Coverage**: `+1` probe pattern — the core pagination boundary detection.

**Test 5**: Excludes soft-deleted rows from the list.

- **Given**: 3 active rows, 2 soft-deleted rows.
- **When**: `listFuriganas({})`.
- **Then**: `data.length === 3`, deleted rows absent.
- **Coverage**: Soft-delete filter in list query — separate from the `getFuriganaById` test.

**Test 6 (P0.1 — Projection Safety)**: Pagination items do not include heavy columns.

- **Given**: A row inserted with a long `rawText` (200 characters) and a long `annotationString`.
- **When**: `listFuriganas({})` is called.
- **Then**: Each item in `data` has exactly the keys `{ id, rawTextSnippet, title, createdAt }`. Assert that `"rawText"`, `"annotationString"`, `"updatedAt"`, and `"deletedAt"` are absent from `data[0]` using `expect(data[0]).not.toHaveProperty("rawText")` (and similarly for the others).
- **Coverage**: Column projection correctness — a regression that removes the `.select({...})` projection and falls back to `SELECT *` would silently inflate every sidebar page fetch with multi-kilobyte payloads and expose `annotationString` to the client API layer. This test makes such a regression immediately visible.

**Test 7 (P1.1 — Default Limit Contract)**: `listFuriganas({})` without explicit `limit` returns at most 20 rows.

- **Given**: 25 rows inserted with sequential timestamps.
- **When**: `listFuriganas({})` is called (no `limit` parameter).
- **Then**: `data.length === 20`, `hasMore === true`, `nextCursor !== null`.
- **Coverage**: `DEFAULT_PAGE_LIMIT = 20` constant correctness. If the constant is accidentally changed to a different value (e.g., during a refactor), this test fails immediately.

---

#### Test Suite: `listFuriganas` — Cursor Navigation

**Test 8**: Second page returns correct rows and correct `hasMore`.

- **Given**: 10 rows inserted (distinct timestamps), `limit = 4`.
- **When**: First call: `listFuriganas({ limit: 4 })` → capture `nextCursor`. Second call: `listFuriganas({ cursor: nextCursor, limit: 4 })`.
- **Then**: Second call returns rows 5–8 in order, `hasMore === true`, `nextCursor !== null`.
- **Coverage**: Full pagination flow — verifies cursor encodes and decodes the correct boundary row.

**Test 9**: Last page returns `hasMore: false` and `nextCursor: null`.

- **Given**: 10 rows, `limit = 4`. Three pages: 4, 4, 2.
- **When**: Navigate to the third page using cursors from pages 1 and 2.
- **Then**: Third page `data.length === 2`, `hasMore === false`, `nextCursor === null`.
- **Coverage**: Pagination termination — prevents infinite loop in client-side "load more" logic.

**Test 10**: No rows are duplicated or skipped across pages.

- **Given**: 10 rows with unique `createdAt` timestamps, `limit = 3`.
- **When**: Collect all pages by following `nextCursor` until `hasMore === false`.
- **Then**: Total collected IDs form a set of exactly 10, with no duplicates.
- **Coverage**: Cursor stability — the most critical correctness guarantee for keyset pagination.

**Test 11**: Rows inserted after a cursor is captured do not appear on a subsequent page fetched with that cursor.

- **Given**: First page fetched for 3 rows. A new row with a recent timestamp is then inserted.
- **When**: Second page is fetched using the cursor from the first page.
- **Then**: The newly inserted row does not appear on the second page (its timestamp is newer than the cursor boundary).
- **Coverage**: Cursor isolation — verifies that keyset pagination is stable under concurrent inserts.

**Test 12**: Two rows with the same `createdAt` are ordered by `id DESC` and both accessible via cursor navigation.

- **Given**: Two rows inserted with identical `createdAt` values.
- **When**: `listFuriganas({ limit: 1 })` then `listFuriganas({ cursor, limit: 1 })`.
- **Then**: Both rows returned across the two pages, no row skipped.
- **Coverage**: Composite cursor tiebreaker — the most likely failure mode when `createdAt` collisions occur.

**Test 13 (P1.2 — `nextCursor` Boundary Contract)**: With `limit = 1`, `nextCursor` is derived from the first visible row, not the probe row.

- **Given**: 3 rows inserted with timestamps T1 (newest), T2, T3 (oldest).
- **When**: `listFuriganas({ limit: 1 })`.
- **Then**: `data` contains only the T1 row. `hasMore === true`. `nextCursor` decodes to `{ createdAt: T1.createdAt, id: T1.id }` (not T2's values). Second call with this cursor returns only the T2 row.
- **Coverage**: `+1` probe pattern boundary correctness with the smallest valid page size. Verifies that the cursor is taken from `data[data.length - 1]` (index 0 when `limit = 1`), not from `rows[limit]` (the probe row). A bug here would cause the client to skip one row per page load.

**Test 14 (P0.2 — Deleted-Cursor Boundary)**: Next page is correct when the cursor's boundary row is soft-deleted between page fetches.

- **Given**: 5 rows inserted (T1 newest ... T5 oldest). First page fetched with `limit = 2` returns rows T1 and T2, with `nextCursor` encoding T2's position. Then T2 is soft-deleted (its `deletedAt` set via direct db update).
- **When**: Second page fetched with the captured `nextCursor` and `limit = 2`.
- **Then**: Second page returns rows T3 and T4 (the next 2 active rows after the T2 cursor position). `hasMore === true`. T2 does not appear in the result. The cursor remains a valid keyset position even though T2 is now deleted — the row-value `<` comparison is a positional seek, not a row reference.
- **Coverage**: The exact user scenario where a user deletes a sidebar entry while scrolling. Without this test, a developer might assume that the cursor being "orphaned" from its source row causes incorrect behavior. The test documents and enforces that cursor-based keyset pagination is resilient to boundary row deletion.

---

#### Test Suite: `listFuriganas` — Error Handling

**Test 15**: Propagates `Error` from invalid cursor (from cursor service).

- **Given**: `cursor = "not-valid-base64!!!"`.
- **When**: `listFuriganas({ cursor })` is called.
- **Then**: Throws an `Error` from the cursor service (propagated upward).
- **Coverage**: Error propagation — route/action layer will catch and handle.

**Test 16**: Propagates `ZodError` from malformed cursor shape.

- **Given**: `cursor = Buffer.from('{"wrong": "shape"}').toString("base64")`.
- **When**: `listFuriganas({ cursor })` is called.
- **Then**: Throws a `ZodError` from the cursor service.
- **Coverage**: Invalid cursor shape handling — ensures validation is delegated to the service.

**Test 17 (P2.1 — Empty String Cursor)**: Propagates `Error` from empty-string cursor.

- **Given**: `cursor = ""`.
- **When**: `listFuriganas({ cursor: "" })` is called.
- **Then**: Throws an `Error`. The empty string reaches `decodeCursor("")`, which attempts `JSON.parse(Buffer.from("", "base64").toString())` = `JSON.parse("")`, throwing a `SyntaxError` that is wrapped as `Error("Invalid cursor: ...")`.
- **Coverage**: Most common real-world invalid cursor. This is a distinct path from Test 15 (non-base64) and Test 16 (wrong shape). All three must fail loudly — none may silently return an empty or first-page result.

---

### Integration Notes

These are unit tests (function-level, against in-memory SQLite), not integration tests against Turso.

- **Cursor service tests**: Pure function tests with no database dependency. No mocking required.
- **Furigana query tests**: Use `vi.mock` to substitute the `db` singleton with an in-memory instance. No HTTP mocking is needed since `furigana.query.ts` talks directly to the Drizzle `db` instance, not via HTTP.
- **True integration tests**: Tests against a live Turso database are a CI/CD concern outside this task's scope.

---

## Implementation Checklist

### Cursor Pagination Service (`app/services/cursor-pagination.service.ts`)

- [ ] Directory `app/services/` exists (may already exist for other services)
- [ ] `decodeCursor(cursor: string): CursorData` implemented — base64 decode + `CursorSchema.parse`, throws Error or ZodError
- [ ] `encodeCursor(createdAt: string, id: string): string` implemented — uses `Buffer.from(...).toString("base64")`
- [ ] Export `CursorData` type for downstream consumers
- [ ] Export both functions as named exports
- [ ] No domain-specific knowledge in the service (reusable for any entity)

### Furigana Query Module (`app/lib/db/queries/furigana.query.ts`)

- [ ] Directory `app/lib/db/queries/` created
- [ ] File `app/lib/db/queries/furigana.query.ts` created with `// Server-only` comment
- [ ] `DEFAULT_PAGE_LIMIT = 20` constant defined, no magic number in query body
- [ ] `insertFurigana` implemented — derives `rawTextSnippet`, uses `.returning()`, guards against undefined row
- [ ] `getFuriganaById` implemented — uses `and(eq, isNull)`, returns `FuriganaRow | null`
- [ ] `listFuriganas` implemented — imports `decodeCursor`/`encodeCursor` from service, uses row-value `sql` template, `+1` probe, column projection to `{ id, rawTextSnippet, title, createdAt }` only
- [ ] All three functions exported as named exports
- [ ] No private helpers (cursor logic delegated to service)

### Testing — P0 (write before implementing, minimum required scenarios)

- [ ] Projection safety: `listFuriganas` items contain only `{ id, rawTextSnippet, title, createdAt }` (Test 6 — P0.1)
- [ ] Deleted-cursor boundary: next page correct when boundary row is soft-deleted mid-scroll (Test 14 — P0.2)
- [ ] No rows duplicated or skipped across pages via cursor navigation (Test 10)
- [ ] Soft-deleted rows excluded from list results (Test 5)
- [ ] Snippet invariant: `rawTextSnippet === rawText.slice(0, 30)` (Test 2)
- [ ] Error propagation: malformed cursor does not silently return wrong data (Tests 15, 16)

### Testing — P1 (write during implementation, regression shield)

- [ ] Default limit contract: `listFuriganas({})` with 25 rows returns 20 items (Test 7 — P1.1)
- [ ] `nextCursor` boundary: with `limit = 1`, cursor encodes first visible row not probe row (Test 13 — P1.2)
- [ ] Duplicate ID insert throws, not swallowed (Test 9 — P1.3)
- [ ] `updatedAt` auto-populated without caller providing it (Test 8 — P1.4)
- [ ] Concurrent insert stability: row inserted after cursor capture excluded from next page (Test 11)
- [ ] `createdAt` collision handled by `id DESC` tiebreaker (Test 12)

### Testing — P2 (write before PR merge, edge and polish)

- [ ] Empty-string cursor throws `Error` in both `decodeCursor` (Test 6 cursor suite) and `listFuriganas` (Test 17)
- [ ] Base64-valid non-JSON cursor throws `Error` not `ZodError` (Test 7 cursor suite)
- [ ] Exactly 30-char `rawText` produces snippet equal to full text, no truncation (Test 6 insert suite — P2.4)
- [ ] Non-null title stored and returned correctly (Test 7 insert suite — P2.3)

### Quality and Integration

- [ ] `pnpm type-check` passes with zero errors
- [ ] `pnpm exec eslint . --fix` passes with zero warnings
- [ ] `pnpm test` passes — all unit tests green (both service and query tests)
- [ ] Verify no `any` or `as` casts in either module
- [ ] Verify no circular imports:
  - `cursor-pagination.service.ts` has no database dependencies
  - `furigana.query.ts` imports from `cursor-pagination.service.ts` (one-way)
  - No module imports `furigana.query.ts` except route/action call sites
- [ ] Import paths in route/action modules updated to use new paths:
  ```typescript
  import { insertFurigana, listFuriganas } from "~/lib/db/queries/furigana.query";
  ```

---

## Architecture and Design Notes

### Modular Separation of Concerns

The task splits query logic into two modules:

1. **`cursor-pagination.service.ts`** — Purely mechanical, domain-agnostic. Handles cursor encoding/decoding and validation. Can be imported by any future query module (e.g., tags, notes, etc.) that needs cursor-based keyset pagination. Testable without any database.

2. **`furigana.query.ts`** — Furigana-specific business logic. Uses the cursor service for cursor operations, focuses on domain-specific queries (insert, fetch, list) and soft-delete filtering. Testable against an in-memory SQLite database.

**Why this structure**: Reusability, testability, and clear separation of mechanical concerns (cursor handling) from domain logic (furigana queries). If Milestone 3+ adds pagination for other entities, the cursor service is ready to use.

### Testing Patterns

**`vi.mock` hoisting with `beforeEach` db**: Vitest hoists `vi.mock` calls to the top of the module. The mock factory function runs once at module load time, before any `beforeEach`. To make the mock return the correct per-test in-memory db instance, use a mutable reference object (`mockDbRef`) that the `get db()` getter reads on each access. This is a known Vitest pattern for mocking singleton modules that need per-test values.

**Why not dependency-inject `db`?**: The existing codebase (`client.ts`, `furigana.db.ts`) uses module-level singletons exclusively. Changing `furigana.query.ts` to accept `db` as a parameter would diverge from that pattern and add ceremony to every call site (Tasks 4–7). The `vi.mock` approach for testing is the correct extension of the existing convention.

**Behavior over implementation**: All test assertions target observable behavior (returned values, thrown errors, absence/presence of fields in results) rather than implementation details (which Drizzle operator was used, how many SQL statements were emitted). This ensures tests remain valid through internal refactors that preserve behavior.

### Implementation Details

**`updatedAt` on insert**: `baseColumns` wires `$defaultFn(nowIsoString)` on `updatedAt`. This means Drizzle calls the function when building the insert statement, so `updatedAt` is automatically populated without the caller providing it. The returned `FuriganaRow.updatedAt` will always be a valid ISO string after insert.

**Cursor encoding with Unicode**: Japanese text will never appear in the cursor because the cursor only encodes `createdAt` (ISO 8601 ASCII) and `id` (UUID ASCII). Base64 encoding of ASCII-only JSON is safe and reversible without any charset concerns.

**SQLite text comparison for ISO dates**: SQLite stores all dates as text in this schema. ISO 8601 strings sort lexicographically in the same order as chronologically (for the same timezone offset). Since all dates are stored in UTC (`Z` suffix), the `<` comparison in the row-value WHERE clause correctly implements chronological ordering without any `datetime()` casting.

**Cursor is a keyset position, not a row reference**: The cursor encodes `(createdAt, id)` as a pagination seek position. Whether or not the row with that exact `id` still exists in the database is irrelevant — the WHERE clause `(created_at, id) < (cursorCreatedAt, cursorId)` seeks all active rows whose composite key falls after (older than) the cursor position. This is why Test 14 (deleted-cursor boundary) passes: soft-deleting the cursor row does not invalidate the cursor.

**Future: `deletedAt` soft-delete queries**: When M6 implements soft-delete, it will call a dedicated `softDeleteFurigana(id)` function (not part of this task). The `getFuriganaById` and `listFuriganas` filters are already soft-delete-aware by construction.

### Import Paths and Module Boundaries

Routes and actions import query functions directly:

```typescript
import { insertFurigana, listFuriganas } from "~/lib/db/queries/furigana.query";
```

Only `furigana.query.ts` imports from the cursor service:

```typescript
import { decodeCursor, encodeCursor } from "~/services/cursor-pagination.service";
```
