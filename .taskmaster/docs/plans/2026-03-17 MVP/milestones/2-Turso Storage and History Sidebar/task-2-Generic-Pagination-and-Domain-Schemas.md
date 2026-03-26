# Task 2: Generic Pagination and Domain Schemas

**Project**: Furigana
**Generated**: 2026-03-26
**Source PRD**: `.taskmaster/docs/plans/2026-03-17 MVP/`

## Overview

This task creates the Zod validation layer that sits between the Drizzle ORM database types (established in Task 1) and the application's API routes, services, and client queries. Two files are produced:

1. `app/schema/pagination.schema.ts` — a fully generic cursor-pagination envelope with a factory function and utility types, reusable across any future domain.
2. `app/schema/furigana.schema.ts` — extended with database-oriented schemas (`FuriganaRowSchema`, `FuriganaInsertSchema`, `FuriganaSidebarSchema`, `FuriganaPaginationResultsSchema`) that are derived by hand from the Drizzle `$inferSelect`/`$inferInsert` types rather than from `drizzle-zod`, due to an unresolved Zod v4 peer-dependency issue in `drizzle-zod`.

The existing `furigana.schema.ts` already exports `TextTokenSchema`, `RubyTokenSchema`, `FuriganaTokenSchema`, and related type guards. This task appends to that file without disturbing the existing exports.

---

## Requirements Analysis

### Functional Requirements

- `CursorSchema` validates the decoded cursor object `{ createdAt: ISO datetime string, id: UUID string }`.
- `PaginationResultsSchema(itemSchema)` is a factory function accepting any Zod schema `S` and returning a schema for `{ data: S[], nextCursor: string | null, hasMore: boolean }`. No `total` field is included.
- `CursorPaginationParams` is a TypeScript utility type representing `{ cursor?: string; limit?: number }` for use in query-function call sites.
- `PaginationResults<T>` is a TypeScript generic type inferred from the envelope schema for any item type `T`.
- `FuriganaRowSchema` validates a full `SELECT *` result row with UUID validation on `id` and ISO datetime validation on `createdAt` and `deletedAt`.
- `FuriganaInsertSchema` enforces `rawText` max 5000 chars and `rawTextSnippet` max 30 chars.
- `FuriganaSidebarSchema` is a manual projection of `{ id, rawTextSnippet, title, createdAt }` for sidebar list items.
- `FuriganaPaginationResultsSchema` composes `PaginationResultsSchema(FuriganaSidebarSchema)`.
- Each schema has a corresponding exported TypeScript type (via `z.infer`).

### Non-Functional Requirements

- Zero `any` or `as` casts. All types must be derivable from Zod schemas via `z.infer` or from Drizzle's `$inferSelect`/`$inferInsert` helpers.
- Compatible with `exactOptionalPropertyTypes` — optional fields must use `z.optional()`, not `undefined` unions.
- The pagination factory must be fully generic at the TypeScript level so callers get typed `data` arrays without casting.
- Schemas must be pure computation (no I/O, no DB imports) to remain safe for both client and server bundles.
- Test files must use only Vitest globals (`describe`, `it`, `expect`) without additional imports because `vitest.config.ts` sets `globals: true`.

### Dependencies and Constraints

- **Internal**: Depends on Task 1 (`app/lib/db/furigana.db.ts`) for the `Furigana` and `NewFurigana` Drizzle types used as a reference for field names and nullability.
- **Internal**: `app/schema/furigana.schema.ts` already exists — this task extends it in place.
- **External**: `zod@^4.0.0` is installed. Zod v4 moved datetime/UUID validators to `z.iso.datetime()` and `z.uuid()` as top-level functions — not `z.string().datetime()`.
- **Constraint**: `drizzle-zod` is NOT installed and must NOT be added due to unresolved Zod v4 compatibility issues (see Third-Party Research section below). All schemas are hand-written, derived from `$inferSelect`/`$inferInsert` types.
- **Constraint**: `exactOptionalPropertyTypes` in tsconfig means `title?: string` is not assignable to `title: string | null`. Always use explicit `z.string().nullable()` for nullable database columns.

---

## Implementation Plan

### Phase 1: Create Pagination Schema

**Objective**: Build the generic cursor-pagination infrastructure that Task 3 (query functions) and Task 8 (API routes) will consume.

#### Subtask 1.1: Create `app/schema/pagination.schema.ts`

