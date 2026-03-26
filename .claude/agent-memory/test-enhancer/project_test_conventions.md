---
name: Project Test Conventions
description: Vitest test patterns used in the Furigana project — env var handling, dynamic imports, module reset pattern
type: project
---

The project uses Vitest with `globals: true` and `environment: "node"`.

For server-only clients that throw at module import time (e.g., `app/lib/ai/client.ts`), the established test pattern is:

1. Save original env var values before tests
2. `vi.resetModules()` in `beforeEach`
3. Set env vars, then `await import("~/lib/...")` to trigger module-level validation
4. Restore env vars in `afterEach`
5. Use `await expect(import(...)).rejects.toThrow("VAR_NAME")` for error cases

**Why:** Module-level singletons run validation on import. `vi.resetModules()` ensures each test gets a fresh module evaluation.

**How to apply:** All new server-only client tests (db, ai, etc.) should follow this exact pattern. Do not mock the module itself — mock the external dependency (e.g., `@libsql/client`).
