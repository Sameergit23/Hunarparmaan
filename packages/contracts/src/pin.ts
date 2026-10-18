/**
 * Rules for a new PIN (docs/design/workflows.md, section 4.2). Signing in still
 * accepts any 4 to 6 digit PIN, so existing PINs such as the demo `1234` keep
 * working; these rules apply when a PIN is set, changed or reset. The phone
 * checks them before it sends, and the API checks them again.
 */
import type { Role } from './roles';

/** Workers press a short PIN on a big keypad; every other account needs 6 digits. */
export function pinLengthFor(role: Role): 4 | 6 {
  return role === 'worker' ? 4 : 6;
}

/** `length`: not the role's number of digits. `easy`: a pattern anyone could guess. */
export type PinProblem = 'length' | 'easy';

/** One repeated digit (0000), a straight run up or down (1234, 654321), or a repeated pair (1212). */
export function isEasyPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((digit, i) => digit - (digits[i] ?? 0));
  if (steps.every((step) => step === 1) || steps.every((step) => step === -1)) return true;
  const pair = pin.slice(0, 2);
  return pin.length % 2 === 0 && pin === pair.repeat(pin.length / 2);
}

/** Why `pin` can't be someone's new PIN, or null when it can. */
export function pinProblem(pin: string, role: Role): PinProblem | null {
  if (!/^\d+$/.test(pin) || pin.length !== pinLengthFor(role)) return 'length';
  return isEasyPin(pin) ? 'easy' : null;
}
