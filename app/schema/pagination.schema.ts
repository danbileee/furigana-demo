import * as z from "zod";
import { BaseEntitySchema } from "./base.schema";

export const CursorSchema = BaseEntitySchema.pick({ id: true, createdAt: true });

export type Cursor = z.infer<typeof CursorSchema>;

export function CursorPaginationResultsSchema<S extends z.ZodTypeAny>(itemSchema: S) {
  return z.object({
    data: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}

export const CursorPaginationParamsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type CursorPaginationParams = z.infer<typeof CursorPaginationParamsSchema>;

type CursorPaginationResultsBase = z.infer<
  ReturnType<typeof CursorPaginationResultsSchema<z.ZodTypeAny>>
>;

export type CursorPaginationResults<T> = Omit<CursorPaginationResultsBase, "data"> & {
  data: T[];
};
