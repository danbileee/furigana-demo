---
name: feedback_review_approach
description: How to structure task reviews — what to check and in what order
type: feedback
---

When a developer explicitly states that a naming deviation from the task plan is intentional and by design, accept it as an architectural decision and do not flag it as a blocking issue. Treat the developer's confirmation as the authoritative override over the plan document.

**Why:** The task plan is guidance, not a contract. The developer has context about downstream consumers and intentional API surface decisions that may not be reflected in the plan. Flagging accepted deviations wastes review cycles.

**How to apply:** If a naming or structural deviation is raised during review and the developer says "intentional by design", immediately accept it, save the decision to memory, and continue with the remaining review steps without re-raising it.

---

Effective review order for this project:

1. Read the task plan document first (in `.taskmaster/docs/plans/`), then read all changed files in parallel.
2. Check Phase 1 (schema/rename changes) by diffing against committed state — `git diff` reveals what is uncommitted.
3. Verify the parser implementation against plan test cases directly, not just against the algorithm description. The algorithm description may be incomplete; the test cases are authoritative.
4. Run quality gates in this order: `pnpm type-check`, `pnpm exec eslint`, `pnpm exec vitest run` (specific files), `pnpm exec vitest run --coverage`.
5. Run `pnpm exec prettier --write .` and re-run tests to confirm formatting changes don't break anything.
6. Check git status to understand what is committed vs uncommitted before guiding commit strategy.

**Why:** The developer's workflow produces all changes as uncommitted working-tree modifications. The commit step comes after the review passes. Checking git status early avoids confusion about what is "new" vs what was already committed.

**How to apply:** Always run `git status` and `git diff` early in the review to understand the full scope of uncommitted changes before running quality gates.
