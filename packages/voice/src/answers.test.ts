import { describe, expect, it } from 'vitest';
import { matchCommand, parseYesNo } from './answers';

describe('parseYesNo', () => {
  it.each([
    'हाँ',
    'हां',
    'जी',
    'सही है',
    'सही',
    'जी हाँ',
    'हाँ जी, सही है।',
    'यस',
    'haan',
    'Ji',
    'sahi hai',
    'YES',
    '[unk] हाँ',
  ])('reads "%s" as yes', (text) => {
    expect(parseYesNo(text)).toBe('yes');
  });

  it.each([
    'नहीं',
    'नहीँ',
    'नही',
    'गलत',
    'ग़लत',
    'नो',
    'nahin',
    'nahi',
    'No',
    'galat',
    'जी नहीं',
    'सही नहीं है',
    'नहीं, गलत है',
  ])('reads "%s" as no', (text) => {
    expect(parseYesNo(text)).toBe('no');
  });

  it.each(['', '[unk]', 'हाँ नहीं', 'नहीं हाँ', 'yes no', 'नौ', 'दोबारा', 'है'])(
    'reads "%s" as neither',
    (text) => {
      expect(parseYesNo(text)).toBeNull();
    },
  );
});

describe('matchCommand', () => {
  it.each([
    ['दोबारा', 'repeat'],
    ['दुबारा', 'repeat'],
    ['फिर से', 'repeat'],
    ['phir se', 'repeat'],
    ['dobara', 'repeat'],
    ['Repeat', 'repeat'],
    ['पीछे', 'back'],
    ['peechhe', 'back'],
    ['back', 'back'],
    ['आगे', 'next'],
    ['aage', 'next'],
    ['next', 'next'],
    ['मदद', 'help'],
    ['madad', 'help'],
    ['हेल्प', 'help'],
    ['रुको', 'stop'],
    ['ruko', 'stop'],
    ['stop', 'stop'],
    ['मिटाओ', 'delete'],
    ['मिटाएँ', 'delete'],
    ['मिटाएं', 'delete'],
    ['mitao', 'delete'],
    ['delete', 'delete'],
  ])('reads "%s" as %s', (text, command) => {
    expect(matchCommand(text)).toBe(command);
  });

  it('finds a command among other words', () => {
    expect(matchCommand('नौ आठ मिटाओ')).toBe('delete');
    expect(matchCommand('जी, फिर से बोलिए')).toBe('repeat');
    expect(matchCommand('मदद, मदद!')).toBe('help');
  });

  it('needs the whole of फिर से', () => {
    expect(matchCommand('फिर')).toBeNull();
    expect(matchCommand('से')).toBeNull();
    expect(matchCommand('से फिर')).toBeNull();
  });

  it('gives null for two different commands', () => {
    expect(matchCommand('पीछे आगे')).toBeNull();
  });

  it.each(['', '[unk]', 'दो', 'नौ आठ', 'हाँ', 'नहीं'])('finds no command in "%s"', (text) => {
    expect(matchCommand(text)).toBeNull();
  });
});
