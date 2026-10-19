import { readNumber } from './numbers';

/** Why the digits heard are not a mobile number yet. */
export type PhoneProblem = 'too_few' | 'too_many' | 'not_mobile';

export interface PhoneFromSpeech {
  /** The 10-digit mobile number, or null while there is a problem. */
  phone: string | null;
  /** The digits heard, without a leading 0, 91 or +91: what the screen shows. */
  digits: string;
  problem: PhoneProblem | null;
  /** How many more digits to ask for when the problem is `too_few`, otherwise 0. */
  missing: number;
  /** Words that are not digits, so the screen can say "एक-एक अंक बोलें". */
  unused: string[];
}

/** The `Phone` rule in packages/contracts, without +91: 10 digits, starting with 6 to 9. */
const MOBILE_LENGTH = 10;
const MOBILE_START = /^[6-9]/;

/**
 * A mobile number from what was heard on the number screen (workflows.md section 5.4).
 * It is a suggestion like any other voice input: the app reads it back and waits for "हाँ".
 * - A leading 0 is dropped: no mobile number starts with 0.
 * - 91 is dropped after "plus" (प्लस, +), or when 12 or more digits start with it.
 *   A 10-digit number that starts with 91, such as 91234 56789, keeps it.
 * - A first digit from 1 to 5 is `not_mobile` straight away, since no more digits can fix it.
 */
export function phoneFromSpeech(text: string): PhoneFromSpeech {
  const heard = readNumber(text);
  const digits = withoutPrefix(heard.digits, heard.plus);
  const problem = problemWith(digits);
  return {
    phone: problem === null ? digits : null,
    digits,
    problem,
    missing: problem === 'too_few' ? MOBILE_LENGTH - digits.length : 0,
    unused: heard.unused,
  };
}

function withoutPrefix(digits: string, plus: boolean): string {
  const rest = digits.replace(/^0+/, '');
  if (rest.startsWith('91') && (plus || rest.length >= MOBILE_LENGTH + 2)) {
    return rest.slice(2).replace(/^0+/, '');
  }
  return rest;
}

function problemWith(digits: string): PhoneProblem | null {
  if (digits !== '' && !MOBILE_START.test(digits)) return 'not_mobile';
  if (digits.length < MOBILE_LENGTH) return 'too_few';
  if (digits.length > MOBILE_LENGTH) return 'too_many';
  return null;
}
