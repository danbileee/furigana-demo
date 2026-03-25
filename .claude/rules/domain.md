# Domain Terms & Entities

Core concepts and terminology used in the Furigana project.

## Furigana

The primary entity in this system. Furigana is Japanese text with annotated phonetic readings (typically hiragana) placed above or beside kanji characters to aid pronunciation and comprehension.

**Example**: 漢字 (かんじ) — "kanji" characters with their reading shown in parentheses.

### Furigana Properties

- **Raw Text**: The input Japanese text containing kanji, hiragana, and katakana
- **Annotated String**: The output version with readings added (either inline or markup-based) - DB specific schema
- **Ruby Token**: Individual entries mapping one kanji/word to its reading(s) - UI specific schema
- **View Mode**: How to display furigana (Always or On Hover) - UI term
