export const NON_JAPANESE_INPUT_ERROR =
  "Please include at least one kanji character in your text (some non-Japanese words are okay).";
export const GENERATION_INAVAILABLE_ERROR =
  "We couldn't generate furigana right now. Please try again.";

/**
 * Maximum number of characters accepted for furigana generation input.
 * Enforced server-side in route actions and client-side in the textarea.
 */
export const MAX_FURIGANA_INPUT_LENGTH = 8_000;

/**
 * Default page size for furigana history/sidebar list pagination.
 */
export const DEFAULT_FURIGANA_LIST_LIMIT = 20;
