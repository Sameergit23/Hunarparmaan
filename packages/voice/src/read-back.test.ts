import { describe, expect, it } from 'vitest';
import { readBack } from './read-back';

describe('readBack', () => {
  it('reads a mobile number in two groups of five', () => {
    expect(readBack('9876543210')).toEqual([
      'digit-9',
      'digit-8',
      'digit-7',
      'digit-6',
      'digit-5',
      'pause',
      'digit-4',
      'digit-3',
      'digit-2',
      'digit-1',
      'digit-0',
    ]);
  });

  it('reads other lengths digit by digit, with no pause', () => {
    expect(readBack('98765432')).not.toContain('pause');
    expect(readBack('123456')).toEqual([
      'digit-1',
      'digit-2',
      'digit-3',
      'digit-4',
      'digit-5',
      'digit-6',
    ]);
    expect(readBack('')).toEqual([]);
  });

  it.each(['98765 43210', '९८७', '+919876543210', 'नौ'])('refuses "%s"', (digits) => {
    expect(() => readBack(digits)).toThrow(RangeError);
  });
});
