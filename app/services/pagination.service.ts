// Server-only — never import in client bundles
import { CursorSchema, type Cursor } from "~/schema/pagination.schema";

/**
 * Decode and validate a cursor token.
 *
 * @throws {Error} on base64 or JSON decode failure
 * @throws {import("zod").ZodError} on schema validation failure
 */
export function decodeCursor(cursor: string): Cursor {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
  } catch {
    throw new Error("Invalid cursor: base64 or JSON decode failed");
  }

  return CursorSchema.parse(parsed);
}

/**
 * Cursor encoding (NOT secure)
 *
 * - This cursor is NOT signed and can be modified by clients.
 * - Cursor must NEVER be used for authorization or access control.
 * - Always enforce access control in the query layer (e.g. userId, tenantId).
 *
 * Security model:
 * - Cursor = pagination boundary only
 * - Auth = enforced via WHERE clause
 */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64");
}
