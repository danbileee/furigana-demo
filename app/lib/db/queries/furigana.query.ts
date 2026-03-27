// Server-only — never import in client bundles
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { DEFAULT_FURIGANA_LIST_LIMIT } from "~/constants/furigana.const";
import { db } from "~/lib/db/client";
import { furiganas, type FuriganaInsert, type FuriganaRow } from "~/lib/db/furigana.db";
import type { CursorPaginationParams, CursorPaginationResults } from "~/schema/pagination.schema";
import type { FuriganaPaginationItem } from "~/schema/furigana.schema";
import { decodeCursor, encodeCursor } from "~/services/cursor-pagination.service";

type InsertFuriganaInput = Pick<
  FuriganaInsert,
  "id" | "rawText" | "annotationString" | "createdAt" | "title"
>;

/**
 * Insert a furigana row with server-computed snippet.
 *
 * Caller contract:
 * - `rawTextSnippet` and `updatedAt` are server-assigned and must not be provided.
 * - `createdAt` should be an ISO datetime string, typically from `new Date().toISOString()`.
 * - Route/action layers should validate `createdAt` format before calling this function.
 */
export async function insertFurigana(input: InsertFuriganaInput): Promise<FuriganaRow> {
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

export async function getFuriganaById(id: string): Promise<FuriganaRow | null> {
  const rows = await db
    .select()
    .from(furiganas)
    .where(and(eq(furiganas.id, id), isNull(furiganas.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * List furigana rows using cursor pagination.
 *
 * Caller contract:
 * - Validate query params with CursorPaginationParamsSchema (including max limit bound)
 *   before invoking this function.
 */
export async function listFuriganas(
  params: CursorPaginationParams,
): Promise<CursorPaginationResults<FuriganaPaginationItem>> {
  const limit = params.limit ?? DEFAULT_FURIGANA_LIST_LIMIT;
  const fetchLimit = limit + 1;
  const baseCondition = isNull(furiganas.deletedAt);
  const cursorData = params.cursor !== undefined ? decodeCursor(params.cursor) : null;

  const whereClause = cursorData
    ? and(
        baseCondition,
        sql`(${furiganas.createdAt}, ${furiganas.id}) < (${cursorData.createdAt}, ${cursorData.id})`,
      )
    : baseCondition;

  // TODO(task-4-7): Add Sentry span/timing logs at route layer for Turso query observability.
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
