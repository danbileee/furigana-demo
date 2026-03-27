---
name: Pagination and Domain Schema Test Gaps
description: Key gaps found in Task 2 test plan — Drizzle type alignment, nextCursor contract, non-array data, datetime precision, coverage config
type: project
---

Key gaps identified in the Task 2 (Generic Pagination and Domain Schemas) test strategy:

1. No compile-time test verifying FuriganaRow/FuriganaInsert align with Drizzle Furigana/NewFurigana types — highest-value gap since drizzle-zod is banned
2. No test for missing `nextCursor` (absent vs null) — critical for exactOptionalPropertyTypes contract
3. No test for `data` as non-array (single object) — catches common `.get()` vs `.all()` ORM bug
4. No test for date-only ISO strings in CursorSchema — SQLite can return these
5. No test for `deletedAt` with invalid non-null datetime string
6. No test for empty `rawText` or empty `title` string — product decision needed on min-length
7. No compile-time test that FuriganaPaginationResults matches PaginationResults<FuriganaSidebar>
8. Coverage config (`app/lib/**/*.ts`) excludes `app/schema/**/*.ts` — schema files won't appear in coverage reports

**Why:** Hand-written schemas without drizzle-zod have zero automated connection to Drizzle types. Type alignment tests are the primary mitigation.

**How to apply:** Prioritize Drizzle type alignment tests (item 1) and API contract tests (items 2-3) when implementing or reviewing Task 2 tests.
