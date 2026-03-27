import { CursorSchema, type Cursor } from "~/schema/pagination.schema";

export function decodeCursor(cursor: string): Cursor {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
  } catch {
    throw new Error("Invalid cursor: base64 or JSON decode failed");
  }

  return CursorSchema.parse(parsed);
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64");
}