- **File to create**: `app/schema/pagination.schema.ts`
- **Code pattern**: Pure Zod schema definitions with a generic factory function. The factory uses a Zod schema type parameter `<S extends z.ZodTypeAny>` so TypeScript can infer the item type from the argument. Export the factory as a named function, not as a default export.
- **Key considerations**:
  - Use `z.iso.datetime()` (Zod v4 API) for the `createdAt` field in `CursorSchema`. Do not use `z.string().datetime()` (Zod v3 API).
  - Use `z.uuid()` (Zod v4 top-level) for the `id` field in `CursorSchema`. Do not use `z.string().uuid()`.
  - `nextCursor` in the envelope is `z.string().nullable()` (a string or `null`), not `z.string().optional()`. The API contract always includes `nextCursor` in the response body.
  - `CursorPaginationParams` is a plain TypeScript `type`, not a Zod schema, since it describes query-side parameters that are validated separately at the API layer.
  - `PaginationResults<T>` is derived via `z.infer` from a concrete instantiation of the factory (using `z.ZodTypeAny` as the placeholder) and then mapped to use `T` for the data item — this avoids having to re-describe the envelope fields.
- **Acceptance criteria**: `import { PaginationResultsSchema, CursorSchema } from '~/schema/pagination.schema'` resolves without type errors; `PaginationResultsSchema(z.string()).parse({ data: ['a'], nextCursor: null, hasMore: false })` succeeds; `PaginationResultsSchema(z.string()).parse({ data: ['a'], nextCursor: null, hasMore: false, total: 0 })` strips the `total` field (Zod strips unknown keys by default).

#### Subtask 1.2: Create `app/schema/pagination.schema.test.ts`

- **File to create**: `app/schema/pagination.schema.test.ts`
- **Key considerations**: Tests must cover the exact behaviours listed in the task's test strategy. Use a simple `z.object({ name: z.string() })` as the item schema for the factory tests to keep them self-contained.
- **Acceptance criteria**: All test cases in the Test Cases section pass under `pnpm test`.

---

### Phase 2: Extend Furigana Domain Schema

**Objective**: Add database-oriented Zod schemas to the existing furigana schema file, keeping the file's existing token schemas untouched.

#### Subtask 2.1: Extend `app/schema/furigana.schema.ts` with DB schemas

- **File to modify**: `app/schema/furigana.schema.ts`
- **Code pattern**: Append schemas after the existing type-guard exports. Group DB schemas under a comment block `// --- Database schemas ---`. Each schema maps directly to the Drizzle `Furigana`/`NewFurigana` type shape but adds Zod-level refinements.
- **Field mapping reference** (from `app/lib/db/furigana.db.ts`):

  | Drizzle field      | DB column           | Type            | Nullable |
  | ------------------ | ------------------- | --------------- | -------- |
  | `id`               | `id`                | TEXT (UUID)     | No       |
  | `rawText`          | `raw_text`          | TEXT            | No       |
  | `rawTextSnippet`   | `raw_text_snippet`  | TEXT            | No       |
  | `annotationString` | `annotation_string` | TEXT            | No       |
  | `title`            | `title`             | TEXT            | Yes      |
  | `createdAt`        | `created_at`        | TEXT (ISO 8601) | No       |
  | `deletedAt`        | `deleted_at`        | TEXT (ISO 8601) | Yes      |

- **Key considerations**:
  - `FuriganaRowSchema`: All 7 fields. `id` uses `z.uuid()`. `createdAt` uses `z.iso.datetime()`. `deletedAt` uses `z.iso.datetime().nullable()`. `title` uses `z.string().nullable()`.
  - `FuriganaInsertSchema`: Includes `id`, `rawText` (max 5000), `rawTextSnippet` (max 30), `annotationString`, `title` (optional nullable), `createdAt`. Excludes `deletedAt` — inserts never set a deletion timestamp.
  - `FuriganaSidebarSchema`: Manual projection — only `id`, `rawTextSnippet`, `title` (nullable), `createdAt`. This is a **narrower** shape than `FuriganaRowSchema`. It is a standalone `z.object(...)` call, not a `.pick()` on `FuriganaRowSchema`, because `rawText` and `annotationString` are intentionally excluded from sidebar responses for bandwidth reasons. Using `.pick()` would couple the sidebar schema to `FuriganaRowSchema`'s field-level refinements unnecessarily.
  - `FuriganaPaginationResultsSchema`: `PaginationResultsSchema(FuriganaSidebarSchema)`. This is a call, not a type alias — it must be a const that holds a Zod schema instance.
  - Import `PaginationResultsSchema` from `~/schema/pagination.schema` to avoid circular dependencies.
  - Do NOT import from `~/lib/db/furigana.db` — schema files must stay free of DB/server-only imports. The field shapes are written by hand, referencing the Drizzle types only as a conceptual guide.
