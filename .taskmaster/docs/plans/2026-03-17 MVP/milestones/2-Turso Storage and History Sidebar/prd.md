# Milestone 2: Turso Storage and History Sidebar

- **Project**: Furigana MVP -- AI Japanese Reading Assistant
- **Milestone**: 2 of 8
- **Generated**: 2026-03-21
- **Updated**: 2026-03-25 (review incorporation: row-value cursor SQL, cache invalidation fix, SSR hydration strategy, rate limiting, versioned migrations, annotation string validation, sanitization rules, total field removal, partial index, ErrorBoundary for sidebar, raw_text_snippet stored column, env startup validation, staleTime Infinity, bundle audit, Axios auth cleanup, scroll position preservation, deferred items documented)
- **Source PRD**: `.taskmaster/docs/plans/2026-03-17 MVP/prd.md`
- **Source Roadmap**: `.taskmaster/docs/plans/2026-03-17 MVP/roadmap.md`
- **Milestone Weight**: 0.22 -- Second-heaviest milestone; establishes the persistence layer and sidebar architecture that all subsequent milestones (3--8) depend on

---

## Problem Statement

Milestone 1 delivers the core generation loop (text input -> GPT-4o-mini -> annotation string -> `FuriganaToken[]` -> ruby rendering), but generated results live only in a server-side in-memory `Map` (`token-storage.service.ts`) and are consumed on first read. Users lose all generated furigana on page reload, cannot revisit past entries, and have no history context. This milestone solves three problems:

1. **No persistence** -- Generated annotation strings and source text are lost after a single view. Users who close or reload the tab lose their work entirely.
2. **No browsing history** -- There is no way to revisit previously generated furigana. Each session starts from scratch.
3. **No entry management** -- Without a sidebar, users cannot switch between entries, create new submissions, or understand what content they have generated.

These gaps block every downstream feature: view mode toggle (M3), AI title generation (M4), inline title editing (M5), soft-delete/trash (M6), session persistence (M7b), and mobile drawer (M8) all require persisted entries and the sidebar component tree.

---

## User Journey

### New Submission with Persistence

1. User is on the home page with the input textarea (carried over from M1).
2. User pastes Japanese text and clicks "Generate Furigana" (or presses Cmd/Ctrl+Enter).
3. The `action` sanitizes the input text (stripping HTML tags, control characters, and BiDi overrides), validates length (max 5,000 characters), generates furigana via GPT-4o-mini (M1 flow), validates the annotation string with `parseAnnotationString()`, then **writes the entry to Turso** before redirecting.
4. The user sees the furigana reading view on the `/furigana/:id` route.
5. The **left sidebar** shows the new entry at the top, displaying the first ~30 characters of the submitted text as its title (AI title generation is deferred to M4). A relative timestamp shows "just now."
6. The entry is highlighted as the active sidebar row.

### Revisiting a Past Entry

1. User has multiple entries listed in the sidebar (from prior submissions).
2. User clicks a sidebar entry.
3. The main content area loads that entry's furigana reading view by navigating to `/furigana/:id`.
4. The clicked sidebar row becomes the active (highlighted) row.

### Starting a New Submission

1. User clicks the "New" button in the sidebar header.
2. The main area navigates to the home route, showing the empty textarea input state.
3. No sidebar row is highlighted (no active entry).
4. Previous entries remain in the sidebar, accessible for later.

### Page Reload

1. User reloads the page while viewing `/furigana/:id`.
2. The `loader` fetches the entry from Turso by ID and renders the reading view.
3. The sidebar populates with all entries via TanStack Query's `useInfiniteQuery` hook.
4. The correct sidebar row is highlighted as active.

### Infinite Scroll in Sidebar

1. User has more than 20 entries in the database.
2. The sidebar loads the first 20 entries on initial render via `useInfiniteQuery`.
3. As the user scrolls to the bottom of the sidebar entry list, the next page is fetched automatically using cursor-based pagination.
4. New entries are appended seamlessly to the existing list.
5. When there are no more entries (`nextCursor` is `null`), scrolling stops triggering fetches.

---

## Feature Specifications

### Core Features

#### 1. Turso Database Schema and Client

A SQLite-compatible database hosted on Turso (free tier) stores all generated entries. The schema uses a single `furiganas` table with soft-delete support (via `deletedAt` column) to prepare for Milestone 6 without requiring a schema migration later.

**`furiganas` table schema:**

| Column              | Type | Constraints            | Description                                                                    |
| ------------------- | ---- | ---------------------- | ------------------------------------------------------------------------------ |
| `id`                | TEXT | PRIMARY KEY            | UUID v4 generated server-side via `crypto.randomUUID()`                        |
| `raw_text`          | TEXT | NOT NULL               | Original user-submitted text (sanitized)                                       |
| `raw_text_snippet`  | TEXT | NOT NULL               | First 30 characters of `raw_text`, computed and stored at insert time          |
| `annotation_string` | TEXT | NOT NULL               | Raw `漢字{よみ}` annotation string from GPT-4o-mini (validated before storage) |
| `title`             | TEXT | nullable, default NULL | AI-generated title (populated in M4); NULL until then                          |
| `created_at`        | TEXT | NOT NULL               | ISO 8601 timestamp string (e.g., `2026-03-21T14:30:00.000Z`)                   |
| `deleted_at`        | TEXT | nullable, default NULL | ISO 8601 timestamp for soft-delete (populated in M6); NULL = active            |

**Indexes:**

| Index Name                             | Columns                                               | Purpose                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `idx_furiganas_active_cursor` (UNIQUE) | `(created_at DESC, id DESC) WHERE deleted_at IS NULL` | Partial index for cursor-based pagination; covers the common query filtering soft-deleted rows and ordering by creation time |

**Decision: Single partial index replaces two separate indexes.** The previous design had both `idx_furiganas_cursor` on `(created_at DESC, id DESC)` and `idx_furiganas_deleted_at` on `(deleted_at)`. Since all pagination queries filter `WHERE deleted_at IS NULL`, a single partial index with that WHERE clause covers both the cursor seek and the soft-delete filter. This reduces write overhead (one index to maintain instead of two) and is more space-efficient. libSQL (Turso's engine, based on SQLite 3.44.0+) fully supports partial indexes.

**Decision: `raw_text_snippet` stored as a column.** Rather than computing `SUBSTR(raw_text, 1, 30)` on every list query, the snippet is computed once at insert time and stored as a column. This avoids repeated string operations on potentially large `raw_text` values during pagination queries. The `insertFurigana()` function computes `rawText.slice(0, 30)` before the INSERT.

**Design decisions:**

- `id` is TEXT (UUID) rather than INTEGER autoincrement because entries are created server-side with `crypto.randomUUID()` and the ID is used in the URL path (`/furigana/:id`).
- Timestamps are stored as ISO 8601 TEXT strings rather than SQLite INTEGER (Unix epoch) for human readability in database inspection and straightforward `new Date()` parsing in TypeScript.
- `title` is nullable from the start so M4 can UPDATE it without schema changes.
- `deleted_at` is nullable from the start so M6 can SET it without schema changes.
- **Table name is `furiganas`** (not `entries`) to align with domain terminology. All query functions, resource routes, and Zod schemas use the `furigana` noun consistently.

#### 2. Drizzle ORM Integration

Drizzle ORM (`drizzle-orm` with `@libsql/client` driver) provides type-safe query building and schema definition. This avoids raw SQL strings, integrates with TypeScript strict mode, and provides compile-time type checking on all database operations.

**Module structure:**

- `app/lib/db/schema.ts` -- Drizzle table definition for `furiganas` (including partial index)
- `app/lib/db/client.ts` -- Server-only Turso/libSQL client singleton with startup validation
- `app/lib/db/queries.ts` -- Typed query functions (`insertFurigana`, `getFuriganaById`, `listFuriganas`)

**Startup validation:** The `client.ts` module validates that `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are present at import time. If either is missing, the module throws an error with a clear message (e.g., `"Missing required environment variable: TURSO_DATABASE_URL. Set it in .env or your deployment config."`). This fail-fast behavior prevents cryptic runtime errors during the first database operation. For local development with `file:local.db`, `TURSO_AUTH_TOKEN` may be empty -- the validation allows an empty string for the auth token when the URL starts with `file:`.

#### 3. Entry Persistence in Route Action

The existing `home.tsx` `action` currently generates furigana tokens, stores them in an in-memory `Map` via `token-storage.service.ts`, and redirects to `/furigana/:id`. This milestone replaces the in-memory store with a Turso INSERT:

1. `action` sanitizes the submitted text (see Input Sanitization below).
2. `action` validates the text length (max 5,000 characters) via the Zod schema.
3. `action` enforces rate limiting (max 10 requests per IP per minute).
4. `action` generates the annotation string via `generateFurigana()` (unchanged from M1).
5. `action` validates the annotation string by running `parseAnnotationString()` on the GPT output. If parsing fails (malformed bracket notation), the action returns an error.
6. `action` calls `insertFurigana()` to write `{ id, rawText, rawTextSnippet, annotationString, createdAt }` to Turso.
7. `action` redirects to `/furigana/:id` with the persisted entry's ID.
8. The in-memory `token-storage.service.ts` is removed.

**Rate limiting:** The `home.tsx` action enforces a rate limit of 10 requests per IP address per minute. This is implemented as an in-memory rate limiter (a `Map<string, { count: number; resetAt: number }>` keyed by IP address, cleared on a 60-second interval). The IP is read from the request's `X-Forwarded-For` header (common in reverse proxy deployments) or `request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()`, falling back to a constant string `"unknown"` if unavailable. When the limit is exceeded, the action returns a 429 status with a user-facing message: "Too many requests. Please wait a moment and try again." This is intentionally simple for the single-user MVP; a production rate limiter would use Redis or a similar store.

**Annotation string validation before DB write:** The GPT output is not trusted blindly. Before the INSERT, the action runs `parseAnnotationString(annotationString)` to confirm the output conforms to the `漢字{よみ}` bracket notation format. If the parser returns an error or empty token array, the action returns an error response with the original textarea content preserved. This prevents storing unparseable annotation strings that would crash the reading view on subsequent loads.

**Critical change**: The `furigana.service.ts` must also return the raw `annotationString` (the `漢字{よみ}` string) in addition to the parsed `FuriganaToken[]` array, because the annotation string is the storage format. The parsed tokens are the render format. Both are needed: the annotation string for Turso INSERT, the tokens for immediate redirect rendering (to avoid re-parsing on the redirect target).

#### 4. Input Sanitization

All user-submitted text is sanitized before processing. The sanitization function `sanitizeRawText()` is defined in `app/lib/sanitize.ts` (server-only) and performs the following operations in order:

1. **Strip HTML tags**: Remove all HTML tags using a regex pattern `/(<([^>]+)>)/gi`. This prevents any HTML from being stored, even though `raw_text` is never rendered via `dangerouslySetInnerHTML` (the annotation string is parsed into structured `FuriganaToken[]` components rendered as React elements with `<ruby>` tags).
2. **Remove control characters**: Strip Unicode control characters (C0 controls U+0000-U+001F except tab U+0009, newline U+000A, carriage return U+000D; C1 controls U+0080-U+009F; and delete U+007F) using a regex character class.
3. **Remove BiDi overrides**: Strip Unicode bidirectional override characters (U+200E, U+200F, U+202A-U+202E, U+2066-U+2069) that could visually reorder displayed text in unexpected ways.
4. **Normalize whitespace**: Collapse consecutive whitespace (spaces, tabs) into single spaces. Preserve paragraph breaks (double newlines).
5. **Trim**: Remove leading and trailing whitespace.

The sanitized text is what gets stored in `raw_text` and passed to `generateFurigana()`. The `raw_text_snippet` column is computed from the sanitized text.

**Decision: raw_text is never rendered as HTML.** The annotation string is parsed into structured `FuriganaToken[]` components (React elements with `<ruby>` tags), never via `dangerouslySetInnerHTML`. The `raw_text` is rendered as text content only (e.g., in the textarea for re-editing, or as the sidebar snippet). Sanitization is still applied as defense-in-depth against control characters and BiDi overrides that could affect display, but XSS via innerHTML is not a vector in this architecture.

#### 5. Entry Loading in Route Loader

The `/furigana/:id` route's `loader` currently reads from the in-memory `Map` (and consumes the entry on read). This milestone replaces it with a Turso SELECT:

1. `loader` receives `params.id`.
2. `loader` calls `getFuriganaById(params.id)` to fetch from Turso.
3. If the entry exists and is not soft-deleted (`deleted_at IS NULL`), the annotation string is parsed into `FuriganaToken[]` and returned to the component.
4. If the entry does not exist or is soft-deleted, the loader throws a 404 response.

#### 6. History Sidebar Component (shadcn/ui Sidebar)

A left sidebar lists all active (non-deleted) entries in reverse-chronological order. The sidebar is built on **shadcn/ui's Sidebar component**, which provides composable structure, built-in responsive behavior (automatic `Sheet` on mobile), collapsible state management via `SidebarProvider`, and themed CSS variables that integrate with the existing shadcn/ui design system.

**Why shadcn/ui Sidebar:**

- **Mobile support built-in**: The component automatically renders as a `Sheet` (drawer overlay) on mobile viewports via the internal `useSidebar` hook's `isMobile` detection. This establishes the foundation for M8's mobile drawer without requiring a separate implementation -- M8 only needs to add a `SidebarTrigger` (hamburger button) to the mobile header.
- **Collapsible state management**: `SidebarProvider` manages open/collapsed state, including keyboard shortcut (Cmd+B / Ctrl+B) and programmatic toggle via `useSidebar()` hook. No custom state management needed.
- **Skeleton support**: `SidebarMenuSkeleton` provides built-in shimmer placeholders that match the menu item dimensions, eliminating custom skeleton implementation.
- **Theme integration**: Uses `--sidebar-*` CSS variables (`--sidebar-background`, `--sidebar-accent`, `--sidebar-border`, etc.) that integrate with shadcn/ui's theme system.

**Installation:**

```bash
pnpx shadcn@latest add sidebar --defaults
```

This installs the Sidebar component into `app/components/ui/sidebar.tsx` along with its dependencies (Sheet, Separator, Tooltip, Input, Skeleton).

**SSR hydration strategy for SidebarProvider:** The `SidebarProvider` uses `window.matchMedia` internally for `isMobile` detection, which causes a hydration mismatch between server and client renders. **Decision: Wrap the sidebar layout in a `ClientOnly` wrapper with a skeleton fallback.** This approach is chosen over `suppressHydrationWarning` because:

- `suppressHydrationWarning` only suppresses the warning on the element itself, not deep children. The `SidebarProvider` propagates `isMobile` state to multiple child components (Sheet rendering, collapse behavior), making the mismatch affect the entire subtree.
- A `ClientOnly` wrapper with a skeleton fallback (matching the sidebar width via `--sidebar-width` CSS variable) provides a clean loading experience. The skeleton renders during SSR and the first client paint, then the full sidebar hydrates. Since the sidebar data is already fetched client-side via TanStack Query (which shows its own skeleton), the user experience is consistent -- they see a loading state that resolves to content.
- The `ClientOnly` component can be a simple wrapper: render `null` (or a skeleton) on the server, render `children` after `useEffect` fires on the client.

```tsx
// app/routes/layout.tsx
<QueryClientProvider client={queryClient}>
  <SidebarProvider defaultOpen={true}>
    <ClientOnly fallback={<SidebarSkeleton />}>
      <AppSidebar activeEntryId={activeEntryId} />
    </ClientOnly>
    <SidebarInset>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </SidebarInset>
  </SidebarProvider>
</QueryClientProvider>
```

**ErrorBoundary wrapping AppSidebar:** The `AppSidebar` component is wrapped in a React ErrorBoundary. If the sidebar crashes (e.g., malformed data from the API, unexpected TanStack Query state), the error boundary renders a minimal fallback UI ("Sidebar unavailable. Reload to try again.") instead of crashing the entire layout. The main content area (input textarea and reading view) remains fully functional. This is important because the sidebar is a non-critical navigation aid -- a sidebar failure must not block the core generation loop.

**Component tree using shadcn/ui Sidebar primitives:**

```tsx
// app/components/sidebar/AppSidebar.tsx
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSkeleton,
} from "~/components/ui/sidebar";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchFuriganaList } from "~/lib/api/furiganas";

