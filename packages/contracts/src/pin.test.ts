import { describe, expect, it } from 'vitest';
import { isEasyPin, pinLengthFor, pinProblem } from './pin';

describe('PIN rules for a new PIN', () => {
  it('gives workers 4 digits and everyone else 6', () => {
    expect(pinLengthFor('worker')).toBe(4);
    for (const role of ['mobiliser', 'assessor', 'agency', 'awarding_body', 'tp_admin'] as const) {
      expect(pinLengthFor(role)).toBe(6);
    }
  });

  it.each(['0000', '7777', '1234', '6789', '4321', '1212', '123456', '654321', '090909'])(
    'refuses %s as easy to guess',
    (pin) => expect(isEasyPin(pin)).toBe(true),
  );

  it.each(['4826', '9173', '1243', '2580', '305718', '914273'])('allows %s', (pin) => {
    expect(isEasyPin(pin)).toBe(false);
  });

  it('checks the length for the role before the pattern', () => {
    expect(pinProblem('4826', 'worker')).toBeNull();
    expect(pinProblem('482613', 'worker')).toBe('length');
    expect(pinProblem('4826', 'assessor')).toBe('length');
    expect(pinProblem('305718', 'assessor')).toBeNull();
    expect(pinProblem('123456', 'assessor')).toBe('easy');
    expect(pinProblem('12a4', 'worker')).toBe('length');
  });
});
