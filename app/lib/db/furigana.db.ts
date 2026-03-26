import { desc, sql } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./base.db";

export const furiganas = sqliteTable(
  "furiganas",
  {
    ...baseColumns,
    rawText: text("raw_text").notNull(),
    /** First 30 chars of rawText, computed at insert time. Max 30 characters. */
    rawTextSnippet: text("raw_text_snippet").notNull(),
    annotationString: text("annotation_string").notNull(),
    title: text("title"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("idx_furiganas_active_cursor")
      .on(desc(table.createdAt), desc(table.id))
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type FuriganaRow = typeof furiganas.$inferSelect;
export type FuriganaInsert = typeof furiganas.$inferInsert;
