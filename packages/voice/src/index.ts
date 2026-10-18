/*
 * Voice on sign-in screens (ADR 012, workflows.md section 5). Vosk turns speech into text on the
 * phone; these functions turn that text into what a tap would have given: digits, yes or no, a
 * command. Voice is an input, never a key, and a PIN never comes through here: it is pressed on
 * the keypad and never spoken.
 */
export { matchCommand, parseYesNo, type YesNo } from './answers';
export { digitGrammar, yesNoGrammar } from './grammar';
export { parseSpokenNumber, type SpokenNumber } from './numbers';
export { phoneFromSpeech, type PhoneFromSpeech, type PhoneProblem } from './phone';
export { readBack, type ReadBackClip } from './read-back';
export type { Command, Digit } from './vocabulary';
