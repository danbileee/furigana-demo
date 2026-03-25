---
name: Furigana MVP — Project Context
description: Core facts about the Furigana MVP project structure, roadmap, and milestone sequencing
type: project
---

Furigana MVP is a React Router v7 SSR single-page app that generates furigana (ruby annotation) readings for Japanese text using GPT-4o-mini.

**Architecture**: Textarea input → server-side `action` → GPT-4o-mini API → `漢字{よみ}` annotation string → parser → `FuriganaToken[]` → `<ruby>` JSX rendering.

**Milestone sequencing** (8 milestones total):

1. Core Generation Loop (weight 0.23) — annotation string parser, ruby rendering, no persistence
2. Turso Storage and History Sidebar (weight 0.22) — persistence, shadcn/ui Sidebar component
3. View Mode Toggle and Preference Persistence (weight 0.08) — Always/On Hover CSS toggle
4. AI Title Generation (weight 0.10) — background useFetcher title call
5. Inline Title Editing — double-click sidebar row
6. Soft-Delete and Trash Menu — trash store, restore flow
   7a. Relative Timestamps — formatTimestamp utility
   7b. Session Persistence — last-viewed entry on reload
7. Mobile Sidebar Drawer — hamburger + drawer overlay

**Master PRD**: `.taskmaster/docs/plans/2026-03-17 MVP/prd.md`
**Roadmap**: `.taskmaster/docs/plans/2026-03-17 MVP/roadmap.md`
**Milestone 2 sub-PRD**: `.taskmaster/docs/plans/2026-03-17 MVP/milestones/2-Turso Storage and History Sidebar/prd.md`

**M2 key decisions (updated 2026-03-25 after review):**

- Table name is `furiganas` (not `entries`); all query functions use `Furigana` prefix
- Zod schemas derived from Drizzle via `drizzle-orm/zod` (`createSelectSchema`/`createInsertSchema`) with refinements
- Domain Zod schemas in `app/schema/furigana.schema.ts`; generic pagination schemas in `app/schema/pagination.schema.ts`
- Generic `PaginationResultsSchema(itemSchema)` factory — `total` field REMOVED (no COUNT(\*)), envelope is `data: T[]`, `nextCursor`, `hasMore`
- `raw_text_snippet` stored as a column (computed at insert time), NOT computed via SUBSTR on every query
- Cursor SQL uses row-value comparison `(created_at, id) < (?, ?)` — libSQL supports SQLite 3.44.0+
- Single partial index `WHERE deleted_at IS NULL` replaces two separate indexes
- Versioned migrations (`drizzle-kit generate` + `drizzle-kit migrate`), NOT `drizzle-kit push`
- `staleTime: Infinity` for sidebar query, explicit invalidation via route-change detection (not useNavigation-based useEffect)
- `ClientOnly` wrapper for SidebarProvider (SSR hydration fix for window.matchMedia)
- `SidebarErrorBoundary` wraps AppSidebar
- Rate limiting (10 req/IP/min) and max raw_text length (5,000 chars) on home action
- Annotation string validated via `parseAnnotationString()` before DB write
- `sanitizeRawText()` strips HTML, control chars, BiDi overrides
- Axios auth header and 401 interceptor removed (no auth in MVP)
- Deploy target: Node.js long-lived process (Fly.io/Railway), Turso singleton OK
- Accepted risks: no CSRF (no auth), no user_id (single user), no HMAC on cursors, no auth on API routes

**Why:** The core generation loop (M1) must be stable before any persistence or UI features build on top of it. All downstream milestones depend on the `FuriganaToken[]` data contract and the `annotationString` action return.

**How to apply:** When generating future milestone sub-PRDs, reference M2's established contracts: `furiganas` table name (with `raw_text_snippet` column), `FuriganaRow`/`FuriganaSidebar` types, generic `PaginationResultsSchema` (no `total` field) for any new paginated endpoints, shadcn/ui Sidebar component tree (`SidebarProvider` → `ClientOnly` → `SidebarErrorBoundary` → `AppSidebar` → `SidebarInset`), row-value cursor pattern, and `FuriganaPaginationResultsSchema` response shape.
