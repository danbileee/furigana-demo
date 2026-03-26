import {
  FuriganaEntityInsertSchema,
  FuriganaPaginationResultsSchema,
  FuriganaEntityRowSchema,
  FuriganaPaginationResultSchema,
  FuriganaTokenSchema,
  RubyTokenSchema,
  TextTokenSchema,
  isRubyToken,
  isTextToken,
  type FuriganaEntityInsert,
  type FuriganaEntityRow,
  type FuriganaToken,
  type TextToken,
} from "./furigana.schema";
import type { FuriganaRow, FuriganaInsert } from "~/lib/db/furigana.db";

describe("TextTokenSchema", () => {
  it("parses a valid text token", () => {
    const result = TextTokenSchema.parse({ type: "text", value: "こんにちは" });

    expect(result).toEqual({ type: "text", value: "こんにちは" });
  });

  it("allows empty string values", () => {
    const result = TextTokenSchema.parse({ type: "text", value: "" });

    expect(result).toEqual({ type: "text", value: "" });
  });

  it("rejects values containing annotation placeholders", () => {
    const result = TextTokenSchema.safeParse({
      type: "text",
      value: "日本語{にほんご}",
    });

    expect(result.success).toBe(false);
  });

  it("rejects values containing unmatched braces", () => {
    const result = TextTokenSchema.safeParse({
      type: "text",
      value: "text{",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a wrong type discriminant", () => {
    const result = TextTokenSchema.safeParse({ type: "ruby", value: "hi" });

    expect(result.success).toBe(false);
  });
});

describe("RubyTokenSchema", () => {
  it("parses a valid ruby token", () => {
    const result = RubyTokenSchema.parse({
      type: "ruby",
      kanji: "東京",
      yomi: "とうきょう",
    });

    expect(result).toEqual({
      type: "ruby",
      kanji: "東京",
      yomi: "とうきょう",
    });
  });

  it("rejects empty kanji", () => {
    const result = RubyTokenSchema.safeParse({
      type: "ruby",
      kanji: "",
      yomi: "とうきょう",
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty yomi", () => {
    const result = RubyTokenSchema.safeParse({
      type: "ruby",
      kanji: "東京",
      yomi: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("FuriganaTokenSchema", () => {
  it("parses a text token through the union schema", () => {
    const result = FuriganaTokenSchema.parse({ type: "text", value: "きました" });

    expect(result).toEqual({ type: "text", value: "きました" });
  });

  it("parses a ruby token through the union schema", () => {
    const result = FuriganaTokenSchema.parse({
      type: "ruby",
      kanji: "行",
      yomi: "い",
    });

    expect(result).toEqual({ type: "ruby", kanji: "行", yomi: "い" });
  });

  it("rejects unknown type values", () => {
    const result = FuriganaTokenSchema.safeParse({
      type: "unknown",
      value: "x",
    });

    expect(result.success).toBe(false);
  });

  it("rejects values without type", () => {
    const result = FuriganaTokenSchema.safeParse({ value: "x" });

    expect(result.success).toBe(false);
  });
});

describe("type guards", () => {
  it("isTextToken narrows text tokens", () => {
    const token: FuriganaToken = { type: "text", value: "こんにちは" };

    expect(isTextToken(token)).toBe(true);
    expect(isRubyToken(token)).toBe(false);
  });

  it("isRubyToken narrows ruby tokens", () => {
    const token: FuriganaToken = {
      type: "ruby",
      kanji: "漢字",
      yomi: "かんじ",
    };

    expect(isRubyToken(token)).toBe(true);
    expect(isTextToken(token)).toBe(false);
  });
});

describe("readonly discriminant", () => {
  it("keeps TextToken.type readonly at compile time", () => {
    const token: TextToken = { type: "text", value: "hi" };

    // @ts-expect-error type is readonly and cannot be reassigned
    token.type = "ruby";

    expect(token).toBeDefined();
  });
});

describe("Drizzle type alignment", () => {
  it("keeps Furigana row type bidirectionally assignable", () => {
    const _drizzleToZod = {} as FuriganaRow satisfies FuriganaEntityRow;
    const _zodToDrizzle = {} as FuriganaEntityRow satisfies FuriganaRow;

    expect(_drizzleToZod).toBeDefined();
    expect(_zodToDrizzle).toBeDefined();
  });

  it("keeps Furigana insert type bidirectionally assignable", () => {
    const _drizzleInsertToZod = {} as FuriganaInsert satisfies FuriganaEntityInsert;
    const _zodInsertToDrizzle = {} as FuriganaEntityInsert satisfies FuriganaInsert;

    expect(_drizzleInsertToZod).toBeDefined();
    expect(_zodInsertToDrizzle).toBeDefined();
  });
});

describe("FuriganaRowSchema", () => {
  const validRow: FuriganaEntityRow = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    rawText: "東京は素晴らしい",
    rawTextSnippet: "東京は素晴らしい",
    annotationString: "東京{とうきょう}は素晴らしい",
    title: "My entry",
    createdAt: "2026-03-26T12:00:00.000Z",
    updatedAt: "2026-03-26T12:00:00.000Z",
    deletedAt: null,
  };

  it("accepts a valid full database row", () => {
    const result = FuriganaEntityRowSchema.parse(validRow);

    expect(result).toEqual(validRow);
  });

  it("accepts nullable title and deletedAt", () => {
    const result = FuriganaEntityRowSchema.parse({
      ...validRow,
      title: null,
    });

    expect(result.title).toBeNull();
    expect(result.deletedAt).toBeNull();
  });

  it("accepts non-null deletedAt", () => {
    const result = FuriganaEntityRowSchema.parse({
      ...validRow,
      deletedAt: "2026-03-27T00:00:00.000Z",
    });

    expect(result.deletedAt).toBe("2026-03-27T00:00:00.000Z");
  });

  it("rejects non-UUID id", () => {
    const result = FuriganaEntityRowSchema.safeParse({
      ...validRow,
      id: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-ISO createdAt", () => {
    const result = FuriganaEntityRowSchema.safeParse({
      ...validRow,
      createdAt: "2026/03/26",
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-ISO updatedAt", () => {
    const result = FuriganaEntityRowSchema.safeParse({
      ...validRow,
      updatedAt: "2026/03/26",
    });

    expect(result.success).toBe(false);
  });
});

describe("FuriganaInsertSchema", () => {
  const baseInsert = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    rawText: "東京",
    rawTextSnippet: "東京",
    annotationString: "東京{とうきょう}",
    createdAt: "2026-03-26T12:00:00.000Z",
  };

  it("accepts a minimal valid insert without title", () => {
    const result = FuriganaEntityInsertSchema.parse(baseInsert);

    expect(result.title).toBeUndefined();
  });

  it("accepts an insert with title null", () => {
    const result = FuriganaEntityInsertSchema.parse({
      ...baseInsert,
      title: null,
    });

    expect(result.title).toBeNull();
  });

  it("rejects rawText longer than 5000", () => {
    const result = FuriganaEntityInsertSchema.safeParse({
      ...baseInsert,
      rawText: "a".repeat(5001),
    });

    expect(result.success).toBe(false);
  });

  it("accepts rawText exactly 5000 characters", () => {
    const result = FuriganaEntityInsertSchema.parse({
      ...baseInsert,
      rawText: "a".repeat(5000),
    });

    expect(result.rawText.length).toBe(5000);
  });

  it("rejects rawTextSnippet longer than 30", () => {
    const result = FuriganaEntityInsertSchema.safeParse({
      ...baseInsert,
      rawTextSnippet: "a".repeat(31),
    });

    expect(result.success).toBe(false);
  });

  it("accepts rawTextSnippet exactly 30 characters", () => {
    const result = FuriganaEntityInsertSchema.parse({
      ...baseInsert,
      rawTextSnippet: "a".repeat(30),
    });

    expect(result.rawTextSnippet.length).toBe(30);
  });
});

describe("FuriganaSidebarSchema", () => {
  const sidebarItem = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    rawTextSnippet: "東京は",
    title: null,
    createdAt: "2026-03-26T12:00:00.000Z",
  };

  it("accepts a valid sidebar projection", () => {
    const result = FuriganaPaginationResultSchema.parse(sidebarItem);

    expect(result).toEqual(sidebarItem);
  });

  it("strips full-row fields such as rawText", () => {
    const result = FuriganaPaginationResultSchema.parse({
      ...sidebarItem,
      rawText: "東京は素晴らしい",
    });

    expect("rawText" in result).toBe(false);
  });

  it("rejects missing rawTextSnippet", () => {
    const result = FuriganaPaginationResultSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: null,
      createdAt: "2026-03-26T12:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("FuriganaPaginationResultsSchema", () => {
  it("accepts a valid paginated sidebar response", () => {
    const result = FuriganaPaginationResultsSchema.parse({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          rawTextSnippet: "東京は",
          title: null,
          createdAt: "2026-03-26T12:00:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    expect(result.hasMore).toBe(false);
    expect(result.data).toHaveLength(1);
  });

  it("accepts empty data with non-null nextCursor", () => {
    const result = FuriganaPaginationResultsSchema.parse({
      data: [],
      nextCursor:
        "eyJjcmVhdGVkQXQiOiIyMDI2LTAzLTI2VDEyOjAwOjAwLjAwMFoiLCJpZCI6IjU1MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDAwMCJ9",
      hasMore: true,
    });

    expect(result.hasMore).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("rejects a non-sidebar item missing id", () => {
    const result = FuriganaPaginationResultsSchema.safeParse({
      data: [
        {
          rawTextSnippet: "東京は",
          title: null,
          createdAt: "2026-03-26T12:00:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    expect(result.success).toBe(false);
  });
});
