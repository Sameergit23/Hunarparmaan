import { describe, expect, it } from 'vitest';
import { matchCommand, parseYesNo } from './answers';
import { digitGrammar, yesNoGrammar } from './grammar';
import { parseSpokenNumber } from './numbers';
import { SCALE_WORDS } from './vocabulary';

const SCALE = SCALE_WORDS.map((word) => word.normalize('NFC'));

describe.each([
  ['digitGrammar', digitGrammar],
  ['yesNoGrammar', yesNoGrammar],
])('%s', (_, grammar) => {
  it('ends with [unk], with no word twice', () => {
    const words = grammar();
    expect(words.at(-1)).toBe('[unk]');
    expect(new Set(words).size).toBe(words.length);
  });

  it('has every word in NFC, and a nukta letter also as one character', () => {
    const words = grammar();
    for (const word of words) expect(words).toContain(word.normalize('NFC'));
    const oneCharacter = words.filter((word) => word !== word.normalize('NFC'));
    for (const word of oneCharacter) expect(word).toMatch(/[\u0958-\u095F]/u);
  });

  it('returns a new list each time', () => {
    grammar().push('extra');
    expect(grammar()).not.toContain('extra');
  });

  it('has the commands', () => {
    expect(grammar()).toEqual(expect.arrayContaining(['दोबारा', 'फिर से', 'पीछे', 'मदद', 'रुको']));
  });
});

describe('digitGrammar', () => {
  it('has digits, pairs, डबल, ट्रिपल, प्लस, सौ and हज़ार', () => {
    expect(digitGrammar()).toEqual(
      expect.arrayContaining(
        ['नौ', 'शून्य', 'ज़ीरो', 'nine', 'अट्ठानवे', 'डबल', 'ट्रिपल', 'प्लस', 'सौ', 'हज़ार'].map(
          (word) => word.normalize('NFC'),
        ),
      ),
    );
  });

  it('has ज़, ड़ and फ़ words in both Unicode forms', () => {
    expect(digitGrammar()).toEqual(
      expect.arrayContaining([
        '\u091C\u093Cीरो',
        '\u095Bीरो',
        'अ\u0921\u093Cतीस',
        'अ\u095Cतीस',
        '\u092B\u093Cोर',
        '\u095Eोर',
      ]),
    );
  });

  it('has only words the number screen understands', () => {
    for (const word of digitGrammar().slice(0, -1)) {
      // `${word} सात` gives डबल and प्लस a digit to work on.
      const understood =
        parseSpokenNumber(`${word} सात`).unused.length === 0 ||
        matchCommand(word) !== null ||
        SCALE.includes(word.normalize('NFC'));
      expect(understood, word).toBe(true);
    }
  });

  it('leaves out yes and no, which sound like digits', () => {
    expect(digitGrammar()).not.toContain('नहीं');
    expect(digitGrammar()).not.toContain('हाँ');
  });
});

describe('yesNoGrammar', () => {
  it('has yes and no', () => {
    expect(yesNoGrammar()).toEqual(
      expect.arrayContaining(['हाँ', 'हां', 'जी', 'सही है', 'नहीं', 'गलत', 'yes', 'no']),
    );
  });

  it('has only words the yes-or-no screen understands', () => {
    for (const word of yesNoGrammar().slice(0, -1)) {
      expect(parseYesNo(word) !== null || matchCommand(word) !== null, word).toBe(true);
    }
  });

  it('leaves out digits, which sound like no', () => {
    expect(yesNoGrammar()).not.toContain('नौ');
    expect(yesNoGrammar()).not.toContain('दो');
  });
});
