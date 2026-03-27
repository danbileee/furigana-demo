import { ZodError } from "zod";
import { decodeCursor, encodeCursor } from "./cursor-pagination.service";

describe("cursor pagination service", () => {
  it("encodeCursor produces a decodable base64 string", () => {
    const cursor = encodeCursor("2026-03-27T10:00:00.000Z", "550e8400-e29b-41d4-a716-446655440000");

    expect(() => Buffer.from(cursor, "base64").toString("utf-8")).not.toThrow();
    expect(typeof cursor).toBe("string");
    expect(cursor.length).toBeGreaterThan(0);
  });

  it("decodeCursor reverses encodeCursor symmetrically", () => {
    const createdAt = "2026-03-27T10:00:00.000Z";
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const cursor = encodeCursor(createdAt, id);

    const decoded = decodeCursor(cursor);

    expect(decoded).toEqual({ createdAt, id });
  });

  it("decodeCursor throws Error on malformed base64", () => {
    expect(() => decodeCursor("not-valid-base64!!!")).toThrow("Invalid cursor");
  });

  it("decodeCursor throws ZodError on valid base64 with wrong shape", () => {
    const cursor = Buffer.from('{"wrong":"shape"}').toString("base64");

    expect(() => decodeCursor(cursor)).toThrow(ZodError);
  });

  it("decodeCursor accepts a valid cursor payload", () => {
    const createdAt = "2026-03-27T10:00:00.000Z";
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const cursor = Buffer.from(JSON.stringify({ createdAt, id })).toString("base64");

    expect(decodeCursor(cursor)).toEqual({ createdAt, id });
  });

  it("decodeCursor throws Error on empty string cursor", () => {
    expect(() => decodeCursor("")).toThrow("Invalid cursor");
  });

  it("decodeCursor throws Error when base64 decodes to non-JSON text", () => {
    const cursor = Buffer.from("this is not json").toString("base64");

    expect(() => decodeCursor(cursor)).toThrow("Invalid cursor");
  });
});
