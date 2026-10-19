import { Phone } from '@hunarpramaan/contracts';
import { describe, expect, it } from 'vitest';
import { phoneFromSpeech } from './phone';

const NUMBER = {
  phone: '9876543210',
  digits: '9876543210',
  problem: null,
  missing: 0,
  unused: [],
};

describe('phoneFromSpeech', () => {
  it.each([
    'नौ आठ सात छह पाँच, चार तीन दो एक शून्य',
    'nine eight seven six five, four three two one zero',
    'अट्ठानवे छिहत्तर चौवन बत्तीस दस',
  ])('reads "%s" as 98765 43210 (workflows.md section 5.4)', (text) => {
    expect(phoneFromSpeech(text)).toEqual(NUMBER);
  });

  describe('a leading 0, 91 or +91', () => {
    it.each([
      ['a spoken ज़ीरो', 'ज़ीरो नौ आठ सात छह पाँच चार तीन दो एक शून्य'],
      ['a spoken +91', 'प्लस नाइन वन नौ आठ सात छह पाँच चार तीन दो एक शून्य'],
      ['+91 said in English', 'plus nine one nine eight seven six five four three two one zero'],
      ['a written +91', '+91 98765 43210'],
      ['91 without plus, when there are 12 digits', 'नौ एक अट्ठानवे छिहत्तर चौवन बत्तीस दस'],
      ['0 and then 91', '0 91 98765 43210'],
      ['+91 and then 0', '+91 0 98765 43210'],
    ])('drops %s', (_, text) => {
      expect(phoneFromSpeech(text)).toEqual(NUMBER);
    });

    it('drops +91 before the rest of the number is heard', () => {
      expect(phoneFromSpeech('प्लस नाइन वन नौ आठ')).toMatchObject({
        digits: '98',
        problem: 'too_few',
        missing: 8,
      });
    });

    it('keeps 91 at the start of a 10-digit number', () => {
      expect(phoneFromSpeech('नौ एक दो तीन चार पाँच छह सात आठ नौ')).toMatchObject({
        phone: '9123456789',
        problem: null,
      });
    });
  });

  it('keeps 8 digits and asks for the 2 still missing', () => {
    expect(phoneFromSpeech('नौ आठ सात छह पाँच चार तीन दो')).toEqual({
      phone: null,
      digits: '98765432',
      problem: 'too_few',
      missing: 2,
      unused: [],
    });
  });

  it('asks for all 10 digits when it heard none', () => {
    expect(phoneFromSpeech('[unk]')).toEqual({
      phone: null,
      digits: '',
      problem: 'too_few',
      missing: 10,
      unused: ['[unk]'],
    });
  });

  it('says too_many past 10 digits', () => {
    expect(phoneFromSpeech('98765 43210 1')).toMatchObject({
      phone: null,
      digits: '98765432101',
      problem: 'too_many',
      missing: 0,
    });
  });

  it('says not_mobile as soon as the first digit is 1 to 5', () => {
    expect(phoneFromSpeech('पाँच')).toMatchObject({ problem: 'not_mobile', missing: 0 });
    expect(phoneFromSpeech('एक दो तीन चार पाँच छह सात आठ नौ शून्य')).toMatchObject({
      phone: null,
      problem: 'not_mobile',
    });
  });

  it('passes on the words it could not use', () => {
    expect(phoneFromSpeech('नौ सौ')).toEqual({
      phone: null,
      digits: '9',
      problem: 'too_few',
      missing: 9,
      unused: ['सौ'],
    });
  });

  it('accepts a 10-digit number exactly when Phone in packages/contracts does', () => {
    for (const first of '123456789') {
      const number = `${first}876543210`;
      const { phone } = phoneFromSpeech(number);
      expect(phone !== null, number).toBe(Phone.safeParse(number).success);
      if (phone !== null) expect(Phone.parse(phone)).toBe(phone);
    }
  });
});
