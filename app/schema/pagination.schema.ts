import * as z from "zod";
import { BaseEntitySchema } from "./base.schema";

export const CursorSchema = BaseEntitySchema.pick({ id: true, createdAt: true });

export type Cursor = z.infer<typeof CursorSchema>;

export function PaginationResultsSchema<S extends z.ZodTypeAny>(itemSchema: S) {
  return z.object({
    data: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}

export type PaginationParams = {
  cursor?: string;
  limit?: number;
};

type PaginationResultsBase = z.infer<ReturnType<typeof PaginationResultsSchema<z.ZodTypeAny>>>;

export type PaginationResults<T> = Omit<PaginationResultsBase, "data"> & {
  data: T[];
};
