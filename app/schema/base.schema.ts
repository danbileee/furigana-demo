import z from "zod";

export const BaseEntitySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BaseEntity = z.infer<typeof BaseEntitySchema>;
