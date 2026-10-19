import { describe, expect, it } from 'vitest';
import { skeleton, spellOut, transliterate, words } from './skeleton';

const key = (text: string) => words(text).map(skeleton).join('');

describe('transliterate', () => {
  it('writes Devanagari in Latin letters and leaves other text alone', () => {
    expect(transliterate('अर्थिंग')).toBe('arthinga');
    expect(transliterate('ज़मीन')).toBe('zamiina');
    expect(transliterate('१० साल')).toBe('10 saala');
    expect(transliterate('MCB lagata hoon')).toBe('MCB lagata hoon');
  });
});

describe('skeleton', () => {
  // What Vosk writes on the left, the romanised glossary term on the right.
  it.each([
    ['अर्थिंग', 'earthing'],
    ['अर्थिंग', 'arthing'],
    ['कंड्यूट', 'conduit'],
    ['सॉकेट', 'socket'],
    ['होल्डर', 'holder'],
    ['मल्टीमीटर', 'multimeter'],
    ['टेस्टर', 'tester'],
    ['मेगर', 'megger'],
    ['दस्ताने', 'dastane'],
    ['हेलमेट', 'helmet'],
    ['ग्लव्स', 'gloves'],
    ['लॉकआउट', 'lockout'],
    ['ब्रेकर', 'breaker'],
    ['मेन बंद करना', 'main band karna'],
    ['पाइप में तार', 'pipe mein taar'],
    ['तार खींचना', 'taar kheenchna'],
    ['फिटिंग', 'fitting'],
    ['सर्किट', 'circuit'],
  ])('%s and %s give the same key', (heard, term) => {
    expect(key(heard)).toBe(key(term));
  });

  it('says acronyms letter by letter, as Vosk writes them', () => {
    expect(skeleton(spellOut('MCB'))).toBe(key('एमसीबी'));
    expect(skeleton(spellOut('RCCB'))).toBe(key('आरसीसीबी'));
    expect(skeleton(spellOut('DB'))).toBe(key('डीबी'));
  });

  it('keeps words that differ apart', () => {
    expect(key('earthing')).not.toBe(key('wiring'));
    expect(key('helmet')).not.toBe(key('holder'));
    expect(skeleton('')).toBe('');
  });
});