function AppSidebar({ activeEntryId }: AppSidebarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey: ["furiganas", "list"],
      queryFn: ({ pageParam }) => fetchFuriganaList(pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: Infinity,
    });

  const entries = data?.pages.flatMap((page) => page.data) ?? [];

  // Preserve scroll position across navigations
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Restore scroll position after data updates
    container.scrollTop = scrollTopRef.current;

    const handleScroll = () => {
      scrollTopRef.current = container.scrollTop;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [data]);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>{/* "New" button -- navigates to home route */}</SidebarHeader>

      <SidebarContent ref={scrollContainerRef}>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <SidebarMenuItem key={index}>
                    <SidebarMenuSkeleton showIcon={false} />
                  </SidebarMenuItem>
                ))
              ) : isError ? (
                <div className="text-muted-foreground p-4 text-sm">
                  Failed to load entries.
                  <button onClick={() => void fetchNextPage()}>Retry</button>
                </div>
              ) : entries.length === 0 ? (
                <div className="text-muted-foreground p-4 text-center text-sm">No entries yet.</div>
              ) : (
                <>
                  {entries.map((entry) => (
                    <SidebarMenuItem key={entry.id}>
                      <SidebarMenuButton asChild isActive={entry.id === activeEntryId}>
                        <Link to={`/furigana/${entry.id}`}>
                          <span className="truncate">{entry.title ?? entry.rawTextSnippet}</span>
                          <span className="text-muted-foreground text-xs">
                            {entry.formattedDate}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {hasNextPage && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => void fetchNextPage()}
                        disabled={isFetchingNextPage}
                      >
                        {isFetchingNextPage ? "Loading..." : "Load more"}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>{/* Empty for now; trash icon added in M6 */}</SidebarFooter>
    </Sidebar>
  );
}
```

**Key shadcn/ui Sidebar configuration choices:**

- **`collapsible="offcanvas"`**: On mobile, the sidebar slides in from the edge as a Sheet overlay. On desktop, it can be toggled off-canvas entirely. This is the correct mode for a history sidebar that is not needed in a collapsed/icon state.
- **`variant="sidebar"` (default)**: Standard sidebar layout with border separator. The `SidebarInset` wrapper provides proper content area sizing.
- **`side="left"` (default)**: Sidebar appears on the left side.
- **`isActive` prop on `SidebarMenuButton`**: Handles active state styling automatically using `data-active` attribute and `--sidebar-accent` background color. No manual `bg-accent` class needed.
- **`SidebarMenuSkeleton`**: Used during initial loading state to render shimmer rows. Renders 5 skeleton items with `showIcon={false}` (no icons in our sidebar items).

**Skeleton loading state with shadcn/ui:**

```tsx
// Loading state while useInfiniteQuery is resolving
<SidebarMenu>
  {Array.from({ length: 5 }).map((_, index) => (
    <SidebarMenuItem key={index}>
      <SidebarMenuSkeleton showIcon={false} />
    </SidebarMenuItem>
  ))}
</SidebarMenu>
```

**Empty state:**

When there are zero entries, the `SidebarContent` area renders a centered, muted message: "No entries yet." The `SidebarHeader` with the "New" button remains visible.

**Sidebar entry row displays:**

- **Title**: `rawTextSnippet` from the stored column (first ~30 characters of `rawText`), truncated with CSS `truncate` class on `SidebarMenuButton`. AI-generated titles are not available until M4; the snippet is the permanent display in this milestone.
- **Timestamp**: The `createdAt` value formatted as a simple date string (e.g., "Mar 21"). Full relative timestamps ("2 minutes ago") are implemented in M7a.
- **Active state**: Handled by `SidebarMenuButton`'s `isActive` prop, which applies `data-active` attribute and `bg-sidebar-accent` background. When on the home route (input state), no `isActive` is true.

**Scroll position preservation:** The sidebar preserves its scroll position across route navigations using a ref-based approach. A `scrollTopRef` stores the current scroll offset of the `SidebarContent` container. When the user navigates to a different entry (which triggers a React Router navigation but does not unmount the sidebar), the scroll position is restored from the ref after the component re-renders. This prevents the sidebar from jumping to the top every time the user clicks an entry.

#### 7. Sidebar Data Loading via TanStack Query

The sidebar entry list is fetched client-side via TanStack Query's `useInfiniteQuery` hook. This replaces the original `clientLoader` approach with a more robust data-fetching solution. The `useInfiniteQuery` hook:

- Provides automatic cache management with configurable stale times.
- Enables infinite scroll pagination with cursor-based fetching.
- Handles loading, error, and refetching states declaratively.
- Avoids Turso reads on every SSR page load (reduces TTFB).
- Shows a skeleton UI (`SidebarMenuSkeleton` shimmer placeholder rows) during loading.
- Works correctly with SSR hydration (TanStack Query dehydrates/hydrates state automatically).

The sidebar data is fetched within the `AppSidebar` component using `useInfiniteQuery`, which calls the API function `fetchFuriganaList()` with cursor-based pagination. Since the query is managed by TanStack Query's global cache (via `QueryClientProvider`), the data persists across route navigations without re-fetching.

**Decision: `staleTime: Infinity` with explicit invalidation only.** The sidebar data uses `staleTime: Infinity` instead of a 30-second window. Since sidebar data only changes when the user creates, deletes, or edits an entry (all explicit actions within this app), there is no value in periodic revalidation. The cache is invalidated explicitly after mutations. `refetchOnWindowFocus` is set to `false` for this query. This reduces unnecessary network requests and eliminates the potential for mid-scroll data resets.

#### 8. New Button

A "New" button in the `SidebarHeader` navigates to the home route (`/`), resetting the main content area to the input textarea. The current entries remain in the sidebar. No sidebar row is highlighted after clicking "New."

#### 9. Application Layout Shell

A new layout component wraps the existing routes, providing the `SidebarProvider` + `Sidebar` + `SidebarInset` structure. This is implemented as a **layout route** in React Router v7:

```
routes.ts:
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("furigana/:id", "routes/furigana.$id.tsx"),
  ])
