---
name: Task 3 Query Functions Test Gaps
description: Key gaps found in Task 3 (DB Query Functions + Cursor Pagination) test plan — projection leak, deleted cursor boundary, empty cursor, type alignment
type: project
---

Key gaps identified in the Task 3 test strategy (12 existing tests across cursor service and query functions):

1. **No projection leak test for listFuriganas** — missing verification that `rawText`, `annotationString`, `updatedAt`, `deletedAt` are absent from pagination items. A regression sends large payloads to sidebar.
2. **No test for cursor boundary row being soft-deleted between pages** — real scenario when user deletes a history item while scrolling. Cursor is a position marker, not a row reference, so it should still work.
3. **No empty string cursor test** — most common real-world invalid cursor (stripped query param). Empty string is valid base64 but `JSON.parse("")` throws.
4. **No base64-valid non-JSON cursor test** — separate code path from invalid base64.
5. **No `createdAt` format strictness test** — date-only ISO strings and non-UUID ids should be rejected by CursorSchema.
6. **No 30-character rawText boundary test** — classic off-by-one for `.slice(0, 30)`.
7. **No duplicate ID insert test** — verifies "no silent failures" error propagation contract.
8. **No `limit = 1` test** — smallest valid page, tightest `+1` probe boundary.
9. **No default limit (20) verification test** — catches accidental constant changes.
10. **No compile-time type alignment tests** — `insertFurigana` return vs `FuriganaInferredRow`, `listFuriganas` return vs `FuriganaPaginationResults`.
11. **No non-null title insert test** — only `null` case tested.
12. **No `updatedAt` auto-population test** — `$defaultFn` behavior should be verified.

**Why:** Items 1-3 are the highest-risk gaps. Projection leak (1) is a performance and data exposure issue. Deleted cursor boundary (2) is the exact scenario that occurs during normal user interaction. Empty cursor (3) is the most common error input in production.

**How to apply:** Prioritize P0 items (projection leak, deleted cursor boundary) and P1 items (empty cursor, duplicate ID, createdAt strictness) when implementing tests. Phase implementation: A (with TDD), B (post-compile), C (pre-merge).
