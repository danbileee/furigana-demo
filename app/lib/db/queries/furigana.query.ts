// Server-only — never import in client bundles
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "~/lib/db/client";
import { furiganas, type FuriganaInsert, type FuriganaRow } from "~/lib/db/furigana.db";
import type { CursorPaginationParams, CursorPaginationResults } from "~/schema/pagination.schema";
import type { FuriganaPaginationItem } from "~/schema/furigana.schema";
import { decodeCursor, encodeCursor } from "~/services/cursor-pagination.service";

const DEFAULT_PAGE_LIMIT = 20;

export async function insertFurigana(
  input: Omit<FuriganaInsert, "rawTextSnippet">,
): Promise<FuriganaRow> {
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

export async function listFuriganas(
  params: CursorPaginationParams,
): Promise<CursorPaginationResults<FuriganaPaginationItem>> {
  const limit = params.limit ?? DEFAULT_PAGE_LIMIT;
  const fetchLimit = limit + 1;
  const baseCondition = isNull(furiganas.deletedAt);
  const cursorData = params.cursor !== undefined ? decodeCursor(params.cursor) : null;

  const whereClause = cursorData
    ? and(
        baseCondition,
        sql`(${furiganas.createdAt}, ${furiganas.id}) < (${cursorData.createdAt}, ${cursorData.id})`,
      )
    : baseCondition;

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
