import { describe, expect, it } from 'vitest';
import { parseSpokenNumber } from './numbers';

const NUMBER = { digits: '9876543210', unused: [] };

describe('parseSpokenNumber', () => {
  describe('the examples in workflows.md section 5.4', () => {
    it('reads Hindi digits', () => {
      expect(parseSpokenNumber('नौ आठ सात छह पाँच, चार तीन दो एक शून्य')).toEqual(NUMBER);
    });

    it('reads English digits', () => {
      expect(parseSpokenNumber('nine eight seven six five, four three two one zero')).toEqual(
        NUMBER,
      );
    });

    it('reads Hindi pairs', () => {
      expect(parseSpokenNumber('अट्ठानवे छिहत्तर चौवन बत्तीस दस')).toEqual(NUMBER);
    });

    it('reads डबल as the next digit twice', () => {
      expect(parseSpokenNumber('नौ आठ डबल सात')).toEqual({ digits: '9877', unused: [] });
    });

    it('gives back सौ and हज़ार as words it could not use', () => {
      expect(parseSpokenNumber('नौ सौ')).toEqual({ digits: '9', unused: ['सौ'] });
      expect(parseSpokenNumber('दो हज़ार').unused).toEqual(['हज़ार'.normalize('NFC')]);
    });
  });

  it('reads Hinglish digits', () => {
    expect(parseSpokenNumber('nau aath saat chhah paanch char teen do ek shunya')).toEqual(NUMBER);
  });

  it('reads English as a Hindi recogniser writes it', () => {
    expect(parseSpokenNumber('नाइन एट सेवन सिक्स फाइव फोर थ्री टू वन ज़ीरो')).toEqual(NUMBER);
  });

  it('reads a mix of languages, digits and pairs', () => {
    expect(parseSpokenNumber('नौ eight सात sixty छिहत्तर')).toEqual({
      digits: '98776',
      unused: ['sixty'],
    });
    expect(parseSpokenNumber('nau अस्सी seven')).toEqual({ digits: '9807', unused: [] });
  });

  it.each([
    ['छह', '6'],
    ['छः', '6'],
    ['छे', '6'],
    ['छ:', '6'],
    ['पाँच', '5'],
    ['पांच', '5'],
    ['शून्य', '0'],
    ['शुन्य', '0'],
    ['\u095Bीरो', '0'], // ज़ with the nukta letter precomposed
    ['\u091C\u093Cीरो', '0'], // ज + nukta
    ['जीरो', '0'],
    ['फ़ोर', '4'],
    ['फोर', '4'],
    ['chaar', '4'],
    ['panch', '5'],
    ['chhe', '6'],
    ['shoonya', '0'],
  ])('reads the spelling %s as %s', (word, digit) => {
    expect(parseSpokenNumber(word)).toEqual({ digits: digit, unused: [] });
  });

  it.each([
    ['दस', '10'],
    ['ग्यारह', '11'],
    ['पंद्रह', '15'],
    ['पन्द्रह', '15'],
    ['उन्नीस', '19'],
    ['इक्कीस', '21'],
    ['अट्ठाईस', '28'],
    ['तैंतीस', '33'],
    ['तैँतीस', '33'], // chandrabindu
    ['अड़तीस', '38'],
    ['अडतीस', '38'], // no nukta
    ['उनतालीस', '39'],
    ['चौवालीस', '44'],
    ['उनचास', '49'],
    ['बावन', '52'],
    ['तिरेपन', '53'],
    ['चौवन', '54'],
    ['उनसठ', '59'],
    ['साठ', '60'],
    ['तिरेसठ', '63'],
    ['सड़सठ', '67'],
    ['उनहत्तर', '69'],
    ['छिहत्तर', '76'],
    ['उन्यासी', '79'],
    ['उनासी', '79'],
    ['अस्सी', '80'],
    ['नवासी', '89'],
    ['नब्बे', '90'],
    ['बानवे', '92'],
    ['पंचानवे', '95'],
    ['अट्ठानवे', '98'],
    ['अट्ठानबे', '98'],
    ['निन्यानवे', '99'],
    ['निन्यानबे', '99'],
  ])('reads the pair %s as %s', (word, digits) => {
    expect(parseSpokenNumber(word)).toEqual({ digits, unused: [] });
  });

  describe('डबल and ट्रिपल', () => {
    it.each([
      ['ट्रिपल नौ', '999'],
      ['double five triple zero', '55000'],
      ['नौ डबल ज़ीरो एक', '9001'],
      ['डबल बत्तीस', '3232'],
      ['डबल 7', '77'],
    ])('reads %s as %s', (text, digits) => {
      expect(parseSpokenNumber(text)).toEqual({ digits, unused: [] });
    });

    it('gives back a डबल that no number follows', () => {
      expect(parseSpokenNumber('नौ आठ डबल')).toEqual({ digits: '98', unused: ['डबल'] });
      expect(parseSpokenNumber('डबल सौ सात')).toEqual({ digits: '7', unused: ['डबल', 'सौ'] });
      expect(parseSpokenNumber('डबल डबल सात')).toEqual({ digits: '77', unused: ['डबल'] });
    });
  });

  it('ignores punctuation, the danda and case', () => {
    expect(parseSpokenNumber('नौ। आठ? सात!')).toEqual({ digits: '987', unused: [] });
    expect(parseSpokenNumber('Nine, EIGHT... seven')).toEqual({ digits: '987', unused: [] });
    expect(parseSpokenNumber('नौ-आठ')).toEqual({ digits: '98', unused: [] });
  });

  it('ignores zero-width joiners inside words', () => {
    expect(parseSpokenNumber('नौ\u200C आ\u200Dठ')).toEqual({ digits: '98', unused: [] });
  });

  it('reads numerals, for recognisers that write them', () => {
    expect(parseSpokenNumber('98765 43210')).toEqual(NUMBER);
    expect(parseSpokenNumber('९८७६५ ४३२१०')).toEqual(NUMBER);
    expect(parseSpokenNumber('नौ 8 seven')).toEqual({ digits: '987', unused: [] });
  });

  it('understands plus before the first digit, and only there', () => {
    expect(parseSpokenNumber('प्लस नाइन वन')).toEqual({ digits: '91', unused: [] });
    expect(parseSpokenNumber('+91')).toEqual({ digits: '91', unused: [] });
    expect(parseSpokenNumber('नौ प्लस एक')).toEqual({ digits: '91', unused: ['प्लस'] });
  });

  it("keeps Vosk's [unk] and other words it can't use, in order", () => {
    expect(parseSpokenNumber('नौ [unk] आठ लाख मिटाओ')).toEqual({
      digits: '98',
      unused: ['[unk]', 'लाख', 'मिटाओ'],
    });
  });

  it('gives nothing for nothing', () => {
    expect(parseSpokenNumber('')).toEqual({ digits: '', unused: [] });
    expect(parseSpokenNumber('  ,  ')).toEqual({ digits: '', unused: [] });
  });
});
