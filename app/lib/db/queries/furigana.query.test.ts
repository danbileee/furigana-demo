import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { ZodError } from "zod";
import { furiganas, type FuriganaInsert } from "~/lib/db/furigana.db";
import * as schema from "~/lib/db/schema";
import { decodeCursor } from "~/services/pagination.service";

type TestDb = LibSQLDatabase<typeof schema>;
type InsertInput = Pick<
  FuriganaInsert,
  "id" | "rawText" | "annotationString" | "createdAt" | "title"
>;

const mockDbRef: { current: TestDb | null } = { current: null };

vi.mock("~/lib/db/client", () => ({
  get db() {
    if (!mockDbRef.current) {
      throw new Error("Test DB is not initialized");
    }

    return mockDbRef.current;
  },
}));

async function loadQueryModule() {
  return import("./furigana.query");
}

function idFor(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function createdAtFor(index: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function makeInput(index: number, overrides: Partial<InsertInput> = {}): InsertInput {
  return {
    id: idFor(index),
    rawText: `raw-text-${index}-${"x".repeat(60)}`,
    annotationString: `annotation-${index}`,
    createdAt: createdAtFor(index),
    title: null,
    ...overrides,
  };
}

function getTestDb(): TestDb {
  if (!mockDbRef.current) {
    throw new Error("Test DB is not initialized");
  }

  return mockDbRef.current;
}

describe("furigana query functions", () => {
  beforeEach(async () => {
    vi.resetModules();

    const client = createClient({ url: ":memory:" });
    const db = drizzle({ client, schema });
    const { apply } = await pushSQLiteSchema(schema, db);
    await apply();
    mockDbRef.current = db;
  });

  describe("insertFurigana", () => {
    it("inserts a row and returns all fields", async () => {
      const { insertFurigana } = await loadQueryModule();

      const row = await insertFurigana(
        makeInput(1, {
          rawText: "東京は素晴らしい",
          annotationString: "東京{とうきょう}は素晴らしい",
        }),
      );

      expect(row.id).toBe(idFor(1));
      expect(row.rawText).toBe("東京は素晴らしい");
      expect(row.rawTextSnippet).toBe("東京は素晴らしい");
      expect(row.title).toBeNull();
      expect(row.deletedAt).toBeNull();
      expect(row.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Number.isNaN(new Date(row.updatedAt).getTime())).toBe(false);
    });

    it("computes rawTextSnippet as rawText.slice(0, 30)", async () => {
      const { insertFurigana } = await loadQueryModule();
      const rawText = "a".repeat(50);

      const row = await insertFurigana(makeInput(2, { rawText }));

      expect(row.rawTextSnippet).toBe(rawText.slice(0, 30));
      expect(row.rawTextSnippet).toHaveLength(30);
    });

    it("stores rawText untruncated", async () => {
      const { insertFurigana } = await loadQueryModule();
      const rawText = "b".repeat(100);

      const row = await insertFurigana(makeInput(3, { rawText }));

      expect(row.rawText).toHaveLength(100);
      expect(row.rawText).toBe(rawText);
    });

    it("accepts nullable title", async () => {
      const { insertFurigana } = await loadQueryModule();

      const row = await insertFurigana(makeInput(4, { title: null }));

      expect(row.title).toBeNull();
    });

    it("persists the row in the database", async () => {
      const { insertFurigana } = await loadQueryModule();
      const db = getTestDb();

      await insertFurigana(makeInput(5));
      const rows = await db
        .select()
        .from(furiganas)
        .where(eq(furiganas.id, idFor(5)))
        .limit(1);

      expect(rows[0]?.id).toBe(idFor(5));
    });

    it("keeps snippet equal to full rawText when rawText is exactly 30 chars", async () => {
      const { insertFurigana } = await loadQueryModule();
      const rawText = "c".repeat(30);

      const row = await insertFurigana(makeInput(6, { rawText }));

      expect(row.rawTextSnippet).toBe(rawText);
      expect(row.rawTextSnippet).toHaveLength(30);
    });

    it("accepts non-null title", async () => {
      const { insertFurigana } = await loadQueryModule();

      const row = await insertFurigana(makeInput(7, { title: "東京の観光地" }));

      expect(row.title).toBe("東京の観光地");
    });

    it("auto-populates updatedAt when caller does not provide it", async () => {
      const { insertFurigana } = await loadQueryModule();

      const row = await insertFurigana(makeInput(8));

      expect(typeof row.updatedAt).toBe("string");
      expect(Number.isNaN(new Date(row.updatedAt).getTime())).toBe(false);
    });

    it("throws on duplicate ID insert", async () => {
      const { insertFurigana } = await loadQueryModule();
      const duplicateId = idFor(9);

      await insertFurigana(makeInput(9, { id: duplicateId, rawText: "first" }));

      await expect(
        insertFurigana(makeInput(90, { id: duplicateId, rawText: "second" })),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/^Failed query: insert into "furiganas"/),
        cause: expect.objectContaining({
          message: expect.stringMatching(/UNIQUE constraint failed/i),
        }),
      });
    });
  });

  describe("getFuriganaById", () => {
    it("returns an active row by id", async () => {
      const { insertFurigana, getFuriganaById } = await loadQueryModule();

      await insertFurigana(makeInput(101));
      const row = await getFuriganaById(idFor(101));

      expect(row?.id).toBe(idFor(101));
    });

    it("returns null for a non-existent id", async () => {
      const { getFuriganaById } = await loadQueryModule();

      const row = await getFuriganaById(idFor(9999));

      expect(row).toBeNull();
    });

    it("returns null for a soft-deleted row", async () => {
      const { insertFurigana, getFuriganaById } = await loadQueryModule();
      const db = getTestDb();
      const deletedAt = new Date().toISOString();

      await insertFurigana(makeInput(102));
      await db
        .update(furiganas)
        .set({ deletedAt })
        .where(eq(furiganas.id, idFor(102)));

      const row = await getFuriganaById(idFor(102));

      expect(row).toBeNull();
    });

    it("returns null for empty-string id", async () => {
      const { getFuriganaById } = await loadQueryModule();

      const row = await getFuriganaById("");

      expect(row).toBeNull();
    });
  });

  describe("listFuriganas - first page", () => {
    it("returns empty results when table is empty", async () => {
      const { listFuriganas } = await loadQueryModule();

      const page = await listFuriganas({});

      expect(page).toEqual({ data: [], nextCursor: null, hasMore: false });
    });

    it("returns all rows when below default limit", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      await Promise.all([1, 2, 3, 4, 5].map((index) => insertFurigana(makeInput(index))));
      const page = await listFuriganas({});

      expect(page.data).toHaveLength(5);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it("returns newest-first ordering", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      await insertFurigana(makeInput(201));
      await insertFurigana(makeInput(202));
      await insertFurigana(makeInput(203));

      const page = await listFuriganas({});

      expect(page.data.map((row) => row.createdAt)).toEqual([
        createdAtFor(203),
        createdAtFor(202),
        createdAtFor(201),
      ]);
    });

    it("returns exactly limit rows and hasMore true when rows exceed limit", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      for (let index = 1; index <= 6; index += 1) {
        await insertFurigana(makeInput(300 + index));
      }

      const page = await listFuriganas({ limit: 5 });

      expect(page.data).toHaveLength(5);
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).not.toBeNull();
    });

    it("excludes soft-deleted rows", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();
      const db = getTestDb();

      for (let index = 1; index <= 5; index += 1) {
        await insertFurigana(makeInput(400 + index));
      }

      await db
        .update(furiganas)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(furiganas.id, idFor(404)));
      await db
        .update(furiganas)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(furiganas.id, idFor(405)));

      const page = await listFuriganas({});

      expect(page.data).toHaveLength(3);
      expect(page.data.map((row) => row.id)).not.toContain(idFor(404));
      expect(page.data.map((row) => row.id)).not.toContain(idFor(405));
    });

    it("returns only sidebar projection fields", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      await insertFurigana(
        makeInput(500, {
          rawText: "d".repeat(200),
          annotationString: "annotated".repeat(40),
        }),
      );

      const page = await listFuriganas({});
      const item = page.data[0];

      expect(item).toBeDefined();
      expect(Object.keys(item ?? {}).sort()).toEqual([
        "createdAt",
        "id",
        "rawTextSnippet",
        "title",
      ]);
      expect(item).not.toHaveProperty("rawText");
      expect(item).not.toHaveProperty("annotationString");
      expect(item).not.toHaveProperty("updatedAt");
      expect(item).not.toHaveProperty("deletedAt");
    });

    it("uses default limit of 20 when limit is omitted", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      for (let index = 1; index <= 25; index += 1) {
        await insertFurigana(makeInput(600 + index));
      }

      const page = await listFuriganas({});

      expect(page.data).toHaveLength(20);
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).not.toBeNull();
    });
  });

  describe("listFuriganas - cursor navigation", () => {
    it("returns the correct second page and hasMore state", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      for (let index = 1; index <= 10; index += 1) {
        await insertFurigana(makeInput(700 + index));
      }

      const firstPage = await listFuriganas({ limit: 4 });
      const secondPage = await listFuriganas({
        cursor: firstPage.nextCursor ?? undefined,
        limit: 4,
      });

      expect(firstPage.nextCursor).not.toBeNull();
      expect(secondPage.data.map((row) => row.id)).toEqual([
        idFor(706),
        idFor(705),
        idFor(704),
        idFor(703),
      ]);
      expect(secondPage.hasMore).toBe(true);
      expect(secondPage.nextCursor).not.toBeNull();
    });

    it("returns hasMore false and nextCursor null on last page", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      for (let index = 1; index <= 10; index += 1) {
        await insertFurigana(makeInput(800 + index));
      }

      const firstPage = await listFuriganas({ limit: 4 });
      const secondPage = await listFuriganas({
        cursor: firstPage.nextCursor ?? undefined,
        limit: 4,
      });
      const thirdPage = await listFuriganas({
        cursor: secondPage.nextCursor ?? undefined,
        limit: 4,
      });

      expect(thirdPage.data).toHaveLength(2);
      expect(thirdPage.hasMore).toBe(false);
      expect(thirdPage.nextCursor).toBeNull();
    });

    it("does not duplicate or skip rows across all pages", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      for (let index = 1; index <= 10; index += 1) {
        await insertFurigana(makeInput(900 + index));
      }

      const seenIds: string[] = [];
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const page = await listFuriganas({ cursor, limit: 3 });
        seenIds.push(...page.data.map((row) => row.id));
        hasMore = page.hasMore;
        cursor = page.nextCursor ?? undefined;
      }

      expect(seenIds).toHaveLength(10);
      expect(new Set(seenIds).size).toBe(10);
    });

    it("does not surface a late-inserted row with a newer timestamp on pages bounded by an older cursor", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      for (let index = 1; index <= 5; index += 1) {
        await insertFurigana(makeInput(1000 + index));
      }

      const firstPage = await listFuriganas({ limit: 3 });
      await insertFurigana(
        makeInput(1999, {
          createdAt: "2026-12-31T23:59:59.000Z",
        }),
      );

      const secondPage = await listFuriganas({
        cursor: firstPage.nextCursor ?? undefined,
        limit: 3,
      });

      expect(secondPage.data.map((row) => row.id)).not.toContain(idFor(1999));
    });

    it("handles createdAt ties via id DESC and keeps rows reachable", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();
      const sharedCreatedAt = "2026-05-01T00:00:00.000Z";

      await insertFurigana(
        makeInput(1101, {
          id: "00000000-0000-4000-8000-000000000001",
          createdAt: sharedCreatedAt,
        }),
      );
      await insertFurigana(
        makeInput(1102, {
          id: "00000000-0000-4000-8000-000000000002",
          createdAt: sharedCreatedAt,
        }),
      );

      const firstPage = await listFuriganas({ limit: 1 });
      const secondPage = await listFuriganas({
        cursor: firstPage.nextCursor ?? undefined,
        limit: 1,
      });

      expect(firstPage.data[0]?.id).toBe("00000000-0000-4000-8000-000000000002");
      expect(secondPage.data[0]?.id).toBe("00000000-0000-4000-8000-000000000001");
    });

    it("builds nextCursor from the last visible row, not the probe row", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();

      await insertFurigana(makeInput(1201));
      await insertFurigana(makeInput(1202));
      await insertFurigana(makeInput(1203));
      await insertFurigana(makeInput(1204));

      const firstPage = await listFuriganas({ limit: 2 });
      const decodedCursor = firstPage.nextCursor ? decodeCursor(firstPage.nextCursor) : null;

      expect(firstPage.data).toHaveLength(2);
      expect(firstPage.hasMore).toBe(true);
      expect(decodedCursor).toEqual({
        createdAt: createdAtFor(1203),
        id: idFor(1203),
      });

      const secondPage = await listFuriganas({
        cursor: firstPage.nextCursor ?? undefined,
        limit: 2,
      });

      expect(secondPage.data.map((row) => row.id)).toEqual([idFor(1202), idFor(1201)]);
    });

    it("keeps pagination correct when boundary cursor row is soft-deleted", async () => {
      const { insertFurigana, listFuriganas } = await loadQueryModule();
      const db = getTestDb();

      for (let index = 1; index <= 5; index += 1) {
        await insertFurigana(makeInput(1300 + index));
      }

      const firstPage = await listFuriganas({ limit: 2 });
      expect(firstPage.data.map((row) => row.id)).toEqual([idFor(1305), idFor(1304)]);

      await db
        .update(furiganas)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(furiganas.id, idFor(1304)));

      const secondPage = await listFuriganas({
        cursor: firstPage.nextCursor ?? undefined,
        limit: 2,
      });

      expect(secondPage.data.map((row) => row.id)).toEqual([idFor(1303), idFor(1302)]);
      expect(secondPage.data.map((row) => row.id)).not.toContain(idFor(1304));
      expect(secondPage.hasMore).toBe(true);
    });
  });

  describe("listFuriganas - error handling", () => {
    it("propagates Error for malformed base64 cursor", async () => {
      const { listFuriganas } = await loadQueryModule();

      await expect(listFuriganas({ cursor: "not-valid-base64!!!" })).rejects.toThrow(
        "Invalid cursor",
      );
    });

    it("propagates ZodError for wrong-shape cursor payload", async () => {
      const { listFuriganas } = await loadQueryModule();
      const wrongShapeCursor = Buffer.from('{"wrong":"shape"}').toString("base64");

      await expect(listFuriganas({ cursor: wrongShapeCursor })).rejects.toThrow(ZodError);
    });

    it("propagates Error for empty-string cursor", async () => {
      const { listFuriganas } = await loadQueryModule();

      await expect(listFuriganas({ cursor: "" })).rejects.toThrow("Invalid cursor");
    });
  });
});
