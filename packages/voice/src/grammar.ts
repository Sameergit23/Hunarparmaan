import { UNKNOWN } from './normalize';
import {
  COMMAND_WORDS,
  DIGIT_WORDS,
  NO_WORDS,
  PAIR_WORDS,
  PLUS_WORDS,
  REPEAT_WORDS,
  SCALE_WORDS,
  SOFT_YES_WORDS,
  YES_NO_PHRASES,
  YES_WORDS,
} from './vocabulary';

/*
 * Word lists for Vosk's word-list mode (react-native-vosk's `grammar`), which makes a short list
 * far more reliable than free speech (ADR 012). Each entry is a word or a phrase.
 * Vosk skips, with a warning, any word its model doesn't know, so one list serves the Hindi and
 * English models: the Hindi model keeps नौ and नाइन, an English model keeps nine. The Sprint 1
 * spike checks the spellings against the Hindi model's vocabulary.
 *
 * Vosk matches a model's spelling exactly, and Unicode writes a nukta letter such as ज़ either as
 * one character or as ज plus a nukta (the NFC form). Words with one come in both forms, so the
 * list works whichever form the model uses.
 *
 * "[unk]" lets Vosk answer "[unk]" for speech outside the list instead of forcing the nearest
 * word. Number screens leave out yes and no, and yes-or-no screens leave out the digits:
 * नौ and नहीं sound alike.
 */

const COMMANDS = Object.values(COMMAND_WORDS).flat();

/** क़ ख़ ग़ ज़ ड़ ढ़ फ़ य़, each from its NFC form (letter + nukta) to its one-character form. */
const NUKTA_LETTERS = Array.from({ length: 8 }, (_, i) => {
  const letter = String.fromCodePoint(0x0958 + i);
  return [letter.normalize('NFC'), letter] as const;
});

/** What to listen for on a screen that takes a mobile number or a code. */
export function digitGrammar(): string[] {
  return wordList([
    ...Object.values(DIGIT_WORDS).flat(),
    ...Object.values(PAIR_WORDS).flat(),
    ...Object.values(REPEAT_WORDS).flat(),
    ...PLUS_WORDS,
    ...SCALE_WORDS,
    ...COMMANDS,
  ]);
}

/** What to listen for on a screen that asks "सही है?". */
export function yesNoGrammar(): string[] {
  return wordList([...YES_WORDS, ...SOFT_YES_WORDS, ...YES_NO_PHRASES, ...NO_WORDS, ...COMMANDS]);
}

function wordList(entries: readonly string[]): string[] {
  return [...new Set(entries.flatMap(bothForms)), UNKNOWN];
}

function bothForms(entry: string): string[] {
  const nfc = entry.normalize('NFC');
  let precomposed = nfc;
  for (const [decomposed, letter] of NUKTA_LETTERS) {
    precomposed = precomposed.replaceAll(decomposed, letter);
  }
  return precomposed === nfc ? [nfc] : [nfc, precomposed];
}
