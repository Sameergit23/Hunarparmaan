import { splitWords, wordKey } from './normalize';
import { COMMAND_WORDS, NO_WORDS, SOFT_YES_WORDS, YES_WORDS, type Command } from './vocabulary';

export type YesNo = 'yes' | 'no';

const YES = new Set(YES_WORDS.map(wordKey));
const SOFT_YES = new Set(SOFT_YES_WORDS.map(wordKey));
const NO = new Set(NO_WORDS.map(wordKey));

/**
 * Yes or no on a confirmation screen ("सही है?"), or null when it isn't clear. When in doubt it
 * leans to no or null, never yes, because a wrong yes sends the code to the wrong number.
 * - "जी" and "सही" mean yes on their own, but "जी नहीं" and "सही नहीं है" are no.
 * - Yes and no together, as in "हाँ नहीं", are null: ask again.
 * - Other words, and Vosk's "[unk]", are ignored.
 */
export function parseYesNo(text: string): YesNo | null {
  let yes = false;
  let softYes = false;
  let no = false;
  for (const { key } of splitWords(text)) {
    if (YES.has(key)) yes = true;
    else if (SOFT_YES.has(key)) softYes = true;
    else if (NO.has(key)) no = true;
  }
  if (no) return yes ? null : 'no';
  return yes || softYes ? 'yes' : null;
}

const COMMAND_PHRASES: { keys: string[]; command: Command }[] = (
  Object.keys(COMMAND_WORDS) as Command[]
).flatMap((command) =>
  COMMAND_WORDS[command].map((phrase) => ({ keys: phrase.split(' ').map(wordKey), command })),
);

/**
 * The command in what was heard on a sign-in screen, or null. A command counts anywhere in what
 * was said, so "नौ आठ मिटाओ" is `delete`; two different commands, as in "पीछे आगे", are null.
 */
export function matchCommand(text: string): Command | null {
  const keys = splitWords(text).map((word) => word.key);
  const found = new Set<Command>();
  for (const { keys: phrase, command } of COMMAND_PHRASES) {
    if (keys.some((_, at) => phrase.every((key, i) => keys[at + i] === key))) found.add(command);
  }
  const [command, ...others] = found;
  return command !== undefined && others.length === 0 ? command : null;
}
