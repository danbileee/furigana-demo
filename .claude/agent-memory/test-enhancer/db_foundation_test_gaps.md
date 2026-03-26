---
name: DB Foundation Test Gaps
description: Gaps found in Task 1 Database Foundation Setup test plan — partial index verification, env edge cases, type exports
type: project
---

Key gaps identified in the Task 1 test strategy:

1. No test for index column order (DESC) — only checks index name and uniqueness
2. No test for index WHERE clause content — the most critical piece given Drizzle Issue #3349
3. No env var edge case for whitespace-only URLs or tokens
4. No test verifying `NewFurigana` type shape (only `Furigana` is tested)
5. No test for `authToken` passthrough to `createClient` in file: URL case (should be `""`)
6. No test verifying the table name in SQL is "furiganas"
7. Missing test for `https://` URL scheme (neither file: nor libsql:) — should require token

**Why:** The partial index WHERE clause is the single highest-risk item in this task due to Drizzle Issue #3349. Tests that only check the index name miss the actual failure mode.

**How to apply:** Prioritize index structure tests and env var edge cases when reviewing or implementing Task 1 tests.
