/** One word of what the recogniser heard. */
export interface Word {
  /** As heard: NFC, without punctuation. */
  text: string;
  /** For lookups: see `wordKey`. */
  key: string;
}

/** Vosk's word for speech outside its word list. */
export const UNKNOWN = '[unk]';

const ZERO_WIDTH_JOINERS = /[\u200C\u200D]/gu;
const NOT_PART_OF_A_WORD = /[^\p{L}\p{M}\p{N}]+/u;
const NUMERALS = /([0-9\u0966-\u096F]+)/u;

/**
 * Splits text into words. Punctuation, the danda included, separates words and is dropped,
 * except that "+" reads as "plus" (as in +91) and Vosk's "[unk]" stays one word. A run of
 * numerals is a word of its own, so "98765,43210" is two words.
 */
export function splitWords(text: string): Word[] {
  const words: Word[] = [];
  for (const chunk of text.normalize('NFC').replace(ZERO_WIDTH_JOINERS, '').split(/\s+/u)) {
    if (chunk.toLowerCase() === UNKNOWN) {
      words.push({ text: UNKNOWN, key: UNKNOWN });
      continue;
    }
    for (const piece of chunk.replaceAll('+', ' plus ').split(NOT_PART_OF_A_WORD)) {
      for (const part of piece.split(NUMERALS)) {
        if (part !== '') words.push({ text: part, key: wordKey(part) });
      }
    }
  }
  return words;
}

/**
 * The form words are compared in, so spellings that differ only in these ways match:
 * - nukta: ज़ीरो and जीरो, with the nukta letter precomposed or not;
 * - chandrabindu and anusvara: पाँच and पांच;
 * - zero-width joiners, and upper and lower case.
 */
export function wordKey(word: string): string {
  return word
    .normalize('NFD')
    .replaceAll('\u093C', '')
    .normalize('NFC')
    .replaceAll('\u0901', '\u0902')
    .replace(ZERO_WIDTH_JOINERS, '')
    .toLowerCase();
}