```

The layout route renders `SidebarProvider` wrapping the `AppSidebar` alongside a `SidebarInset` containing the `<Outlet>` for child routes. The layout also wraps the application in `QueryClientProvider` for TanStack Query support.

#### 10. Cursor-Based Pagination (Final Decision)

**This is the final pagination architecture decision for Milestone 2. Cursor-based (keyset) pagination is used throughout.**

The sidebar list and the `GET /api/furiganas` resource route use **cursor-based (keyset) pagination** with a `(createdAt, id)` composite cursor. This provides stable ordering, consistent results when new entries are inserted, and O(1) performance regardless of dataset size.

**Why cursor-based over page-based:**

| Criterion                      | Cursor-Based (keyset) -- CHOSEN                                                                            | Page-Based (offset/limit) -- REJECTED                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Consistency with inserts**   | Stable -- cursor anchors to a specific row; new entries above the cursor do not duplicate or shift results | Unstable -- new entries at the top shift all rows, causing duplicates when paginating forward |
| **Performance at scale**       | Constant -- index seek on `(created_at, id)` composite index                                               | Degrades with large offsets (SQLite scans skipped rows)                                       |
| **Infinite scroll support**    | Natural fit -- `getNextPageParam` maps directly to `nextCursor`                                            | Requires manual page tracking and offset arithmetic                                           |
| **TanStack Query integration** | `useInfiniteQuery` is designed for cursor-based patterns                                                   | Possible but requires extra state for page counters                                           |
| **Implementation complexity**  | Moderate -- cursor encoding/decoding, composite WHERE clause                                               | Low -- `LIMIT/OFFSET` SQL                                                                     |

**Cursor specification:**

- **Cursor tuple**: `(createdAt, id)` -- `createdAt` provides chronological ordering; `id` breaks ties when two entries share the same millisecond timestamp.
- **Encoding**: The cursor is a base64-encoded JSON string: `btoa(JSON.stringify({ createdAt: "2026-03-21T14:30:00.000Z", id: "uuid-here" }))`. This is opaque to the client.
- **Decoding**: The server decodes the cursor, validates the shape with Zod, and uses the values in the WHERE clause.
- **Sort order**: `ORDER BY created_at DESC, id DESC` -- newest entries first.

**SQL query pattern for cursor-based pagination (row-value comparison):**

```sql
-- First page (no cursor)
SELECT id, raw_text_snippet, title, created_at
FROM furiganas
WHERE deleted_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT :limit + 1;

-- Subsequent pages (with cursor)
SELECT id, raw_text_snippet, title, created_at
FROM furiganas
WHERE deleted_at IS NULL
  AND (created_at, id) < (:cursorCreatedAt, :cursorId)
ORDER BY created_at DESC, id DESC
LIMIT :limit + 1;
```

**Decision: Row-value comparison replaces the OR-based pattern.** The previous PRD specified `(created_at < :cursorCreatedAt OR (created_at = :cursorCreatedAt AND id < :cursorId))`. This is functionally equivalent but the row-value comparison `(created_at, id) < (:cursorCreatedAt, :cursorId)` is more concise, less error-prone, and allows the query planner to utilize the composite index more effectively. libSQL (Turso's engine) is based on SQLite 3.44.0+, which fully supports row-value comparisons in WHERE clauses. This is the canonical keyset pagination pattern.

**Note on list query:** The sidebar list query now reads directly from the `raw_text_snippet` column instead of computing `SUBSTR(raw_text, 1, 30)` on each query. This is simpler and avoids redundant computation.

The query fetches `limit + 1` rows. If `limit + 1` rows are returned, the extra row is dropped from the result and its `(createdAt, id)` is NOT used as the cursor -- instead, the last row in the returned `limit` rows provides the `nextCursor`. If fewer than `limit + 1` rows are returned, `nextCursor` is `null`.

**Pagination parameters for `GET /api/furiganas`:**

| Parameter | Type   | Default   | Description                                                                       |
| --------- | ------ | --------- | --------------------------------------------------------------------------------- |
| `cursor`  | string | undefined | Base64-encoded cursor from previous response's `nextCursor`. Omit for first page. |
| `limit`   | number | `20`      | Entries per page (max 50)                                                         |

**Response shape:**

```json
{
  "data": [{ "id": "...", "rawTextSnippet": "...", "title": null, "createdAt": "..." }],
  "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTAzLTIxVDE0OjMwOjAwLjAwMFoiLCJpZCI6InV1aWQtaGVyZSJ9",
  "hasMore": true
}
```

- `data`: Array of sidebar-shaped entries (max `limit` entries).
- `nextCursor`: Base64-encoded cursor string pointing to the last entry in `data`. `null` if there are no more entries.
- `hasMore`: Convenience boolean (`nextCursor !== null`). Simplifies client-side checks without null-coalescing the cursor string.

**Decision: `total` field removed.** The previous design included a `total` field (COUNT(_) of non-deleted entries). This has been removed because no UI element displays a total count. The sidebar uses infinite scroll with `hasMore` -- there is no "page X of Y" indicator or "47 entries" label. The COUNT(_) is pure overhead on every pagination request. If a total is needed in a future milestone, it can be added then.

**New entry handling with cursor-based pagination:**

When a new entry is submitted and the user is redirected to `/furigana/:id`, TanStack Query's cache is invalidated for the `['furiganas', 'list']` query key. This triggers a refetch starting from the first page (no cursor). The new entry appears at the top of the list because it has the newest `createdAt` value. Since cursor-based pagination is anchored by `(createdAt, id)` and not by positional offset, this insertion does not cause any duplication or shifting of entries in subsequent pages.

#### 11. Data Fetching with TanStack Query (React Query)

TanStack Query (`@tanstack/react-query`) provides declarative data fetching, caching, and synchronization for all client-side API calls. It replaces manual `fetch` calls in `clientLoader` with hooks that offer automatic cache management, background revalidation, and infinite scroll support.

**Installation:**

```bash
pnpm add @tanstack/react-query
```

**Setup -- QueryClientProvider in layout.tsx:**

```tsx
// app/routes/layout.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider, SidebarInset } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/sidebar/AppSidebar";
import { SidebarErrorBoundary } from "~/components/sidebar/SidebarErrorBoundary";
import { ClientOnly } from "~/components/ClientOnly";
import { SidebarSkeleton } from "~/components/sidebar/SidebarSkeleton";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

// Wrap the app layout:
<QueryClientProvider client={queryClient}>
  <SidebarProvider defaultOpen={true}>
    <SidebarErrorBoundary>
      <ClientOnly fallback={<SidebarSkeleton />}>
        <AppSidebar activeEntryId={activeEntryId} />
      </ClientOnly>
    </SidebarErrorBoundary>
    <SidebarInset>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </SidebarInset>
  </SidebarProvider>
</QueryClientProvider>;
```

**Query key structure:**

| Query Key               | Hook               | Purpose                               | Stale Time |
| ----------------------- | ------------------ | ------------------------------------- | ---------- |
| `['furiganas', 'list']` | `useInfiniteQuery` | Sidebar entry list (cursor-paginated) | `Infinity` |
| `['furiganas', id]`     | `useQuery`         | Single entry fetch by ID (future use) | 5 minutes  |

**Cache invalidation after new submission (action-level pattern):**

The previous PRD used a `useNavigation`-based `useEffect` pattern for cache invalidation. This was unreliable because `navigation.formAction` may be cleared before the effect fires. The updated pattern uses route-change detection after a POST action redirect:

```tsx
// In AppSidebar or layout.tsx
const queryClient = useQueryClient();
const location = useLocation();
const fetchers = useFetchers();
const prevLocationRef = useRef(location.pathname);

useEffect(() => {
  // Detect route change to a /furigana/:id path (indicating successful submission redirect)
  const isEntryRoute = location.pathname.startsWith("/furigana/");
  const didNavigate = prevLocationRef.current !== location.pathname;
  prevLocationRef.current = location.pathname;

  if (didNavigate && isEntryRoute) {
    void queryClient.invalidateQueries({ queryKey: ["furiganas", "list"] });
  }
}, [location.pathname, queryClient]);
```

**Rationale:** The action in `home.tsx` redirects to `/furigana/:id` on success. By detecting navigation to an entry route, we reliably trigger cache invalidation exactly when a new entry has been persisted. This avoids the race condition in the `useNavigation`-based pattern. Future milestones that add mutations (edit, delete) will use `useMutation` with `onSuccess` invalidation instead.

**Benefits of TanStack Query for this milestone:**

- **Automatic cache management**: The sidebar entry list is cached and shared across route navigations. No redundant fetches when navigating between `/` and `/furigana/:id`.
- **Infinite scroll support**: `useInfiniteQuery` + cursor-based pagination provides seamless infinite scroll with `fetchNextPage` and `hasNextPage`.
- **Explicit invalidation**: `staleTime: Infinity` combined with explicit invalidation ensures the sidebar only refetches when data actually changes.
- **Optimistic updates (future)**: M4+ can use `useMutation` with optimistic cache updates for instant UI feedback.
- **Error and loading states**: Declarative `isLoading`, `isError`, `isFetchingNextPage` flags replace manual state management.

### Annotation String Format Specification

The annotation string is the serialization format used to store furigana data in the database. It uses a bracket notation where kanji compounds are followed by their readings enclosed in curly braces.

**Format: `漢字{よみ}` bracket notation**

- Kanji or kanji compounds that need furigana are immediately followed by their hiragana reading in curly braces: `漢字{かんじ}`
- Non-kanji characters (hiragana, katakana, punctuation, latin, whitespace) appear as-is without braces.
- Curly braces are reserved characters and must not appear in the reading or surrounding text.
- Each kanji compound has exactly one reading enclosed in braces.

**Examples:**

| Input text           | Annotation string                              |
| -------------------- | ---------------------------------------------- |
| 東京は大きい都市です | `東京{とうきょう}は大{おお}きい都市{とし}です` |
| こんにちは           | `こんにちは` (no annotations needed)           |
| 桜の花が咲きました   | `桜{さくら}の花{はな}が咲{さ}きました`         |

**Validation:** The `parseAnnotationString()` function (from M1) is the canonical validator. It parses the annotation string into a `FuriganaToken[]` array. If parsing produces an empty array from non-empty input, or if the parser encounters malformed bracket notation (unmatched braces, empty readings `{}`), the string is considered invalid. The action validates the GPT output by running `parseAnnotationString()` before the Turso INSERT. This ensures every stored annotation string is guaranteed to be parseable by the reading view component.

### API Client Pattern

All client-side API calls use the existing axios instance at `app/lib/axios/instance.ts` wrapped in dedicated API functions. Each function validates the response with Zod before returning typed data.

**Decision: Remove Authorization header logic for M2.** The existing axios instance includes an Authorization header with a token from `localStorage` and auto-redirect to `/login` on 401 responses. Since there is no auth system in the MVP (single-user, no login), this logic is incoherent. For this milestone, the axios instance configuration is updated to remove the Authorization header injection and the 401 redirect interceptor. A `// TODO: Re-add auth header and 401 interceptor when auth is implemented (future milestone)` comment documents the intentional removal. The base URL configuration is preserved.

**API function layer -- `app/lib/api/furiganas.ts`:**

```typescript
// app/lib/api/furiganas.ts
import { createAxiosInstance } from "~/lib/axios/instance";
import { FuriganaPaginationResultsSchema, FuriganaRowSchema } from "~/schema/furigana.schema";

const axiosInstance = createAxiosInstance();

/**
 * Fetch paginated sidebar entries using cursor-based pagination.
 * @param cursor - Base64-encoded cursor from previous response. Omit for first page.
 * @param limit - Number of entries per page (default 20, max 50).
 */
export async function fetchFuriganaList(cursor?: string, limit: number = 20) {
  const response = await axiosInstance.get("/api/furiganas", {
    params: { cursor, limit },
  });
  return FuriganaPaginationResultsSchema.parse(response.data);
}

/**
 * Fetch a single furigana entry by ID.
 * @param id - UUID of the entry.
 */
export async function fetchFuriganaById(id: string) {
  const response = await axiosInstance.get(`/api/furiganas/${id}`);
  return FuriganaRowSchema.parse(response.data);
}
```

**Pattern rules:**

