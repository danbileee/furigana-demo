import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const migrationFiles = fs.existsSync(drizzleDir)
  ? fs
      .readdirSync(drizzleDir)
      .filter((fileName) => /^\d+_.*\.sql$/u.test(fileName))
      .sort()
  : [];

const hasMigrations = migrationFiles.length > 0;
const combinedSql = hasMigrations
  ? migrationFiles
      .map((fileName) => fs.readFileSync(path.join(drizzleDir, fileName), "utf8"))
      .join("\n")
  : "";

const indexStatements = hasMigrations
  ? Array.from(
      combinedSql.matchAll(
        /CREATE\s+UNIQUE\s+INDEX[\s\S]*?idx_furiganas_active_cursor[\s\S]*?;/giu,
      ),
      (match) => match[0],
    )
  : [];

const targetIndexStatement = indexStatements.at(-1) ?? "";

describe("migration SQL guard", () => {
  test.skipIf(!hasMigrations)("has at least one generated migration SQL file", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  test.skipIf(!hasMigrations)("contains the furiganas table definition", () => {
    expect(combinedSql).toMatch(/CREATE\s+TABLE\s+[`"]furiganas[`"]/iu);
  });

  test.skipIf(!hasMigrations)("contains all 7 required furiganas columns", () => {
    const expectedColumns = [
      "id",
      "raw_text",
      "raw_text_snippet",
      "annotation_string",
      "title",
      "created_at",
      "deleted_at",
    ];

    for (const columnName of expectedColumns) {
      expect(combinedSql.toLowerCase()).toContain(columnName);
    }
  });

  test.skipIf(!hasMigrations)("contains the cursor unique index with DESC order", () => {
    expect(targetIndexStatement).toMatch(/CREATE\s+UNIQUE\s+INDEX/iu);
    expect(targetIndexStatement).toMatch(/idx_furiganas_active_cursor/iu);
    expect(targetIndexStatement).toMatch(/ON\s+[`"]furiganas[`"]/iu);
    expect(targetIndexStatement).toMatch(/created_at[\s\S]*desc/iu);
    expect(targetIndexStatement).toMatch(/id[\s\S]*desc/iu);
  });

  test.skipIf(!hasMigrations)("does not contain $1 placeholder in index WHERE clause", () => {
    expect(targetIndexStatement).toBeTruthy();
    expect(targetIndexStatement).toMatch(/WHERE/iu);
    expect(targetIndexStatement).toMatch(/deleted_at/iu);
    expect(targetIndexStatement).not.toMatch(/\$1/u);
  });
});
