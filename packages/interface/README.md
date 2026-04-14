# @starterkit/interface

Shared Zod v4 schemas and TypeScript types consumed by both `@starterkit/api` and `@starterkit/web`.

## Purpose

This package is the single source of truth for API contracts. Defining schemas here ensures that the backend validation and the frontend parsing logic stay in sync — with full type inference, no duplication, and no manual syncing of types.

## Scripts

```bash
pnpm build         # Compile to dist/ (CJS + ESM)
pnpm dev           # Watch mode rebuild
pnpm type-check    # TypeScript check without emit
```

## Output

tsup produces a dual-format bundle:

| File               | Format      | Used by                          |
| ------------------ | ----------- | -------------------------------- |
| `dist/index.js`    | ESM         | `@starterkit/web` (Vite bundler) |
| `dist/index.cjs`   | CJS         | `@starterkit/api` (NodeNext)     |
| `dist/index.d.ts`  | Types (ESM) | Both apps                        |
| `dist/index.d.cts` | Types (CJS) | Both apps                        |

## Development workflow

During local development, both apps resolve `@starterkit/interface` directly to `packages/interface/src/index.ts` via TypeScript `paths` aliases — **no rebuild is needed** when editing schemas. The compiled `dist/` is only used in production builds.

## Adding schemas

Create a new file under `src/schemas/` and re-export it from `src/index.ts`:

```typescript
// src/schemas/post.ts
import * as z from "zod";

export const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string(),
});

export type CreatePostDto = z.infer<typeof CreatePostSchema>;
```

```typescript
// src/index.ts
export * from "./schemas/post.js";
```

## Zod v4 notes

- Use `z.email()` and `z.uuid()` directly — **not** `z.string().email()` (deprecated in Zod v4).
- Use `createApiResponseSchema<T>()` from `src/schemas/common.ts` to wrap response payloads in a consistent envelope.