1. **All API functions live in `app/lib/api/`** -- one file per domain entity (e.g., `furiganas.ts`).
2. **Every response is validated with Zod** -- `Schema.parse(response.data)` ensures runtime type safety. If the server returns an unexpected shape, the Zod error is thrown and caught by TanStack Query's error handling.
3. **API functions are consumed by TanStack Query hooks** -- they are not called directly from components. The `queryFn` in `useInfiniteQuery`/`useQuery` wraps the API function.
4. **Error propagation** -- All HTTP errors (4xx, 5xx) propagate as `AxiosError` instances, which TanStack Query catches and exposes via `isError` and `error` fields.
5. **No direct `fetch()` calls** -- All HTTP requests go through the axios instance to ensure consistent base URL and timeout configuration.

### Interactions and Behaviors

- **Sidebar scroll independence**: The sidebar scrolls independently of the main content area. shadcn/ui Sidebar's `SidebarContent` component has built-in `overflow-y: auto` styling. Cursor-based pagination ensures the initial load is bounded to 20 entries, with more loaded on demand via infinite scroll.

- **Active state tracking**: The active entry ID is derived from the URL path parameter (`:id` in `/furigana/:id`). When the URL is `/` (home route), no entry is active. This approach requires no additional React state; the URL is the source of truth. The `isActive` prop on `SidebarMenuButton` handles the visual highlight.

- **Sidebar entry click**: Clicking a sidebar row navigates to `/furigana/:id` using React Router's `<Link>` component (rendered via `SidebarMenuButton asChild`). Navigation triggers the route loader, which fetches the entry from Turso and renders the reading view.

- **Skeleton loading state**: While `useInfiniteQuery` is in its initial loading state (`isLoading === true`), the sidebar renders 5 `SidebarMenuSkeleton` components. Once data arrives, the placeholders are replaced by actual entries. If there are no entries, the sidebar shows an empty state message ("No entries yet").

- **Empty sidebar state**: When there are zero entries in Turso, the sidebar displays a centered, muted message: "No entries yet." The "New" button remains visible and functional.

- **Post-submission sidebar update**: After a successful submission, the `action` redirects to `/furigana/:id`. The route change is detected, and TanStack Query cache for `['furiganas', 'list']` is invalidated, triggering a refetch from the first page (no cursor). The new entry appears at the top of the list.

- **Infinite scroll pagination**: When `hasNextPage` is true, a "Load more" button at the bottom of the sidebar entry list triggers `fetchNextPage()` via TanStack Query's `useInfiniteQuery`. The `getNextPageParam` callback extracts `nextCursor` from the last page response. Loaded entries are appended to the existing list. The button disappears when `nextCursor` is `null`.

### UI/UX Considerations

- **Sidebar width**: Controlled by the `--sidebar-width` CSS variable (default `16rem` / 256px). Customizable via `style` prop on `SidebarProvider` if needed. Does not resize. The main content area (`SidebarInset`) takes the remaining width automatically.

- **Sidebar visibility**: The shadcn/ui Sidebar with `collapsible="offcanvas"` is always visible on desktop by default (`defaultOpen={true}`). On mobile viewports, the component automatically renders as a `Sheet` overlay via the internal `isMobile` detection. In this milestone, no `SidebarTrigger` is rendered on mobile, so mobile users cannot open the sidebar. This is explicitly accepted -- the main content area (input + reading view) remains fully functional on mobile. Only history browsing is blocked on mobile until M8 adds the hamburger `SidebarTrigger`.

- **Entry row truncation**: Title text (`rawTextSnippet` from the stored column) is truncated with the `truncate` utility class on the span inside `SidebarMenuButton`. No wrapping.

- **Active row highlight**: Handled automatically by `SidebarMenuButton`'s `isActive` prop, which uses `data-active` attribute and `bg-sidebar-accent` / `text-sidebar-accent-foreground` styling from the shadcn/ui theme. No manual class toggling needed.

- **Reading-first layout**: The `SidebarInset` content area occupies the majority of the screen width. The sidebar is a narrow navigation aid, not a primary content area.

- **No layout shift on sidebar load**: The sidebar column occupies its fixed width from SSR render (with the `ClientOnly` skeleton fallback). When TanStack Query resolves, entries replace skeletons without shifting the main content area. `SidebarInset` handles the content area offset automatically.

- **Keyboard shortcut**: The shadcn/ui Sidebar provides Cmd+B (Mac) / Ctrl+B (Windows) to toggle the sidebar out of the box via `SidebarProvider`. No custom implementation needed.

---

## Edge Cases and Error Handling

### Turso Write Failure After Successful AI Generation

If the Turso INSERT fails after GPT-4o-mini successfully generates the annotation string, the `action` returns an error response with the annotation string and original text preserved. The user sees an inline error message ("Something went wrong. Please try again.") with the textarea content intact. The annotation result is not lost silently -- it was never persisted, so the user can retry the full flow. No temporary caching of AI results is needed for MVP; the cost of one wasted API call is negligible at single-user scale.

### Entry Not Found (404)

If `/furigana/:id` is loaded with an ID that does not exist in Turso (e.g., a stale bookmark), the loader throws a 404 response. React Router renders the error boundary with a "Entry not found" message and a link to return to the home route.

### Soft-Deleted Entry Access

If `/furigana/:id` is loaded with an ID whose `deleted_at` is not NULL, the loader treats it identically to a missing entry (404). This prevents users from viewing entries that have been moved to trash (M6 behavior, but the guard is established now).

### Empty Sidebar

When there are no entries, the sidebar shows "No entries yet." The main area defaults to the input textarea. The "New" button is visible but functionally redundant (already on the input view).

### Sidebar Data Fetch Failure

If TanStack Query's `useInfiniteQuery` fails to fetch the sidebar list, the sidebar shows an error state with a "Failed to load entries" message and a "Retry" button (which calls `refetch()`). The main content area remains functional -- the user can still submit new text and view the result (the result route has its own loader). TanStack Query automatically retries once (configured via `retry: 1`) before surfacing the error.

### Sidebar Component Crash

If the `AppSidebar` component throws an unhandled error (e.g., malformed API data that bypasses Zod validation, unexpected TanStack Query state), the `SidebarErrorBoundary` catches the error and renders a minimal fallback: "Sidebar unavailable. Reload to try again." The main content area continues to function normally. This prevents a sidebar bug from taking down the entire application.

### Concurrent Submissions

If the user somehow triggers two submissions before the first redirect completes (e.g., double-clicking the submit button), the button's disabled state during submission (`navigation.state === 'submitting'`) prevents this. The existing M1 guard is sufficient.

### Rate Limit Exceeded

If the user exceeds 10 requests per minute on the `home.tsx` action, the action returns a 429 status with the message "Too many requests. Please wait a moment and try again." The textarea content is preserved. The rate limit counter resets after 60 seconds.

### Input Exceeds Maximum Length

The Zod schema enforces a maximum `raw_text` length of 5,000 characters (reduced from the 10,000-character client-side limit in M1). The server-side validation provides an additional guard. If the submitted text exceeds 5,000 characters after sanitization, the action returns a 400 error with the message "Text is too long. Maximum 5,000 characters." The textarea content is preserved.

### Invalid Annotation String from GPT

If the GPT output fails `parseAnnotationString()` validation (e.g., malformed bracket notation, empty readings), the action returns an error response with the original textarea content preserved. The malformed annotation string is never written to the database.

### Cursor-Based Pagination Edge Cases

- **Invalid cursor**: If `cursor` is not a valid base64 string or does not decode to a valid `{ createdAt, id }` shape, the API returns a 400 response with a Zod validation error. The client handles this via TanStack Query's error state.
- **Cursor pointing to deleted entry**: If the entry referenced by the cursor has been soft-deleted since the cursor was issued, the cursor still works correctly because the WHERE clause filters by `(createdAt, id)` position, not by row existence. The cursor is a positional marker, not a row reference.
- **Limit exceeds maximum**: If `limit` exceeds 50, the API returns a 400 response with a validation error. The Zod schema for query parameters enforces `limit <= 50`.
- **No more entries**: If `nextCursor` is `null`, `useInfiniteQuery`'s `hasNextPage` is `false` and no more pages are fetched. The "Load more" button is hidden.
- **New entry shifts cursor positions**: When a new entry is inserted, it has a `createdAt` newer than all existing entries. Cursors pointing to older entries are unaffected because the cursor's `(createdAt, id)` position is stable. The new entry only appears when the first page is refetched (via cache invalidation).
- **Concurrent new entries**: If multiple entries are created rapidly (same millisecond), the `id` component of the cursor breaks the tie, ensuring deterministic ordering. UUID v4 values have sufficient entropy to avoid collisions.
- **Empty first page**: If there are zero entries, the API returns `{ data: [], nextCursor: null, hasMore: false }`. The sidebar renders the empty state.
- **Cursor manipulation by client**: The base64-encoded cursor is opaque but not encrypted or signed (no HMAC). A client could craft a cursor to enumerate database entries at arbitrary positions. This is accepted risk for the single-user MVP: there is no PII in the database, and the WHERE clause still enforces `deleted_at IS NULL`, so no deleted data is exposed. Cursor signing should be considered before any multi-user support.

---

## Implementation Roadmap

### Objective

Persist every generated furigana entry to a Turso SQLite database and display a browsable history sidebar, enabling users to revisit past entries across page reloads. Replace the in-memory `token-storage.service.ts` with durable storage. Establish the application layout shell (shadcn/ui `SidebarProvider` + `Sidebar` + `SidebarInset`) that all subsequent milestones build upon. Integrate TanStack Query for client-side data fetching and caching, and define the API client pattern using axios with Zod validation.

### Key Components

**New components to create:**

| File                                              | Responsibility                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/components/ui/sidebar.tsx`                   | shadcn/ui Sidebar primitives (installed via `pnpx shadcn@latest add sidebar`)                                                                    |
| `app/lib/db/schema.ts`                            | Drizzle ORM table definition for `furiganas` (including partial index for cursor pagination)                                                     |
| `app/lib/db/client.ts`                            | Server-only Turso/libSQL client singleton with env var startup validation                                                                        |
| `app/lib/db/queries.ts`                           | Typed query functions: `insertFurigana`, `getFuriganaById`, `listFuriganas` (cursor-based with row-value comparison)                             |
| `app/lib/sanitize.ts`                             | `sanitizeRawText()` function for HTML stripping, control character removal, BiDi override removal                                                |
| `app/lib/rate-limit.ts`                           | In-memory rate limiter for the home action (10 req/IP/min)                                                                                       |
| `app/schema/pagination.schema.ts`                 | Generic pagination schemas (`CursorSchema`, `PaginationResultsSchema` factory) and cursor validation -- reusable across all paginated endpoints  |
| `app/lib/api/furiganas.ts`                        | Client-side API functions using axios instance + Zod validation (`fetchFuriganaList`, `fetchFuriganaById`)                                       |
| `app/routes/layout.tsx`                           | Layout route with `QueryClientProvider` + `SidebarProvider` + `ClientOnly` + `SidebarErrorBoundary` + `AppSidebar` + `SidebarInset` + `<Outlet>` |
| `app/routes/api/furiganas.ts`                     | Resource route for `GET /api/furiganas` (cursor-paginated sidebar list fetch)                                                                    |
| `app/routes/api/furiganas.$id.ts`                 | Resource route for `GET /api/furiganas/:id` (single entry fetch)                                                                                 |
| `app/components/sidebar/AppSidebar.tsx`           | Application sidebar using shadcn/ui primitives + TanStack Query `useInfiniteQuery` + scroll position preservation                                |
| `app/components/sidebar/SidebarErrorBoundary.tsx` | React ErrorBoundary wrapping AppSidebar with fallback UI                                                                                         |
| `app/components/sidebar/SidebarSkeleton.tsx`      | SSR skeleton fallback for `ClientOnly` wrapper                                                                                                   |
| `app/components/ClientOnly.tsx`                   | Generic ClientOnly wrapper (renders null on server, children after hydration)                                                                    |

**Existing components to modify:**

| File                               | Changes                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/routes/home.tsx`              | `action` adds sanitization, rate limiting, max length validation, annotation string validation, writes to Turso instead of in-memory store; remove `token-storage.service` import                     |
| `app/routes/furigana.$id.tsx`      | `loader` reads from Turso instead of in-memory store; parses annotation string to tokens                                                                                                              |
| `app/routes.ts`                    | Add layout route wrapping index and furigana routes; add API resource routes                                                                                                                          |
| `app/services/furigana.service.ts` | Return both `annotationString` and `FuriganaToken[]` from `generateFurigana()`                                                                                                                        |
| `app/schema/furigana.schema.ts`    | Add `FuriganaInsertSchema`, `FuriganaRowSchema`, `FuriganaSidebarSchema`, `FuriganaPaginationResultsSchema` (composed via generic `PaginationResultsSchema`); add `rawText` max length of 5,000 chars |
| `app/lib/axios/instance.ts`        | Remove Authorization header injection and 401 redirect interceptor; add TODO comment for future auth                                                                                                  |

