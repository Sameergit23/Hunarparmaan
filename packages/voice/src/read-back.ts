import type { Digit } from './vocabulary';

/** A recorded clip: one digit said in Hindi, or a short pause. */
export type ReadBackClip = `digit-${Digit}` | 'pause';

/**
 * The clips that read a number back one digit at a time, from recordings, so phones without a
 * Hindi text-to-speech voice can do it too (workflows.md section 5.4). A 10-digit mobile number
 * is read in two groups of five: "नौ आठ सात छह पाँच, चार तीन दो एक शून्य".
 *
 * Never use it for a PIN: the app never says a PIN aloud (ADR 012).
 */
export function readBack(digits: string): ReadBackClip[] {
  if (!/^[0-9]*$/.test(digits)) {
    throw new RangeError(`readBack takes the digits 0 to 9 only, got "${digits}"`);
  }
  const clips: ReadBackClip[] = [];
  for (const [i, digit] of [...digits].entries()) {
    if (digits.length === 10 && i === 5) clips.push('pause');
    clips.push(`digit-${digit as Digit}`);
  }
  return clips;
}
