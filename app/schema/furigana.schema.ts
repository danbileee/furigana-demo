import * as z from "zod";
import { CursorPaginationResultsSchema } from "~/schema/pagination.schema";
import { BaseEntitySchema } from "./base.schema";
import { MAX_FURIGANA_INPUT_LENGTH } from "~/constants/furigana.const";

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

export const FuriganaRowSchema = z.object({
  ...BaseEntitySchema.shape,
  rawText: z.string(),
  rawTextSnippet: z.string(),
  annotationString: z.string(),
  title: z.string().nullable(),
  deletedAt: z.iso.datetime().nullable(),
});

export type FuriganaInferredRow = z.infer<typeof FuriganaRowSchema>;

export const FuriganaInsertSchema = z.object({
  ...BaseEntitySchema.shape,
  rawText: z.string().min(1).max(MAX_FURIGANA_INPUT_LENGTH),
  rawTextSnippet: z.string().min(1).max(30),
  annotationString: z.string(), // unbounded by design — annotation strings can exceed rawText length due to reading annotations
  title: z.string().nullable().optional(),
});

export type FuriganaInferredInsert = z.infer<typeof FuriganaInsertSchema>;

export const FuriganaPaginationItemSchema = z.object({
  id: z.uuid(),
  rawTextSnippet: z.string().max(30),
  title: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type FuriganaPaginationItem = z.infer<typeof FuriganaPaginationItemSchema>;

export const FuriganaPaginationResultsSchema = CursorPaginationResultsSchema(
  FuriganaPaginationItemSchema,
);

export type FuriganaPaginationResults = z.infer<typeof FuriganaPaginationResultsSchema>;