**Components to remove:**

| File                                    | Reason                                                             |
| --------------------------------------- | ------------------------------------------------------------------ |
| `app/services/token-storage.service.ts` | Replaced by Turso persistence; in-memory store is no longer needed |

### Architectural Focus

#### Database Layer

- **Turso free tier**: 500M reads/month, 10M writes/month, 5 GB storage. More than sufficient for single-user MVP.
- **Deploy target assumption**: This is a React Router v7 SSR app deployed as a Node.js long-lived process (e.g., Fly.io, Railway). The Turso client singleton works correctly in this model -- a single `createClient()` call produces a client that manages its own connection pooling. This would not work in a serverless/edge function model where each invocation creates a new client; if the deploy target changes, the client initialization must be reviewed.
- **Local development**: Use `file:local.db` as the database URL (no auth token needed). The libSQL client handles this transparently.
- **CI/test environment**: Use `':memory:'` for in-memory SQLite (fast, isolated, no file cleanup).
- **Drizzle ORM**: Provides compile-time type safety on all queries. Schema changes are managed via Drizzle Kit versioned migrations.
- **Partial index**: The `(created_at DESC, id DESC) WHERE deleted_at IS NULL` partial index covers all pagination queries efficiently.

#### Migration Strategy

**Decision: Use versioned migrations, not schema push.** The previous PRD noted `drizzle-kit push` as a simpler alternative. This is replaced with the full versioned migration workflow:

1. **`drizzle-kit generate`**: Generates SQL migration files from schema changes into a `drizzle/` directory. Each migration is a numbered, timestamped SQL file.
2. **`drizzle-kit migrate`**: Applies pending migrations to the target database. Tracks applied migrations in a `__drizzle_migrations` table.
3. **Backup before migration**: Before running `drizzle-kit migrate` against the Turso cloud database, run `turso db dump <database-name> > backup-<timestamp>.sql` to capture a full backup. This backup step is manual and documented in the README.

**Rationale:** `drizzle-kit push` directly mutates the database schema without recording what changed. This makes it impossible to audit schema history, roll back a bad migration, or reproduce the schema on a fresh database. Versioned migrations provide an audit trail and deterministic schema reproduction. For a single-developer MVP, the overhead is minimal (one extra command), and the safety benefit is significant.

**Migration workflow:**

```bash
# After changing app/lib/db/schema.ts:
pnpm exec drizzle-kit generate

# Review the generated SQL in drizzle/ directory

# Apply to local dev database:
pnpm exec drizzle-kit migrate

# Before applying to Turso cloud:
turso db dump furigana-mvp > backup-$(date +%Y%m%d%H%M%S).sql

# Apply to Turso cloud:
TURSO_DATABASE_URL=<cloud-url> TURSO_AUTH_TOKEN=<token> pnpm exec drizzle-kit migrate
```

#### Unified Schema Strategy: Drizzle + Zod

**Decision: Keep Drizzle table definitions and Zod validation schemas separate, linked by `drizzle-orm/zod` code generation.**

The project has two schema concerns:

1. **Drizzle table definition** (`app/lib/db/schema.ts`) -- defines the SQLite table structure, column types, constraints, and indexes. This is the database source of truth.
2. **Zod validation schemas** (`app/schema/furigana.schema.ts`) -- validate runtime data shapes at API boundaries (action inputs, loader outputs, API responses).

**Approach: Use `drizzle-orm/zod` to generate base Zod schemas from the Drizzle table, then refine them.**

Since `drizzle-orm@0.30.0+`, the `drizzle-orm/zod` module provides `createSelectSchema()` and `createInsertSchema()` that generate Zod schemas directly from a Drizzle table definition. This ensures the Zod schema always matches the database column types and nullability without manual synchronization.

```ts
// app/lib/db/schema.ts (Drizzle -- database source of truth)
import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    uniqueIndex("idx_furiganas_active_cursor")
      .on(table.createdAt, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
```

```ts
// app/schema/pagination.schema.ts (Generic pagination -- reusable across all domains)
import * as z from "zod";

/** Cursor parameter validation -- accepts base64-encoded cursor strings */
export const CursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
});

/**
 * Generic cursor-paginated response schema factory.
 * Accepts any Zod schema for the data items and returns a pagination envelope.
 *
 * @example
 * const FuriganaPaginationResultsSchema = PaginationResultsSchema(FuriganaSidebarSchema);
 * const OtherPaginationResultsSchema = PaginationResultsSchema(OtherItemSchema);
 */
export function PaginationResultsSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}

/** TypeScript utility type for cursor pagination query params */
export type CursorPaginationParams = {
  cursor?: string;
  limit?: number;
};

export type Cursor = z.infer<typeof CursorSchema>;

/** TypeScript utility type for any paginated result */
export type PaginationResults<T> = {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
};
```

```ts
// app/schema/furigana.schema.ts (Zod -- extended from Drizzle base)
import { createSelectSchema, createInsertSchema } from "drizzle-orm/zod";
import * as z from "zod";
import { furiganas } from "~/lib/db/schema";
import { PaginationResultsSchema } from "~/schema/pagination.schema";

// --- Existing FuriganaToken schemas (unchanged from M1) ---
export const TextTokenSchema = z.object({
  /* ... */
});
export const RubyTokenSchema = z.object({
  /* ... */
});
export const FuriganaTokenSchema = z.discriminatedUnion("type", [TextTokenSchema, RubyTokenSchema]);
// ... existing types and type guards ...

// --- Database row schemas (generated from Drizzle, refined) ---

/** Full row shape from SELECT * -- used in getFuriganaById */
export const FuriganaRowSchema = createSelectSchema(furiganas, {
  id: (schema) => schema.uuid(),
  createdAt: (schema) => schema.datetime(),
  deletedAt: (schema) => schema.datetime().nullable(),
});

/** Insert shape -- used to validate data before insertFurigana */
export const FuriganaInsertSchema = createInsertSchema(furiganas, {
  id: (schema) => schema.uuid(),
  rawText: (schema) => schema.min(1).max(5000),
  rawTextSnippet: (schema) => schema.min(1).max(30),
  annotationString: (schema) => schema.min(1),
  createdAt: (schema) => schema.datetime(),
});

/** Sidebar projection -- uses raw_text_snippet stored column */
export const FuriganaSidebarSchema = z.object({
  id: z.string().uuid(),
  rawTextSnippet: z.string(),
  title: z.string().nullable(),
  createdAt: z.string().datetime(),
});

/**
 * Cursor-paginated sidebar response -- composed from generic PaginationResultsSchema.
 * This is the Zod schema used to validate GET /api/furiganas responses.
 */
export const FuriganaPaginationResultsSchema = PaginationResultsSchema(FuriganaSidebarSchema);

export type FuriganaRow = z.infer<typeof FuriganaRowSchema>;
export type FuriganaInsert = z.infer<typeof FuriganaInsertSchema>;
export type FuriganaSidebar = z.infer<typeof FuriganaSidebarSchema>;
export type FuriganaPaginationResults = z.infer<typeof FuriganaPaginationResultsSchema>;
```

**Why a generic `PaginationResultsSchema` in a separate module:**

- **Single source of truth for pagination.** All cursor-paginated API responses share the same envelope shape (`data`, `nextCursor`, `hasMore`). Defining this once in `app/schema/pagination.schema.ts` prevents duplication as future milestones (M3+) introduce pagination for other data types.
- **Zod generics enable type-safe composition.** The `PaginationResultsSchema(itemSchema)` factory produces a fully-typed Zod schema where `data` is inferred as the correct item array type. No manual type assertions needed.
- **Clearer separation of concerns.** Pagination logic (cursor validation, envelope shape) is domain-agnostic. Domain schemas (`FuriganaSidebarSchema`) define the data shape. Composing them via `PaginationResultsSchema(FuriganaSidebarSchema)` makes the boundary explicit.
- **Easier to test independently.** The generic pagination schema can be unit-tested with simple test schemas (e.g., `z.object({ name: z.string() })`) without coupling to furigana-specific data.

**Why this approach:**

- **Single source of truth for column structure.** The Drizzle table definition in `app/lib/db/schema.ts` is the canonical source. Zod schemas are derived from it, so column renames or type changes propagate automatically.
- **No duplicate field lists.** `createSelectSchema(furiganas)` generates the correct Zod shape without manually listing every column.
- **Refinements remain in Zod.** Domain-level validations (UUID format, datetime format, max length) are added as refinements on top of the generated base. These validations have no database equivalent and belong in the Zod layer.
- **`FuriganaSidebarSchema` is hand-crafted.** The sidebar projection reads `raw_text_snippet` directly from the stored column. This schema is defined manually in Zod because it represents a projection, not a full row.
- **`CursorSchema` validates cursor integrity.** The decoded cursor is validated with Zod to prevent injection or malformed cursor attacks. It lives in `app/schema/pagination.schema.ts` alongside the generic pagination envelope because cursor validation is pagination-specific, not domain-specific.
- **Pagination schemas are separated from domain schemas.** `CursorSchema` and `PaginationResultsSchema` live in `app/schema/pagination.schema.ts` because they are generic infrastructure reusable across any paginated endpoint. Domain schemas (`FuriganaSidebarSchema`, `FuriganaRowSchema`) remain in `app/schema/furigana.schema.ts`. The composed `FuriganaPaginationResultsSchema` bridges the two via `PaginationResultsSchema(FuriganaSidebarSchema)`.
- **Domain schemas co-located in a single file.** Both FuriganaToken schemas (from M1) and database row schemas live in `app/schema/furigana.schema.ts`. This keeps all furigana-domain Zod schemas in one file, avoiding a separate `entry.schema.ts`.

**Why not a full merge:** Drizzle table definitions are SQLite DSL (`sqliteTable`, `text()`, `notNull()`) and Zod schemas are runtime validators (`z.string().uuid()`). They use fundamentally different APIs. Attempting to define both in a single construct (e.g., a custom factory) would add abstraction complexity without proportional benefit. The `drizzle-orm/zod` bridge provides the right level of coupling: automatic base generation with manual refinement.

#### Data Flow

