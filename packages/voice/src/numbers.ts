import { splitWords, wordKey } from './normalize';
import { DIGIT_WORDS, PAIR_WORDS, PLUS_WORDS, REPEAT_WORDS } from './vocabulary';

export interface SpokenNumber {
  /** The digits heard, in order, as 0 to 9: "नौ आठ डबल सात" is "9877". */
  digits: string;
  /** Words it could not use, as heard and in order, such as "सौ", "हज़ार" or Vosk's "[unk]". */
  unused: string[];
}

type Meaning =
  { kind: 'number'; digits: string } | { kind: 'repeat'; times: number } | { kind: 'plus' };

function spelt(spellings: readonly string[], meaning: Meaning): [string, Meaning][] {
  return spellings.map((spelling) => [wordKey(spelling), meaning]);
}

const MEANINGS = new Map<string, Meaning>([
  ...Object.entries({ ...DIGIT_WORDS, ...PAIR_WORDS }).flatMap(([digits, spellings]) =>
    spelt(spellings, { kind: 'number', digits }),
  ),
  ...Object.entries(REPEAT_WORDS).flatMap(([times, spellings]) =>
    spelt(spellings, { kind: 'repeat', times: Number(times) }),
  ),
  ...spelt(PLUS_WORDS, { kind: 'plus' }),
]);

const NUMERALS = /^[0-9\u0966-\u096F]+$/u;
const DEVANAGARI_ZERO = 0x0966;

function meaningOf(key: string): Meaning | undefined {
  if (NUMERALS.test(key)) {
    // Some recognisers write numerals, in Latin (9) or Devanagari (९) script.
    const digits = key.replace(/[\u0966-\u096F]/gu, (d) =>
      String(d.charCodeAt(0) - DEVANAGARI_ZERO),
    );
    return { kind: 'number', digits };
  }
  return MEANINGS.get(key);
}

/**
 * The digits in what was heard on a number screen. It understands:
 * - digits in Hindi (नौ), Hinglish (nau) and English (nine), including English as a Hindi
 *   recogniser writes it (नाइन);
 * - Hindi words for 10 to 99, for people who say pairs: "अट्ठानवे" is 98;
 * - डबल and ट्रिपल (double, triple), which repeat the number after them: "डबल सात" is 77;
 * - numerals, for recognisers that write them.
 *
 * Everything else comes back in `unused`, so the screen can ask for digits one at a time.
 */
export function parseSpokenNumber(text: string): SpokenNumber {
  const { digits, unused } = readNumber(text);
  return { digits, unused };
}

/** `parseSpokenNumber`, and whether "plus" came before the first digit, as in "+91". */
export function readNumber(text: string): SpokenNumber & { plus: boolean } {
  let digits = '';
  let plus = false;
  const unused: string[] = [];
  let repeat: { word: string; times: number } | null = null;
  for (const word of splitWords(text)) {
    const meaning = meaningOf(word.key);
    if (meaning?.kind === 'number') {
      digits += meaning.digits.repeat(repeat?.times ?? 1);
      repeat = null;
      continue;
    }
    // डबल or ट्रिपल needs a number straight after it.
    if (repeat) unused.push(repeat.word);
    repeat = null;
    if (meaning?.kind === 'repeat') repeat = { word: word.text, times: meaning.times };
    else if (meaning?.kind === 'plus' && digits === '' && !plus) plus = true;
    else unused.push(word.text);
  }
  if (repeat) unused.push(repeat.word);
  return { digits, unused, plus };
}
