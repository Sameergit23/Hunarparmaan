import { describe, expect, it } from 'vitest';
import { wordKey } from './normalize';
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

describe('vocabulary', () => {
  it('has a word for every number from 10 to 99', () => {
    expect(Object.keys(PAIR_WORDS)).toEqual(Array.from({ length: 90 }, (_, i) => String(i + 10)));
  });

  it('gives each spelling one meaning, so नौ is never no and दो is never दोबारा', () => {
    const meanings = new Map<string, string>();
    const clashes: string[] = [];
    const add = (meaning: string, spellings: readonly string[]) => {
      for (const spelling of spellings) {
        const key = spelling.split(' ').map(wordKey).join(' ');
        const before = meanings.get(key);
        if (before !== undefined && before !== meaning) {
          clashes.push(`${spelling}: ${before}, ${meaning}`);
        }
        meanings.set(key, meaning);
      }
    };
    for (const [digits, spellings] of Object.entries({ ...DIGIT_WORDS, ...PAIR_WORDS })) {
      add(digits, spellings);
    }
    for (const [times, spellings] of Object.entries(REPEAT_WORDS)) add(`${times} times`, spellings);
    for (const [command, spellings] of Object.entries(COMMAND_WORDS)) add(command, spellings);
    add('plus', PLUS_WORDS);
    add('scale', SCALE_WORDS);
    add('yes', [...YES_WORDS, ...SOFT_YES_WORDS, ...YES_NO_PHRASES]);
    add('no', NO_WORDS);
    expect(clashes).toEqual([]);
  });
});