```
[User submits text]
  -> home.tsx action
    -> rate limit check (10 req/IP/min)
    -> sanitizeRawText(rawText) strips HTML, control chars, BiDi overrides
    -> validate length (max 5,000 chars)
    -> generateFurigana(sanitizedText) returns { annotationString, tokens }
    -> parseAnnotationString(annotationString) validates bracket notation
    -> insertFurigana({ id, rawText, rawTextSnippet, annotationString, createdAt }) writes to Turso
    -> redirect(`/furigana/${id}`)

[User loads /furigana/:id]
  -> furigana.$id.tsx loader
    -> getFuriganaById(id) reads from Turso
    -> parseAnnotationString(entry.annotationString) produces FuriganaToken[]
    -> return { tokens, entry } to component

[Sidebar loads on any page]
  -> AppSidebar component
    -> useInfiniteQuery({ queryKey: ['furiganas', 'list'], queryFn: fetchFuriganaList, staleTime: Infinity })
      -> fetchFuriganaList(cursor?) calls axiosInstance.get('/api/furiganas', { params: { cursor, limit } })
        -> FuriganaPaginationResultsSchema.parse(response.data) validates response
      -> resource route calls listFuriganas({ cursor, limit }) on Turso
      -> returns cursor-paginated sidebar-shaped data (id, title/rawTextSnippet, createdAt, nextCursor)

[User scrolls to bottom of sidebar / clicks "Load more"]
  -> useInfiniteQuery.fetchNextPage()
    -> fetchFuriganaList(nextCursor) calls axiosInstance.get('/api/furiganas', { params: { cursor: nextCursor, limit } })
    -> append results to existing TanStack Query page cache

[Post-submission cache invalidation]
  -> route change detected (location.pathname changed to /furigana/:id)
    -> queryClient.invalidateQueries({ queryKey: ['furiganas', 'list'] })
    -> TanStack Query refetches first page (no cursor)
    -> new entry appears at top of sidebar
```

#### API Resource Routes

Two server-only resource routes provide data to client-side API functions:

- **`GET /api/furiganas`** -- Returns the cursor-paginated sidebar entry list (id, title, rawTextSnippet, createdAt). Filters `deleted_at IS NULL`. Orders by `created_at DESC, id DESC`. Accepts `cursor` (optional base64-encoded) and `limit` (default 20, max 50) query parameters. Returns `FuriganaPaginationResultsSchema`-shaped JSON (generic `PaginationResultsSchema` composed with `FuriganaSidebarSchema`).
- **`GET /api/furiganas/:id`** -- Returns a single entry by ID with full `annotationString`. Used by the `furigana.$id.tsx` loader (server-side, so this could also be a direct Drizzle call rather than an HTTP fetch -- implementation can choose either approach).

#### Layout Route Pattern

React Router v7 layout routes wrap child routes and provide shared UI (sidebar) and shared data. The layout route renders `QueryClientProvider` wrapping `SidebarProvider` wrapping `AppSidebar` (inside `ClientOnly` and `SidebarErrorBoundary`) and `SidebarInset`:

```tsx
// app/routes/layout.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider, SidebarInset } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/sidebar/AppSidebar";
import { SidebarErrorBoundary } from "~/components/sidebar/SidebarErrorBoundary";
import { ClientOnly } from "~/components/ClientOnly";
import { SidebarSkeleton } from "~/components/sidebar/SidebarSkeleton";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

export default function AppLayout() {
  const params = useParams();
  const activeEntryId = params["id"] ?? null;

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider defaultOpen={true}>
        <SidebarErrorBoundary>
          <ClientOnly fallback={<SidebarSkeleton />}>
            <AppSidebar activeEntryId={activeEntryId} />
          </ClientOnly>
        </SidebarErrorBoundary>
        <SidebarInset>
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </QueryClientProvider>
  );
}
```

Note: The `clientLoader` that previously fetched sidebar data via `fetch()` is no longer needed. TanStack Query's `useInfiniteQuery` in `AppSidebar` handles all data fetching, caching, and revalidation.

#### Zod Validation

All data flowing through the system is validated through Zod schemas organized across two modules:

**Generic pagination schemas (`app/schema/pagination.schema.ts`):**

- `CursorSchema` -- validates the decoded cursor shape `{ createdAt, id }` (used in `listFuriganas` when a cursor is provided)
- `PaginationResultsSchema(itemSchema)` -- generic factory that produces a cursor-paginated envelope schema (`data: T[]`, `nextCursor`, `hasMore`) for any Zod item schema

**Domain schemas (`app/schema/furigana.schema.ts`):**

- `FuriganaInsertSchema` -- validates the shape written to Turso (used in `insertFurigana`); includes `rawText` max length of 5,000 characters and `rawTextSnippet` max length of 30 characters
- `FuriganaRowSchema` -- validates a full entry row from Turso (used in `getFuriganaById`)
- `FuriganaSidebarSchema` -- validates the sidebar-shaped projection (used in `listFuriganas`)
- `FuriganaPaginationResultsSchema` -- composed via `PaginationResultsSchema(FuriganaSidebarSchema)`; validates the cursor-paginated API response shape (used in `fetchFuriganaList` API function)

Database row schemas are generated from the Drizzle table definition via `drizzle-orm/zod` and refined with domain-specific constraints. The generic `PaginationResultsSchema` factory provides a reusable envelope that accepts any Zod schema for the data items, ensuring consistent pagination structure across all current and future paginated endpoints. The API function layer (`app/lib/api/furiganas.ts`) applies `FuriganaPaginationResultsSchema.parse()` on every paginated response before returning typed data to TanStack Query hooks. This ensures the app never operates on unexpected data shapes and catches schema drift at runtime.

### Implementation Approach

#### Phase 1: Database Foundation

