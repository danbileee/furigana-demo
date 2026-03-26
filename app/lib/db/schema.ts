import { desc, sql } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
      .on(desc(table.createdAt), desc(table.id))
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type Furigana = typeof furiganas.$inferSelect;
export type NewFurigana = typeof furiganas.$inferInsert;