- **Acceptance criteria**: `FuriganaRowSchema.parse(validRow)` succeeds; `FuriganaInsertSchema.parse({ rawText: 'a'.repeat(5001), ... })` throws; `FuriganaPaginationResultsSchema.parse(validEnvelope)` succeeds.

#### Subtask 2.2: Extend `app/schema/furigana.schema.test.ts` with DB schema tests

- **File to modify**: `app/schema/furigana.schema.test.ts`
- **Key considerations**: Append new `describe` blocks after the existing token tests. Do not modify existing test cases. Use `satisfies` assertions to verify inferred types when the goal is a compile-time type check.
- **Acceptance criteria**: All new test cases pass; existing tests continue passing; `pnpm type-check` reports zero errors.

---

### Phase 3: Quality Verification

**Objective**: Confirm all code quality gates pass before marking the task done.

#### Subtask 3.1: Run type-check

```bash
pnpm type-check
```

Expected: zero TypeScript errors.

#### Subtask 3.2: Run lint with auto-fix

```bash
pnpm exec eslint . --fix
```

#### Subtask 3.3: Run unit tests

```bash
pnpm test
```

Expected: all existing tests pass, plus all new pagination and furigana DB schema tests pass.

#### Subtask 3.4: Verify coverage config includes schema files

Check the Vitest coverage configuration. The current config excludes `app/lib/**/*.ts` (correct — DB and server-only modules should not count toward schema coverage) but the `app/schema/**/*.ts` glob must be present in the include list. If `app/schema/**/*.ts` is missing from the coverage `include` array, add it during this phase so that the new schema files and their tests contribute to coverage reports. Do not add `app/lib/**/*.ts` to coverage — those files contain server-only DB imports that should not be exercised in unit test coverage runs.

---

## Third-Party Integration Research

### Zod v4.0.0 (installed: `zod@^4.0.0`)