1. Install dependencies: `@libsql/client`, `drizzle-orm`, `drizzle-kit`.
2. Create `app/lib/db/schema.ts` with the `furiganas` table definition (including `raw_text_snippet` column) and partial index `(created_at DESC, id DESC) WHERE deleted_at IS NULL`.
3. Create `app/lib/db/client.ts` with the Turso client singleton and startup validation for `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
4. Create `app/schema/pagination.schema.ts` with `CursorSchema`, `PaginationResultsSchema` generic factory (without `total` field), and `CursorPaginationParams`/`PaginationResults<T>` utility types.
5. Extend `app/schema/furigana.schema.ts` with `FuriganaInsertSchema` (rawText max 5,000 chars), `FuriganaRowSchema`, `FuriganaSidebarSchema`, and `FuriganaPaginationResultsSchema` (composed via `PaginationResultsSchema(FuriganaSidebarSchema)`) using `createSelectSchema`/`createInsertSchema` from `drizzle-orm/zod`.
6. Create `app/lib/db/queries.ts` with `insertFurigana` (computes `rawTextSnippet` from `rawText.slice(0, 30)`), `getFuriganaById`, `listFuriganas` (with cursor-based pagination using row-value comparison `(created_at, id) < (?, ?)`, `LIMIT + 1` technique).
7. Set up Drizzle Kit config (`drizzle.config.ts`) for versioned migration generation.
8. Generate and apply the initial migration (`drizzle-kit generate` + `drizzle-kit migrate`).
9. Update `.env.example` with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

#### Phase 2: Route Integration

1. Create `app/lib/sanitize.ts` with `sanitizeRawText()` function.
2. Create `app/lib/rate-limit.ts` with in-memory rate limiter.
3. Update `app/services/furigana.service.ts` to return `{ annotationString, tokens }`.
4. Update `app/routes/home.tsx` action: add sanitization, rate limiting (10 req/IP/min), max length validation (5,000 chars), annotation string validation via `parseAnnotationString()`, replace in-memory store with `insertFurigana()`.
5. Update `app/routes/furigana.$id.tsx` loader: replace in-memory read with `getFuriganaById()` + `parseAnnotationString()`.
6. Create resource routes: `app/routes/api/furiganas.ts` (with cursor-based pagination using row-value comparison) and `app/routes/api/furiganas.$id.ts`.
7. Delete `app/services/token-storage.service.ts`.
8. Update `app/lib/axios/instance.ts`: remove Authorization header injection and 401 redirect interceptor; add TODO comment.

#### Phase 3: TanStack Query Setup and API Client Layer

1. Install `@tanstack/react-query`.
2. Create `app/lib/api/furiganas.ts` with `fetchFuriganaList` and `fetchFuriganaById` API functions using the axios instance and Zod validation.
3. Configure `QueryClient` with default retry (1). Note: `staleTime` is set per-query, not as a global default.
4. Add `QueryClientProvider` to the layout route (wraps `SidebarProvider`).

#### Phase 4: Layout and Sidebar

1. Install shadcn/ui Sidebar component: `pnpx shadcn@latest add sidebar --defaults`.
2. Create `app/components/ClientOnly.tsx` -- renders null on server, children after `useEffect`.
3. Create `app/components/sidebar/SidebarSkeleton.tsx` -- SSR fallback matching sidebar width.
4. Create `app/components/sidebar/SidebarErrorBoundary.tsx` -- catches AppSidebar crashes with fallback UI.
5. Create `app/routes/layout.tsx` with `QueryClientProvider`, `SidebarProvider`, `SidebarErrorBoundary`, `ClientOnly`, and `SidebarInset`/`Outlet` structure.
6. Update `app/routes.ts` to wrap existing routes in the layout.
7. Create `app/components/sidebar/AppSidebar.tsx` using shadcn/ui Sidebar primitives + TanStack Query's `useInfiniteQuery` (with `staleTime: Infinity`) with cursor-based pagination and scroll position preservation.
8. Implement skeleton loading state using `SidebarMenuSkeleton` (triggered by `isLoading` from `useInfiniteQuery`).
9. Implement empty state ("No entries yet").
10. Implement "Load more" button at the bottom of the sidebar entry list (triggered by `hasNextPage` from `useInfiniteQuery`).
11. Implement cache invalidation after successful form submission (route change detection pattern, invalidate `['furiganas', 'list']` query key).

#### Phase 5: Polish and Cleanup

1. Update `app/routes/home.tsx` to remove the standalone `<main>` wrapper (now provided by `SidebarInset`).
2. Update `app/routes/furigana.$id.tsx` to remove its standalone `<main>` wrapper.
3. Verify that the existing `home.tsx` error flow (Turso write failure) preserves the textarea content.
4. Verify that the sidebar refreshes after a new submission (TanStack Query cache invalidation via route change detection).
5. Configure `--sidebar-width` CSS variable if the default `16rem` needs adjustment (e.g., `--sidebar-width: 16rem` in `SidebarProvider` style prop).
6. Add bundle audit CI step: grep client bundle output for `@libsql/client` and fail the build if found. This prevents accidental client-side bundling of the server-only database client. Implementation: add a script in `package.json` (e.g., `"bundle-audit": "node -e \"const fs = require('fs'); const bundle = fs.readFileSync('build/client/assets/*.js', 'utf-8'); if (bundle.includes('@libsql/client')) { console.error('ERROR: @libsql/client found in client bundle'); process.exit(1); }\""`) or a post-build check in CI.

### Test Strategy

#### Unit Testing (Vitest)

- **Input sanitization** (`app/lib/sanitize.ts`):
  - `sanitizeRawText` strips HTML tags from input.
  - `sanitizeRawText` removes control characters (except tab, newline, carriage return).
  - `sanitizeRawText` removes BiDi override characters.
  - `sanitizeRawText` normalizes whitespace (collapses consecutive spaces, preserves paragraph breaks).
  - `sanitizeRawText` trims leading and trailing whitespace.
  - `sanitizeRawText` preserves valid Japanese text, kanji, hiragana, katakana, and punctuation.

- **Rate limiter** (`app/lib/rate-limit.ts`):
  - Allows requests under the limit (10 per minute).
  - Blocks requests exceeding the limit.
  - Resets counter after the time window expires.
  - Tracks different IPs independently.

- **Generic pagination schemas** (`app/schema/pagination.schema.ts`):
  - `PaginationResultsSchema` with a simple test schema (e.g., `z.object({ name: z.string() })`) validates correct envelope shape (`data`, `nextCursor`, `hasMore`).
  - `PaginationResultsSchema` rejects responses missing `hasMore` field.
  - `PaginationResultsSchema` rejects responses where `data` items do not match the provided item schema.
  - `PaginationResultsSchema` accepts `nextCursor: null` with `hasMore: false`.
  - `PaginationResultsSchema` accepts `nextCursor: "some-string"` with `hasMore: true`.
  - `PaginationResultsSchema` rejects responses containing a `total` field (validates the schema does not include `total`).
  - `CursorSchema` validates decoded cursor shape (`{ createdAt, id }`).
  - `CursorSchema` rejects malformed cursor data (missing fields, invalid types).

- **Domain Zod schemas** (`app/schema/furigana.schema.ts`):
  - Valid furigana insert shape passes `FuriganaInsertSchema` validation.
  - Missing required fields fail validation.
  - Invalid timestamp format fails validation.
  - `rawText` exceeding 5,000 characters fails `FuriganaInsertSchema` validation.
  - `rawTextSnippet` exceeding 30 characters fails `FuriganaInsertSchema` validation.
  - Nullable fields (`title`, `deletedAt`) accept both `null` and valid strings.
  - `FuriganaSidebarSchema` validates sidebar-shaped projections correctly.
  - `FuriganaPaginationResultsSchema` validates cursor-paginated response shape with `data` (array of `FuriganaSidebar`), `nextCursor`, and `hasMore`.
  - `FuriganaPaginationResultsSchema` rejects responses where `data` items do not match `FuriganaSidebarSchema`.
  - Existing `FuriganaTokenSchema` tests continue to pass (no regression).

- **Drizzle query builders** (`app/lib/db/queries.ts`):
  - `insertFurigana` correctly maps input fields to the Drizzle INSERT call, including computed `rawTextSnippet`.
  - `insertFurigana` computes `rawTextSnippet` as `rawText.slice(0, 30)`.
  - `getFuriganaById` returns `null` for non-existent IDs (using in-memory SQLite).
  - `getFuriganaById` returns `null` for soft-deleted entries (where `deleted_at IS NOT NULL`).
  - `listFuriganas` returns entries ordered by `created_at DESC, id DESC`, excluding soft-deleted entries.
  - `listFuriganas` returns the correct sidebar projection (including `rawTextSnippet` from stored column, no `annotation_string` or full `raw_text` in result).
  - `listFuriganas` with no cursor returns the first page of entries.
  - `listFuriganas` with a valid cursor returns entries after the cursor position (using row-value comparison).
  - `listFuriganas` returns `nextCursor` when there are more entries beyond the current page.
  - `listFuriganas` returns `nextCursor: null` and `hasMore: false` when the current page is the last page.
  - `listFuriganas` returns `hasMore: true` and a valid `nextCursor` when more entries exist beyond the current page.
  - `listFuriganas` does NOT return a `total` field.
  - `listFuriganas` cursor stability: inserting a new entry does not affect cursor-based traversal of older entries.

- **API functions** (`app/lib/api/furiganas.ts`):
  - `fetchFuriganaList` calls axios with correct params and validates response with `FuriganaPaginationResultsSchema`.
  - `fetchFuriganaList` throws Zod error for malformed server responses (e.g., missing `hasMore` field).
  - `fetchFuriganaById` calls axios with correct URL and validates response with Zod.

- **Cursor encoding/decoding**:
  - Valid `(createdAt, id)` tuple encodes to base64 and decodes back correctly.
  - Invalid base64 string fails decoding gracefully.
  - Valid base64 but invalid JSON fails decoding gracefully.
  - Valid JSON but missing fields fails `CursorSchema` validation.

- **Sidebar components**:
  - `AppSidebar` renders `SidebarMenuButton` with `isActive` prop for the active entry.
  - `AppSidebar` renders `SidebarMenuSkeleton` components when `useInfiniteQuery` is in loading state.
  - `AppSidebar` renders empty state message when entries array is empty.
  - `AppSidebar` renders "Load more" button when `hasNextPage` is true.
  - `AppSidebar` hides "Load more" button when `hasNextPage` is false.

- **SidebarErrorBoundary**:
  - Catches errors thrown by child components and renders fallback UI.
  - Does not crash the parent layout.

- **ClientOnly**:
  - Renders fallback on server (or initial client render before useEffect).
  - Renders children after hydration.

#### Integration Testing (Vitest)

- **Route action** (`home.tsx`):
  - Successful generation + Turso write returns a redirect to `/furigana/:id`.
  - Turso write failure after successful AI generation returns an error response with original text preserved.
  - Generated entry ID is a valid UUID.
  - Rate limit returns 429 after 10 requests from the same IP within 60 seconds.
  - Text exceeding 5,000 characters returns 400 error.
  - Malformed annotation string from GPT returns error without DB write.
  - HTML tags in input are stripped before processing.

- **Route loader** (`furigana.$id.tsx`):
  - Valid entry ID returns parsed `FuriganaToken[]`.
  - Non-existent entry ID throws 404.
  - Soft-deleted entry ID throws 404.

- **API resource routes**:
  - `GET /api/furiganas` returns the correct cursor-paginated list shape matching `FuriganaPaginationResultsSchema` (includes `data`, `nextCursor`, `hasMore`; no `total`).
  - `GET /api/furiganas?limit=5` returns 5 entries with non-null `nextCursor` and `hasMore: true` (when more exist).
  - `GET /api/furiganas?cursor=<valid>&limit=5` returns the next 5 entries after the cursor.
  - `GET /api/furiganas?cursor=<last-page-cursor>` returns entries with `nextCursor: null` and `hasMore: false`.
  - `GET /api/furiganas?cursor=invalid-base64` returns 400 validation error.
  - `GET /api/furiganas?limit=999` returns 400 validation error (exceeds max 50).
  - `GET /api/furiganas/:id` returns the full entry with annotation string.
  - Response `data` items include `rawTextSnippet` from stored column.

- **TanStack Query integration**:
  - Mock API responses with MSW (Mock Service Worker) or axios-mock-adapter.
  - `useInfiniteQuery` fetches first page on mount with no cursor.
  - `useInfiniteQuery` fetches subsequent pages with `nextCursor` from previous response.
  - Cache invalidation triggers refetch of the first page.
  - `staleTime: Infinity` prevents automatic background refetches.

- **Startup validation**:
  - Missing `TURSO_DATABASE_URL` throws a clear error on import.
  - Missing `TURSO_AUTH_TOKEN` throws a clear error on import (unless URL starts with `file:`).

#### End-to-End Testing (Playwright)

- Submit Japanese text; assert new entry appears at the top of the sidebar after redirect.
- Click a sidebar entry; assert the reading view updates to show that entry's furigana annotations.
- Click "New" button; assert the main area shows the input textarea and no sidebar row is highlighted.
- Reload the page on `/furigana/:id`; assert the entry loads from Turso and renders correctly.
- Submit multiple entries; assert sidebar order is reverse-chronological (newest first).
- Navigate to `/furigana/nonexistent-id`; assert 404 error boundary is displayed.
- Verify `SidebarMenuButton` has `data-active` attribute on the active entry.
- Submit more than 20 entries; verify "Load more" button appears and loads additional entries via cursor-based pagination.

### Deliverables

- [ ] Turso database provisioned (free tier) with `furiganas` table (including `raw_text_snippet` column) and `idx_furiganas_active_cursor` partial index
- [ ] `app/components/ui/sidebar.tsx` installed via `pnpx shadcn@latest add sidebar`
- [ ] `app/lib/db/` module: `schema.ts` (with partial index and `raw_text_snippet` column), `client.ts` (with startup env validation), `queries.ts` (cursor-based pagination with row-value comparison, no `total` COUNT)
- [ ] `app/lib/sanitize.ts` -- `sanitizeRawText()` function
- [ ] `app/lib/rate-limit.ts` -- In-memory rate limiter (10 req/IP/min)
- [ ] `app/lib/api/furiganas.ts` -- API function layer using axios instance + Zod validation
- [ ] `app/schema/pagination.schema.ts` -- Generic pagination schemas (`CursorSchema`, `PaginationResultsSchema` factory without `total` field, `CursorPaginationParams` and `PaginationResults<T>` utility types)
- [ ] `app/schema/furigana.schema.ts` extended with `FuriganaInsertSchema` (rawText max 5,000), `FuriganaRowSchema`, `FuriganaSidebarSchema`, `FuriganaPaginationResultsSchema` (composed via generic `PaginationResultsSchema`)
- [ ] `app/routes/layout.tsx` with `QueryClientProvider`, `SidebarProvider`, `SidebarErrorBoundary`, `ClientOnly`, `AppSidebar`, `SidebarInset`
- [ ] `app/routes/api/furiganas.ts` and `app/routes/api/furiganas.$id.ts` resource routes (cursor-based pagination with row-value comparison)
- [ ] `app/components/sidebar/AppSidebar.tsx` using shadcn/ui Sidebar primitives + TanStack Query `useInfiniteQuery` (staleTime Infinity) + scroll position preservation
- [ ] `app/components/sidebar/SidebarErrorBoundary.tsx` -- ErrorBoundary with fallback UI
- [ ] `app/components/sidebar/SidebarSkeleton.tsx` -- SSR skeleton fallback
- [ ] `app/components/ClientOnly.tsx` -- Generic client-only rendering wrapper
- [ ] Updated `app/routes/home.tsx` -- action with sanitization, rate limiting, max length validation, annotation string validation, Turso write
- [ ] Updated `app/routes/furigana.$id.tsx` -- loader reads from Turso
- [ ] Updated `app/routes.ts` with layout route and API routes
- [ ] Updated `app/services/furigana.service.ts` -- returns both annotation string and tokens
- [ ] Updated `app/lib/axios/instance.ts` -- removed auth header and 401 interceptor, added TODO
- [ ] Removed `app/services/token-storage.service.ts`
- [ ] Updated `.env.example` with `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- [ ] `drizzle.config.ts` for versioned migration management
- [ ] `drizzle/` directory with initial migration SQL
- [ ] `@tanstack/react-query` installed and `QueryClientProvider` configured
- [ ] Bundle audit CI step (grep client bundle for `@libsql/client`)
- [ ] Unit tests for sanitization, rate limiting, generic pagination schemas, domain Zod schemas, cursor encoding/decoding, Drizzle queries (including row-value cursor, no total), API functions, sidebar components, ErrorBoundary, ClientOnly
- [ ] Integration tests for route action (with sanitization, rate limiting, annotation validation), loader, API resource routes (no total field), TanStack Query hooks, and startup env validation
- [ ] E2E tests for submission flow, sidebar navigation, "New" button, and cursor-based pagination
- [ ] `pnpm type-check` passes with zero errors

### Success Criteria

