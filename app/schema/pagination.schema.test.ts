import * as z from "zod";

import { CursorSchema, PaginationResultsSchema } from "./pagination.schema";

describe("CursorSchema", () => {
  it("accepts a valid cursor with ISO datetime and UUID", () => {
    const input = {
      createdAt: "2026-03-26T12:00:00.000Z",
      id: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = CursorSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("rejects a cursor missing createdAt", () => {
    const result = CursorSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a cursor missing id", () => {
    const result = CursorSchema.safeParse({
      createdAt: "2026-03-26T12:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a cursor with non-ISO createdAt", () => {
    const result = CursorSchema.safeParse({
      createdAt: "March 26, 2026",
      id: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a cursor with malformed UUID", () => {
    const result = CursorSchema.safeParse({
      createdAt: "2026-03-26T12:00:00.000Z",
      id: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a cursor with non-string id", () => {
    const result = CursorSchema.safeParse({
      createdAt: "2026-03-26T12:00:00.000Z",
      id: 12345,
    });

    expect(result.success).toBe(false);
  });
});

describe("PaginationResultsSchema", () => {
  const itemSchema = z.object({ name: z.string() });
  const schema = PaginationResultsSchema(itemSchema);

  it("returns a schema that accepts a valid envelope", () => {
    const input = {
      data: [{ name: "a" }],
      nextCursor: "abc123",
      hasMore: true,
    };

    const result = schema.parse(input);

    expect(result).toEqual(input);
  });

  it("accepts nextCursor as null", () => {
    const input = { data: [], nextCursor: null, hasMore: false };

    const result = schema.parse(input);

    expect(result).toEqual(input);
  });

  it("strips unknown fields", () => {
    const result = schema.parse({
      data: [],
      nextCursor: null,
      hasMore: false,
      total: 42,
    });

    expect("total" in result).toBe(false);
  });

  it("rejects missing hasMore", () => {
    const result = schema.safeParse({ data: [], nextCursor: null });

    expect(result.success).toBe(false);
  });

  it("rejects non-boolean hasMore", () => {
    const result = schema.safeParse({
      data: [],
      nextCursor: null,
      hasMore: "true",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid item shape", () => {
    const result = schema.safeParse({
      data: [{ name: 123 }],
      nextCursor: null,
      hasMore: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing nextCursor key", () => {
    const result = schema.safeParse({ data: [], hasMore: false });

    expect(result.success).toBe(false);
  });

  it("rejects non-array data", () => {
    const result = schema.safeParse({
      data: { name: "a" },
      nextCursor: null,
      hasMore: false,
    });

    expect(result.success).toBe(false);
  });
});
