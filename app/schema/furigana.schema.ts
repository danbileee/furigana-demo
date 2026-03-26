import * as z from "zod";
import { PaginationResultsSchema } from "~/schema/pagination.schema";
import { BaseEntitySchema } from "./base.schema";

/**
 * @schema
 * Schema for a plain text segment (hiragana, katakana, punctuation, romaji).
 *
 * The value field must not contain brace-wrapped substrings of the form {…}
 * because those denote ruby annotation placeholders and belong in a RubyToken.
 */
export const TextTokenSchema = z.object({
  type: z.literal("text").readonly(),
  value: z.string().regex(/^(?:[^{}])*$/, "TextToken value must not contain {…} placeholders"),
});

/**
 * @schema
 * Schema for a kanji compound paired with its furigana reading.
 */
export const RubyTokenSchema = z.object({
  type: z.literal("ruby").readonly(),
  kanji: z.string().min(1),
  yomi: z.string().min(1),
});

export const FuriganaTokenSchema = z.discriminatedUnion("type", [TextTokenSchema, RubyTokenSchema]);

export type TextToken = z.infer<typeof TextTokenSchema>;

export type RubyToken = z.infer<typeof RubyTokenSchema>;

export type FuriganaToken = z.infer<typeof FuriganaTokenSchema>;

export function isTextToken(token: FuriganaToken): token is TextToken {
  return token.type === "text";
}

export function isRubyToken(token: FuriganaToken): token is RubyToken {
  return token.type === "ruby";
}

// --- Database schemas ---

export const FuriganaEntityRowSchema = z.object({
  ...BaseEntitySchema.shape,
  rawText: z.string().max(5000),
  rawTextSnippet: z.string().max(30),
  annotationString: z.string(),
  title: z.string().nullable(),
  deletedAt: z.iso.datetime().nullable(),
});

export type FuriganaEntityRow = z.infer<typeof FuriganaEntityRowSchema>;

export const FuriganaEntityInsertSchema = FuriganaEntityRowSchema.extend({
  title: FuriganaEntityRowSchema.shape.title.optional(),
  updatedAt: FuriganaEntityRowSchema.shape.updatedAt.optional(),
}).pick({
  id: true,
  rawText: true,
  rawTextSnippet: true,
  annotationString: true,
  title: true,
  createdAt: true,
  updatedAt: true,
});

export type FuriganaEntityInsert = z.infer<typeof FuriganaEntityInsertSchema>;

export const FuriganaPaginationResultSchema = FuriganaEntityRowSchema.pick({
  id: true,
  rawTextSnippet: true,
  title: true,
  createdAt: true,
});

export type FuriganaPaginationResult = z.infer<typeof FuriganaPaginationResultSchema>;

export const FuriganaPaginationResultsSchema = PaginationResultsSchema(
  FuriganaPaginationResultSchema,
);

export type FuriganaPaginationResults = z.infer<typeof FuriganaPaginationResultsSchema>;