1. **Persistence**: Generated entries survive page reloads. Navigating to `/furigana/:id` renders the entry from Turso, not from memory.
2. **Sidebar population**: The sidebar lists all non-deleted entries in reverse-chronological order on every page load, fetched via TanStack Query's `useInfiniteQuery` with cursor-based pagination (20 entries per page).
3. **Sidebar navigation**: Clicking a sidebar entry renders that entry's furigana reading view in the main content area. Active state is displayed via `SidebarMenuButton` `isActive`.
4. **New button**: Clicking "New" returns the user to the input textarea with no active sidebar entry.
5. **Turso schema validation**: Zod schemas (generated via `drizzle-orm/zod` with refinements) catch malformed database responses in unit tests. Generic `PaginationResultsSchema` validates pagination envelope structure independently of domain data.
6. **Cursor-based pagination**: `GET /api/furiganas` returns correct cursor-paginated results using row-value comparison. "Load more" button appends entries via `fetchNextPage()`. Invalid cursors return 400. `nextCursor` is `null` on the last page. No `total` field in the response.
7. **TanStack Query integration**: Sidebar data is cached with `staleTime: Infinity` and shared across route navigations. Explicit cache invalidation after submission triggers sidebar refresh via route-change detection.
8. **API client pattern**: All client-side API calls go through `app/lib/api/furiganas.ts` using the axios instance (no auth headers), with Zod validation on every response.
9. **Input safety**: User input is sanitized (HTML tags, control characters, BiDi overrides stripped), rate limited (10 req/IP/min), and length-validated (5,000 chars max) before processing.
10. **Annotation validation**: GPT output is validated via `parseAnnotationString()` before database write. Invalid annotation strings are never stored.
11. **Sidebar resilience**: `SidebarErrorBoundary` catches sidebar crashes without affecting the main content area.
12. **SSR hydration**: `ClientOnly` wrapper prevents hydration mismatch from `SidebarProvider`'s `window.matchMedia` usage.
13. **Type safety**: `pnpm type-check` passes with zero errors after all changes.
14. **No regression**: Existing M1 functionality (input validation, character counter, submit shortcut, error handling, furigana rendering) continues to work identically.

---

## Dependency and Conflict Analysis

### External Dependencies

| Dependency                  | Required For                                                                              | Notes                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Milestone 1 complete        | M1 delivers the generation loop, `FuriganaToken` type, parser, AI client, route structure | M2 builds directly on top of M1's code                                                                           |
| Turso account (free tier)   | Cloud database hosting                                                                    | Sign up at turso.tech; create database; get URL + token                                                          |
| `@libsql/client` npm        | Turso/libSQL client library                                                               | Connects to Turso cloud or local `file:local.db`                                                                 |
| `drizzle-orm` npm           | Type-safe ORM layer with built-in Zod integration (`drizzle-orm/zod`)                     | Schema definition, query building, Zod schema generation                                                         |
| `drizzle-kit` npm (dev)     | Versioned migration generation and application                                            | `drizzle-kit generate`, `drizzle-kit migrate`                                                                    |
| `@tanstack/react-query` npm | Client-side data fetching, caching, and infinite scroll                                   | `useInfiniteQuery`, `useQuery`, `useMutation`, `QueryClientProvider`                                             |
| shadcn/ui Sidebar           | Sidebar component primitives                                                              | `pnpx shadcn@latest add sidebar --defaults`; installs Sheet, Separator, Tooltip, Input, Skeleton as dependencies |

### Internal Dependencies (within this milestone)

```
Phase 1: Database Foundation
  schema.ts -> client.ts (with startup validation) -> queries.ts (row-value cursor, no total)
  schema.ts -> furigana.schema.ts (Zod schemas derived via drizzle-orm/zod)
  pagination.schema.ts (generic CursorSchema + PaginationResultsSchema, no total) -> furigana.schema.ts (FuriganaPaginationResultsSchema)
    |
Phase 2: Route Integration
  sanitize.ts + rate-limit.ts (new) -> home.tsx action (update)
  furigana.service.ts (update) -> home.tsx action (update) -> furigana.$id.tsx loader (update)
  axios/instance.ts (update: remove auth)
    |                                                            |
Phase 3: TanStack Query Setup + API Client Layer                 |
  @tanstack/react-query install                                  |
  api/furiganas.ts (axios + Zod) <- furigana.schema.ts           |
    |                                                            |
Phase 4: Layout and Sidebar                                      |
  sidebar.tsx (shadcn install) -> AppSidebar.tsx (useInfiniteQuery, staleTime Infinity)
  ClientOnly.tsx + SidebarSkeleton.tsx + SidebarErrorBoundary.tsx |
  layout.tsx (QueryClientProvider + SidebarProvider + ErrorBoundary + ClientOnly) -> AppSidebar
    |                                                            |
  routes.ts (update) -------------------------------------------|
    |
Phase 5: Polish, Cleanup, and CI
  Bundle audit step
```

- `schema.ts` must be created before `client.ts` (schema is imported by client for type inference).
- `pagination.schema.ts` is standalone (no project dependencies) and must be created before `furigana.schema.ts` imports `PaginationResultsSchema`.
- `furigana.schema.ts` Zod schemas depend on `schema.ts` (imports the Drizzle table for `createSelectSchema`/`createInsertSchema`) and `pagination.schema.ts` (imports `PaginationResultsSchema`).
- `queries.ts` depends on both `schema.ts` and `client.ts`.
- `sanitize.ts` and `rate-limit.ts` are standalone and can be created in parallel with any phase.
- Route updates depend on `queries.ts`, `sanitize.ts`, and `rate-limit.ts` being available.
- `api/furiganas.ts` depends on the axios instance (`app/lib/axios/instance.ts`) and Zod schemas (`furigana.schema.ts` for `FuriganaPaginationResultsSchema`).
- `@tanstack/react-query` must be installed before `AppSidebar.tsx` can use `useInfiniteQuery`.
- `QueryClientProvider` must wrap the component tree before any TanStack Query hooks are called.
- shadcn/ui Sidebar must be installed before `AppSidebar.tsx` can import its primitives.
- `ClientOnly.tsx`, `SidebarSkeleton.tsx`, and `SidebarErrorBoundary.tsx` must be created before `layout.tsx`.
- Layout and sidebar depend on route structure but can be developed in parallel with route updates.

### Potential Conflicts

- **Route structure change**: Wrapping existing routes in a layout route changes the component hierarchy. The existing `<main>` wrappers in `home.tsx` and `furigana.$id.tsx` must be removed or adjusted to avoid double-wrapping. The `SidebarInset` provides the outer structure; child routes provide only their content.

- **`furigana.service.ts` return type change**: Currently returns `FuriganaToken[]`. Changing to `{ annotationString: string; tokens: FuriganaToken[] }` requires updating the call site in `home.tsx` action. This is a breaking change to the M1 contract but is contained within two files.

- **CSS layout shift**: Introducing a sidebar changes the main content area from full-width to flex-child. shadcn/ui `SidebarInset` handles the content area offset automatically, but the existing `max-w-3xl mx-auto` centering in route components needs to be verified within the new layout context to avoid breaking the reading view typography.

- **shadcn/ui Sidebar dependencies**: Installing the Sidebar component via `pnpx shadcn@latest add sidebar` also installs Sheet, Separator, Tooltip, Input, and Skeleton components into `app/components/ui/`. These must not conflict with any existing shadcn/ui components (currently: `button.tsx`, `card.tsx`, `textarea.tsx`).

- **Schema file organization**: Pagination infrastructure (`CursorSchema`, `PaginationResultsSchema`) lives in `app/schema/pagination.schema.ts` (domain-agnostic). Domain schemas (`FuriganaInsertSchema`, `FuriganaRowSchema`, `FuriganaSidebarSchema`, `FuriganaPaginationResultsSchema`) live in `app/schema/furigana.schema.ts` alongside the existing FuriganaToken schemas. This separation keeps the furigana schema file focused on domain concerns while the pagination module remains reusable. If `furigana.schema.ts` exceeds ~150 lines, consider splitting into `furigana.schema.ts` (token schemas) and `furigana-db.schema.ts` (database schemas) -- but for MVP, a single file is preferred for discoverability.

- **TanStack Query + React Router SSR**: TanStack Query hooks (`useInfiniteQuery`) are client-only. During SSR, these hooks will not execute -- the sidebar will render in its loading/skeleton state on the server and hydrate with data on the client. The `ClientOnly` wrapper ensures the `SidebarProvider`'s `window.matchMedia` call does not cause hydration mismatch.

- **Axios instance auth removal**: Removing the Authorization header and 401 interceptor changes the behavior of the shared axios instance. If any other code depends on these features, it will break. Since M2 is the first milestone to use the axios instance for actual API calls, this is safe. The TODO comment ensures the auth logic is restored when needed.

### Risk Areas

- **Turso client in SSR context**: The `@libsql/client` must work in Node.js server context (SSR loaders/actions) but must NOT be bundled into the client bundle. Server-only enforcement is critical -- use `.server.ts` file suffix or verify tree-shaking excludes the module from client builds. React Router v7's convention of marking server-only modules is to use `import` guards or `.server.ts` naming. The bundle audit CI step (grepping for `@libsql/client` in the client bundle) provides an automated safety net.

- **TanStack Query hydration**: Since TanStack Query hooks are client-only, the sidebar renders as skeleton/empty during SSR and populates on hydration. The `ClientOnly` wrapper ensures the `SidebarProvider` does not cause hydration mismatch. This is the intended behavior for this milestone. If future milestones require SSR-rendered sidebar data, TanStack Query's `dehydrate`/`hydrate` utilities can be added.

- **Cursor encoding security**: The base64-encoded cursor is opaque to the client but not encrypted or signed (no HMAC). A malicious client could craft a cursor to query arbitrary positions. Since the cursor only controls pagination position (not data access -- the WHERE clause still filters by `deleted_at IS NULL`), this is accepted risk for the single-user MVP. There is no PII in the database. The `CursorSchema` Zod validation prevents SQL injection via malformed cursor values. Cursor signing should be considered before any multi-user support.

- **No auth on API routes**: The `GET /api/furiganas` and `GET /api/furiganas/:id` resource routes have no authentication. Anyone who knows the URL can read all entries. This is accepted for the single-user MVP. Auth must be added before any multi-user support.

- **Migration management**: Drizzle Kit versioned migrations must be applied to both the local development database and the Turso cloud database. The `turso db dump` backup step before cloud migrations is manual and must not be forgotten. The README documents this workflow.

- **`drizzle-orm/zod` version compatibility**: The `createSelectSchema` and `createInsertSchema` functions moved from the separate `drizzle-zod` package into `drizzle-orm/zod` in `drizzle-orm@0.30.0`. Ensure the installed `drizzle-orm` version is `>=0.30.0`. Do not install the deprecated `drizzle-zod` package.

---

## Out of Scope (Deferred Items)

The following items were considered during review and explicitly deferred with rationale:

- **CSRF protection**: Deferred until an authentication system is added. Without auth, there are no session tokens to protect. CSRF attacks require an authenticated session to exploit. When auth is implemented (future milestone), CSRF tokens should be added to all state-changing actions.

- **`user_id` column**: Deferred because this is a single-user MVP. Adding a `user_id` column and foreign key constraint requires a users table, which requires authentication. The `furiganas` table implicitly belongs to the single user. When multi-user support is added, a migration will add `user_id` with a NOT NULL constraint and backfill existing rows.

- **WCAG keyboard navigation and `aria-current`**: The shadcn/ui Sidebar provides basic keyboard accessibility (focusable buttons, Enter to activate). Full WCAG compliance (arrow key navigation within the sidebar menu, `aria-current="page"` on the active entry, skip-to-content links) is documented as a future improvement. The current implementation does not block screen reader usage but does not optimize for it.

- **Latency targets (P50/P99)**: Specific latency benchmarks (e.g., "sidebar loads in < 200ms P50") are not set for this milestone. At single-user scale with a free-tier Turso database, performance variability is dominated by network latency to the Turso edge, which is outside the app's control. Performance monitoring and targets should be established when the app serves multiple concurrent users.
