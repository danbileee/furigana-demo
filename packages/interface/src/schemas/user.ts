import * as z from "zod";

export const CreateUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