- **Official docs**: [https://zod.dev/api](https://zod.dev/api) and [https://zod.dev/v4/changelog](https://zod.dev/v4/changelog)
- **Breaking API changes relevant to this task**:
  - `z.string().datetime()` (v3) → `z.iso.datetime()` (v4). Using the old form will type-check under `skipLibCheck: true` but the runtime behaviour differs.
  - `z.string().uuid()` (v3) → `z.uuid()` (v4 top-level). In v4, `z.uuid()` strictly enforces RFC 4122 variant bits. For permissive "UUID-like" strings use `z.guid()` instead.
  - `z.record()` now requires two arguments. Not relevant here but note for future schema work.
  - `z.string().datetime()` still exists in v4 as a deprecated alias — it will work at runtime but triggers deprecation warnings in some linter setups. Use `z.iso.datetime()`.
- **Open issues / known bugs**: None directly affecting this task's schema shapes.
- **Security advisories**: None found.
- **Performance notes**: v4 is 14x faster on string parsing vs v3 — no concern for this task's pure validation use case.
- **Case studies**: None relevant.

### drizzle-zod (NOT installed, NOT to be installed)

- **Official docs**: [https://orm.drizzle.team/docs/zod](https://orm.drizzle.team/docs/zod)
- **Status**: `drizzle-zod@0.8.3` declared Zod v4 support via PR #4820, but as of the memory recorded in `project_m2_db_patterns.md`, the `./v4` specifier and branded types caused runtime import failures with `zod@^4.0.0`.
- **Open issues**: [Issue #4625](https://github.com/drizzle-team/drizzle-orm/issues/4625) — Zod v4 support feature request, open as of writing. [Issue #4746](https://github.com/drizzle-team/drizzle-orm/issues/4746) — peer dependency bump requested.

> ⚠️ **Needs Review**: `drizzle-zod` is not installed in this project. The task description mentions using `createSelectSchema`/`createInsertSchema` from `drizzle-orm/zod`, but given the unresolved Zod v4 compatibility issues documented in the project's memory (`project_m2_db_patterns.md`), **all schemas in this task must be hand-written** using the Drizzle `$inferSelect`/`$inferInsert` types as a reference. If a future release of `drizzle-zod` fully resolves Zod v4 peer-dependency issues, the schemas in this file could be migrated to use `createSelectSchema`/`createInsertSchema` — but that migration is out of scope for this task. Do not install `drizzle-zod` as part of this task.

---

## Code Patterns

### Pattern 1: Generic Pagination Factory with Typed Inference

```typescript
// app/schema/pagination.schema.ts
import * as z from "zod";

export const CursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

export type Cursor = z.infer<typeof CursorSchema>;

// Generic factory: accepts any Zod schema and returns the pagination envelope schema.
// The type parameter S is constrained to ZodTypeAny so TypeScript can track the
// item type through z.infer<ReturnType<typeof PaginationResultsSchema<S>>>.
export function PaginationResultsSchema<S extends z.ZodTypeAny>(itemSchema: S) {
  return z.object({
    data: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}

// CursorPaginationParams is a call-site type, not a Zod schema.
// It represents the raw query parameters before decoding/validation.
export type CursorPaginationParams = {
  cursor?: string;
  limit?: number;
};

// PaginationResults<T> describes the decoded/typed envelope shape.
// Derive from the factory using ZodTypeAny as placeholder, then substitute T.
export type PaginationResults<T> = {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
};
```

**Where to apply**: `app/schema/pagination.schema.ts` only.

**Why this pattern**: The generic factory approach (rather than a class or a fixed schema with `unknown`) ensures that callers like `FuriganaPaginationResultsSchema` and the API client's `fetchFuriganaList` get a fully typed `data` array without any casting. `z.ZodTypeAny` as the constraint is the standard Zod pattern for generic schema utilities.

---

### Pattern 2: Hand-Written DB Schemas Mirroring Drizzle Types

```typescript
// app/schema/furigana.schema.ts  (appended after existing exports)
import * as z from "zod";
import { PaginationResultsSchema } from "~/schema/pagination.schema";

// --- Database schemas ---

export const FuriganaRowSchema = z.object({
  id: z.uuid(),
  rawText: z.string(),
  rawTextSnippet: z.string(),
  annotationString: z.string(),
  title: z.string().nullable(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});

export type FuriganaRow = z.infer<typeof FuriganaRowSchema>;

export const FuriganaInsertSchema = z.object({
  id: z.uuid(),
  rawText: z.string().max(5000),
  rawTextSnippet: z.string().max(30),
  annotationString: z.string(),
  title: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
});

export type FuriganaInsert = z.infer<typeof FuriganaInsertSchema>;

// FuriganaSidebarSchema is a standalone projection — not derived from FuriganaRowSchema —
// because it intentionally omits rawText, annotationString, and deletedAt.
export const FuriganaSidebarSchema = z.object({
  id: z.uuid(),
  rawTextSnippet: z.string(),
  title: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type FuriganaSidebar = z.infer<typeof FuriganaSidebarSchema>;

export const FuriganaPaginationResultsSchema = PaginationResultsSchema(FuriganaSidebarSchema);

export type FuriganaPaginationResults = z.infer<typeof FuriganaPaginationResultsSchema>;
```

**Where to apply**: `app/schema/furigana.schema.ts`, after the existing type-guard section.

**Why this pattern**: Keeping schemas hand-written (rather than generated via `drizzle-zod`) avoids the Zod v4 peer-dependency risk. Field names use camelCase (matching the Drizzle column mapping in `furigana.db.ts`), not snake_case (the raw DB column names), so schemas compose naturally with TypeScript object destructuring in route loaders and server actions.

---

### Pattern 3: `title` Optionality in Insert Schema

```typescript
// Correct for exactOptionalPropertyTypes:
title: z.string().nullable().optional(),
// Infers as: string | null | undefined
// Allows omitting the field entirely OR passing null

// Wrong — this would fail exactOptionalPropertyTypes:
title: z.string().nullable(),
// Infers as: string | null
// Requires the field to be present (even if null) on every insert call
```

**Where to apply**: `FuriganaInsertSchema.title` only.

**Why this pattern**: The Drizzle `NewFurigana` type (from `$inferInsert`) makes `title` optional because it has no `.notNull()` in the table definition. Matching this with `z.string().nullable().optional()` means the schema correctly validates both `{ title: null }` and `{}` (field absent), which is what `exactOptionalPropertyTypes` demands.

---

### Pattern 4: Compile-Time Drizzle Type Alignment via `satisfies`

```typescript
// app/schema/furigana.schema.test.ts  (Drizzle type alignment suite)
// Import Drizzle types in test only — schema files must not import from DB modules.
import type { Furigana, NewFurigana } from "~/lib/db/furigana.db";
import type { FuriganaRow, FuriganaInsert } from "~/schema/furigana.schema";

// Bidirectional assignability checks using satisfies.
// These are compile-time assertions — no runtime code runs.
// If a field is added/removed/retyped in the Drizzle schema,
// tsc will fail here before any test executes.

// Direction 1: A Drizzle row must be assignable to FuriganaRow.
// This catches fields present in Drizzle but missing from the Zod schema.
const _drizzleToZod = {} as Furigana satisfies FuriganaRow;

// Direction 2: A FuriganaRow must be assignable to Drizzle's Furigana.
// This catches extra fields added to the Zod schema that have no DB column.
const _zodToDrizzle = {} as FuriganaRow satisfies Furigana;

// Repeat for insert shapes.
const _drizzleInsertToZod = {} as NewFurigana satisfies FuriganaInsert;
const _zodInsertToDrizzle = {} as FuriganaInsert satisfies NewFurigana;
```

**Where to apply**: A dedicated `describe("Drizzle type alignment", ...)` block at the top of `app/schema/furigana.schema.test.ts`.

**Why this pattern**: `drizzle-zod` is not installed, so schema drift between Drizzle's inferred types and the hand-written Zod schemas cannot be caught by a code generator. The `satisfies` operator enforces assignability in both directions at compile time — if any field name, type, or nullability diverges, `tsc` fails immediately. This is the only automated guard against silent schema drift that works without `drizzle-zod`.

---

## Test Cases

### Unit Tests — `app/schema/pagination.schema.test.ts`

#### Test Suite: `CursorSchema`

**Test 1**: Accepts a valid cursor with ISO datetime and UUID

- **Given**: `{ createdAt: "2026-03-26T12:00:00.000Z", id: "550e8400-e29b-41d4-a716-446655440000" }`
- **When**: `CursorSchema.parse(input)` is called
- **Then**: Returns the input unchanged without throwing
- **Coverage**: Happy path; confirms Zod v4 `z.iso.datetime()` and `z.uuid()` accept valid values

**Test 2**: Rejects a cursor missing the `createdAt` field

- **Given**: `{ id: "550e8400-e29b-41d4-a716-446655440000" }`
- **When**: `CursorSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Missing required field detection

**Test 3**: Rejects a cursor missing the `id` field

- **Given**: `{ createdAt: "2026-03-26T12:00:00.000Z" }`
- **When**: `CursorSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Missing required field detection

**Test 4**: Rejects a cursor with a non-ISO datetime string

- **Given**: `{ createdAt: "March 26, 2026", id: "550e8400-e29b-41d4-a716-446655440000" }`
- **When**: `CursorSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Datetime format enforcement

**Test 5**: Rejects a cursor with a malformed UUID string

- **Given**: `{ createdAt: "2026-03-26T12:00:00.000Z", id: "not-a-uuid" }`
- **When**: `CursorSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: UUID format enforcement

**Test 6**: Rejects a cursor with `id` as a number

- **Given**: `{ createdAt: "2026-03-26T12:00:00.000Z", id: 12345 }`
- **When**: `CursorSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Wrong type detection

---

#### Test Suite: `PaginationResultsSchema` factory

**Test 1**: Returns a schema that accepts a valid envelope

- **Given**: `PaginationResultsSchema(z.object({ name: z.string() }))` as `schema`; input `{ data: [{ name: "a" }], nextCursor: "abc123", hasMore: true }`
- **When**: `schema.parse(input)`
- **Then**: Returns input unchanged
- **Coverage**: Factory produces working schema; `nextCursor` as string accepted

**Test 2**: Returns a schema that accepts `nextCursor: null`

- **Given**: Same schema; input `{ data: [], nextCursor: null, hasMore: false }`
- **When**: `schema.parse(input)`
- **Then**: Returns input unchanged
- **Coverage**: Null `nextCursor` is valid (last page)

**Test 3**: Strips unknown fields (no `total` field)

- **Given**: Same schema; input `{ data: [], nextCursor: null, hasMore: false, total: 42 }`
- **When**: `schema.parse(input)`
- **Then**: Returned object does not have a `total` key
- **Coverage**: Ensures API consumers can never rely on a `total` field; Zod strips unknown keys by default

**Test 4**: Rejects missing `hasMore` field

- **Given**: Same schema; input `{ data: [], nextCursor: null }`
- **When**: `schema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Required field enforcement on the envelope

**Test 5**: Rejects `hasMore` as a non-boolean

- **Given**: Same schema; input `{ data: [], nextCursor: null, hasMore: "true" }`
- **When**: `schema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Type enforcement on `hasMore`

**Test 6**: Rejects a data item that does not match the item schema

- **Given**: `PaginationResultsSchema(z.object({ name: z.string() }))` as `schema`; input `{ data: [{ name: 123 }], nextCursor: null, hasMore: false }`
- **When**: `schema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Item-level type enforcement — factory correctly threads the item schema into the array validator

**Test 7**: Rejects an envelope missing the `nextCursor` field entirely

- **Given**: Same schema; input `{ data: [], hasMore: false }` — `nextCursor` key is absent
- **When**: `schema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Enforces that `nextCursor` is always present in the response (nullable, not optional). Every downstream consumer — sidebar query function, API client, loader — depends on `nextCursor` being in the envelope. An absent key is a distinct failure mode from `nextCursor: null` and must be caught at the schema boundary.

**Test 8**: Rejects `data` as a plain object instead of an array

- **Given**: Same schema; input `{ data: { name: "a" }, nextCursor: null, hasMore: false }` — `data` is a single object, not an array
- **When**: `schema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Guards against ORM bugs where `.get()` is used instead of `.all()`, returning a single row object. If this reaches the sidebar UI, calling `.map()` on a non-array crashes at runtime. The Zod schema is the last line of defence before the data enters the render path.

---

### Unit Tests — `app/schema/furigana.schema.test.ts` (appended)

#### Test Suite: Drizzle type alignment (compile-time)

**Test 1**: `Furigana` (Drizzle select type) is bidirectionally assignable to `FuriganaRow` (Zod inferred type)

- **Given**: Import `type { Furigana }` from `~/lib/db/furigana.db` and `type { FuriganaRow }` from `~/schema/furigana.schema`
- **When**: The file is compiled by `tsc` (no runtime assertion needed — use `satisfies` for compile-time-only checks)
- **Then**: Both `{} as Furigana satisfies FuriganaRow` and `{} as FuriganaRow satisfies Furigana` compile without error
- **Coverage**: Catches any field added, removed, renamed, or retyped in the Drizzle table definition that has not been mirrored in `FuriganaRowSchema`. This is the primary mitigation for schema drift when `drizzle-zod` is not available.

**Test 2**: `NewFurigana` (Drizzle insert type) is bidirectionally assignable to `FuriganaInsert` (Zod inferred type)

- **Given**: Import `type { NewFurigana }` from `~/lib/db/furigana.db` and `type { FuriganaInsert }` from `~/schema/furigana.schema`
- **When**: The file is compiled by `tsc`
- **Then**: Both `{} as NewFurigana satisfies FuriganaInsert` and `{} as FuriganaInsert satisfies NewFurigana` compile without error
- **Coverage**: Catches insert-shape drift — e.g., if a new non-nullable column is added to the table without a corresponding update to `FuriganaInsertSchema`.

---

#### Test Suite: `FuriganaRowSchema`

**Test 1**: Accepts a valid full database row

- **Given**: `{ id: "550e8400-e29b-41d4-a716-446655440000", rawText: "東京は素晴らしい", rawTextSnippet: "東京は素晴らしい", annotationString: "東京{とうきょう}は素晴らしい", title: "My entry", createdAt: "2026-03-26T12:00:00.000Z", deletedAt: null }`
- **When**: `FuriganaRowSchema.parse(input)`
- **Then**: Returns the input unchanged
- **Coverage**: Happy path for SELECT \* result

**Test 2**: Accepts a row with `title: null` and `deletedAt: null`

- **Given**: Same as above but `title: null`
- **When**: `FuriganaRowSchema.parse(input)`
- **Then**: Parses successfully; `result.title` is `null`
- **Coverage**: Nullable columns accept null

**Test 3**: Accepts a row with a non-null `deletedAt` ISO string

- **Given**: Row with `deletedAt: "2026-03-27T00:00:00.000Z"`
- **When**: `FuriganaRowSchema.parse(input)`
- **Then**: Parses successfully
- **Coverage**: Soft-deleted rows are valid DB rows

**Test 4**: Rejects a row with a non-UUID `id`

- **Given**: Row with `id: "not-a-uuid"`
- **When**: `FuriganaRowSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: UUID enforcement on `id`

**Test 5**: Rejects a row with a non-ISO `createdAt`

- **Given**: Row with `createdAt: "2026/03/26"`
- **When**: `FuriganaRowSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Datetime format enforcement on `createdAt`

---

#### Test Suite: `FuriganaInsertSchema`

**Test 1**: Accepts a minimal valid insert (no title)

- **Given**: `{ id: "550e8400-e29b-41d4-a716-446655440000", rawText: "東京", rawTextSnippet: "東京", annotationString: "東京{とうきょう}", createdAt: "2026-03-26T12:00:00.000Z" }`
- **When**: `FuriganaInsertSchema.parse(input)`
- **Then**: Parses successfully; `result.title` is `undefined`
- **Coverage**: Optional `title` field may be absent

**Test 2**: Accepts an insert with `title: null`

- **Given**: Same as above plus `title: null`
- **When**: `FuriganaInsertSchema.parse(input)`
- **Then**: Parses successfully; `result.title` is `null`
- **Coverage**: `title` accepts explicit null

**Test 3**: Rejects `rawText` exceeding 5000 characters

- **Given**: `rawText: "あ".repeat(5001)` (5001 chars)
- **When**: `FuriganaInsertSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Max-length enforcement — prevents oversized inserts before DB call

**Test 4**: Accepts `rawText` of exactly 5000 characters

- **Given**: `rawText: "あ".repeat(5000)`
- **When**: `FuriganaInsertSchema.parse(input)`
- **Then**: Parses successfully
- **Coverage**: Boundary condition — 5000 is the valid upper bound

**Test 5**: Rejects `rawTextSnippet` exceeding 30 characters

- **Given**: `rawTextSnippet: "a".repeat(31)`
- **When**: `FuriganaInsertSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Snippet column width enforcement

**Test 6**: Accepts `rawTextSnippet` of exactly 30 characters

- **Given**: `rawTextSnippet: "a".repeat(30)`
- **When**: `FuriganaInsertSchema.parse(input)`
- **Then**: Parses successfully
- **Coverage**: Boundary condition — 30 is the valid upper bound

---

#### Test Suite: `FuriganaSidebarSchema`

**Test 1**: Accepts a valid sidebar projection

- **Given**: `{ id: "550e8400-e29b-41d4-a716-446655440000", rawTextSnippet: "東京は", title: null, createdAt: "2026-03-26T12:00:00.000Z" }`
- **When**: `FuriganaSidebarSchema.parse(input)`
- **Then**: Parses successfully
- **Coverage**: Happy path

**Test 2**: Rejects a sidebar item that includes `rawText` field (is stripped, not rejected)

- **Given**: Sidebar input with an extra `rawText: "..."` field
- **When**: `FuriganaSidebarSchema.parse(input)`
- **Then**: Parses successfully; returned object does NOT contain `rawText`
- **Coverage**: Confirms extra fields are stripped — important because the DB query layer might accidentally return full rows; the schema enforces the projection at the application boundary

**Test 3**: Rejects a sidebar item missing `rawTextSnippet`

- **Given**: `{ id: "...", title: null, createdAt: "..." }`
- **When**: `FuriganaSidebarSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Required field enforcement

---

#### Test Suite: `FuriganaPaginationResultsSchema`

**Test 1**: Accepts a valid paginated sidebar response

- **Given**: `{ data: [{ id: "550e8400-e29b-41d4-a716-446655440000", rawTextSnippet: "東京は", title: null, createdAt: "2026-03-26T12:00:00.000Z" }], nextCursor: null, hasMore: false }`
- **When**: `FuriganaPaginationResultsSchema.parse(input)`
- **Then**: Parses successfully
- **Coverage**: End-to-end composition — confirms `PaginationResultsSchema(FuriganaSidebarSchema)` wires the item schema correctly

**Test 2**: Accepts an empty data array with a non-null `nextCursor`

- **Given**: `{ data: [], nextCursor: "eyJjcmVhdGVkQXQiOiIyMDI2LTAzLTI2VDEyOjAwOjAwLjAwMFoiLCJpZCI6IjU1MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDAwMCJ9", hasMore: true }`
- **When**: `FuriganaPaginationResultsSchema.parse(input)`
- **Then**: Parses successfully
- **Coverage**: Empty page with more data is a valid intermediate pagination state

**Test 3**: Rejects a data array containing a non-sidebar item (missing `id`)

- **Given**: `{ data: [{ rawTextSnippet: "東京は", title: null, createdAt: "2026-03-26T12:00:00.000Z" }], nextCursor: null, hasMore: false }`
- **When**: `FuriganaPaginationResultsSchema.safeParse(input)`
- **Then**: `result.success` is `false`
- **Coverage**: Item-level validation within the composed schema

---

## Implementation Checklist

- [ ] `app/schema/pagination.schema.ts` created with `CursorSchema`, `PaginationResultsSchema`, `CursorPaginationParams`, `PaginationResults<T>`
- [ ] `app/schema/pagination.schema.test.ts` created with all `CursorSchema` and factory test cases (including `nextCursor` absent rejection and `data` non-array rejection)
- [ ] `app/schema/furigana.schema.ts` extended with `FuriganaRowSchema`, `FuriganaInsertSchema`, `FuriganaSidebarSchema`, `FuriganaPaginationResultsSchema` and their inferred types
- [ ] `app/schema/furigana.schema.test.ts` extended with Drizzle type alignment suite and DB schema test suites (existing tests untouched)
- [ ] Vitest coverage config verified to include `app/schema/**/*.ts` (Phase 3 check)
- [ ] `pnpm type-check` passes with zero errors
- [ ] `pnpm exec eslint . --fix` runs cleanly
- [ ] `pnpm test` passes all tests (existing + new)
- [ ] No `drizzle-zod` package installed or imported

---

## Notes and Considerations

**Do not use `z.string().datetime()` or `z.string().uuid()`**: These are the Zod v3 method forms. Zod v4 uses `z.iso.datetime()` and `z.uuid()` as top-level functions. The v3 forms still exist in v4 as deprecated aliases but may produce lint warnings. Use the v4 API consistently across all new schemas.

**`FuriganaSidebarSchema` is a standalone schema, not `.pick()`**: Using `.pick()` on `FuriganaRowSchema` would couple the sidebar shape to the row schema's refinements and make it harder to independently evolve the two shapes. The explicit standalone definition also makes the intent clearer for readers of Task 8 (API routes) and Task 9 (API client layer).

**`deletedAt` is excluded from `FuriganaInsertSchema`**: New rows are never inserted with a deletion timestamp. The query functions (Task 3) will set `deletedAt` via a separate UPDATE statement for soft-deletes.

**Import path for `PaginationResultsSchema` in `furigana.schema.ts`**: Use the `~/schema/pagination.schema` path alias, not a relative `./pagination.schema` import, to be consistent with how other files in the project import from `app/`.

**Test file location**: Both test files live alongside their implementation files in `app/schema/`. The `vitest.config.ts` includes `app/**/*.test.ts` in its test glob, so no config changes are needed.

**No barrel re-export needed**: The existing `app/lib/db/schema.ts` barrel re-exports from `furigana.db.ts`, not from `app/schema/`. The schema files in `app/schema/` are imported directly by their consumers (API routes, services, tests) via the `~/schema/...` path alias.

**Drizzle type alignment tests import from DB modules**: The `satisfies` alignment tests in `furigana.schema.test.ts` are the only place where schema test files import Drizzle types. This is intentional and acceptable — test files are never bundled for the client. Keep this import scoped to the alignment `describe` block with a comment explaining why the DB import appears in a schema test.

**`nextCursor` is nullable, not optional**: The distinction matters. `nullable` means the key is always present in the serialized JSON with a value of `null` when there are no more pages. `optional` would allow the key to be absent entirely. All downstream consumers — the sidebar query hook, the API client's `fetchFuriganaList`, and any future consumers — must be able to destructure `nextCursor` unconditionally. The `nextCursor` absent rejection test (factory Test 7) documents this contract explicitly.

**Non-array `data` test guards against ORM footguns**: The Drizzle `.get()` method returns a single row object; `.all()` returns an array. If a future refactor mistakenly uses `.get()` in the list query, the returned value will be an object, not an array. Calling `.map()` on that object in the sidebar component crashes at runtime with a non-obvious error. The `data` non-array rejection test (factory Test 8) ensures this is caught at the schema boundary before the data reaches the UI render path.
