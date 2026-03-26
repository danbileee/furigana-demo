import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { furiganas, type Furigana, type NewFurigana } from "~/lib/db/furigana.db";

const EXPECTED_COLUMN_KEYS = [
  "id",
  "rawText",
  "rawTextSnippet",
  "annotationString",
  "title",
  "createdAt",
  "deletedAt",
] as const;

const readChunkParts = (chunk: unknown): string[] => {
  if (typeof chunk !== "object" || chunk === null) {
    return [];
  }

  if ("name" in chunk && typeof chunk.name === "string") {
    return [chunk.name];
  }

  if ("value" in chunk && Array.isArray(chunk.value)) {
    return chunk.value.filter((part): part is string => typeof part === "string");
  }

  return [];
};

const readIndexColumnParts = (indexColumn: unknown): string[] => {
  if (typeof indexColumn !== "object" || indexColumn === null) {
    return [];
  }

  if ("queryChunks" in indexColumn && Array.isArray(indexColumn.queryChunks)) {
    return indexColumn.queryChunks.flatMap(readChunkParts);
  }

  if ("name" in indexColumn && typeof indexColumn.name === "string") {
    return [indexColumn.name];
  }

  return [];
};

describe("furiganas schema structure", () => {
  it("has exactly the expected 7 columns", () => {
    const columns = getTableColumns(furiganas);

    expect(Object.keys(columns)).toEqual(EXPECTED_COLUMN_KEYS);
  });

  it('uses "furiganas" as the table name', () => {
    const config = getTableConfig(furiganas);

    expect(config.name).toBe("furiganas");
  });

  it("defines id as text primary key", () => {
    const columns = getTableColumns(furiganas);

    expect(columns.id.getSQLType()).toBe("text");
    expect(columns.id.primary).toBe(true);
  });

  it("marks required columns as NOT NULL", () => {
    const columns = getTableColumns(furiganas);

    expect(columns.rawText.notNull).toBe(true);
    expect(columns.rawTextSnippet.notNull).toBe(true);
    expect(columns.annotationString.notNull).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
  });

  it("keeps nullable columns nullable", () => {
    const columns = getTableColumns(furiganas);

    expect(columns.title.notNull).not.toBe(true);
    expect(columns.deletedAt.notNull).not.toBe(true);
  });

  it("stores all 7 fields as text columns", () => {
    const columns = getTableColumns(furiganas);
    const sqlTypes = EXPECTED_COLUMN_KEYS.map((key) => columns[key].getSQLType());

    expect(sqlTypes).toEqual(["text", "text", "text", "text", "text", "text", "text"]);
  });

  it("defines the unique partial cursor index with the expected name", () => {
    const config = getTableConfig(furiganas);

    expect(config.indexes).toHaveLength(1);
    expect(config.indexes[0]?.config.name).toBe("idx_furiganas_active_cursor");
    expect(config.indexes[0]?.config.unique).toBe(true);
  });

  it("defines index columns in DESC order for created_at and id", () => {
    const config = getTableConfig(furiganas);
    const index = config.indexes[0];

    expect(index).toBeDefined();

    const indexColumns = index?.config.columns.map((columnSql) =>
      readIndexColumnParts(columnSql).join(""),
    );

    expect(indexColumns).toHaveLength(2);
    expect(indexColumns?.[0]).toBeTruthy();
    expect(indexColumns?.[1]).toBeTruthy();
    expect(indexColumns?.[0]).toContain("created_at");
    expect(indexColumns?.[0]?.toLowerCase()).toContain("desc");
    expect(indexColumns?.[1]).toContain("id");
    expect(indexColumns?.[1]?.toLowerCase()).toContain("desc");
  });

  it("defines a WHERE clause on the partial cursor index", () => {
    const config = getTableConfig(furiganas);
    const index = config.indexes[0];

    expect(index?.config.where).toBeDefined();
  });

  it("exports stable Furigana and NewFurigana TypeScript types", () => {
    const row: Furigana = {
      id: "row-id",
      rawText: "raw",
      rawTextSnippet: "snippet",
      annotationString: "annotation",
      title: null,
      createdAt: "2026-03-26T00:00:00.000Z",
      deletedAt: null,
    };

    const expectedShape: {
      id: string;
      rawText: string;
      rawTextSnippet: string;
      annotationString: string;
      title: string | null;
      createdAt: string;
      deletedAt: string | null;
    } = row;

    const insertShape: NewFurigana = {
      id: "new-id",
      rawText: "raw",
      rawTextSnippet: "snippet",
      annotationString: "annotation",
      createdAt: "2026-03-26T00:00:00.000Z",
    };

    expect(expectedShape.id).toBe("row-id");
    expect(insertShape.id).toBe("new-id");
  });
});
