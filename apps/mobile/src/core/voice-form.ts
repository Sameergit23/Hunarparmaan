/**
 * The voice assistant for the new-worker form: it asks for the name, the
 * mobile number and the language, reads them back and waits for "हाँ" before
 * anything is saved (ADR 012: hear it back, then confirm). Every field can
 * still be typed. Voice is an input, never a key.
 *
 * Pure: the screen speaks the prompts, listens with Vosk and feeds what was
 * heard to hearForm().
 */
import type { Language } from '@hunarpramaan/contracts';
import { matchCommand, parseYesNo, phoneFromSpeech } from '@hunarpramaan/voice';

export type VoiceFormStep = 'name' | 'phone' | 'language' | 'confirm' | 'done';

export interface WorkerForm {
  name: string;
  /** Digits only; a full number is 10 digits starting with 6 to 9. */
  phone: string;
  language: Language | null;
}

export type VoiceProblem =
  | 'heard_nothing'
  | 'phone_too_few'
  | 'phone_too_many'
  | 'phone_not_mobile'
  | 'language_unclear'
  | 'yes_no_unclear';

export interface VoiceFormState {
  step: VoiceFormStep;
  form: WorkerForm;
  problem: VoiceProblem | null;
  /** Digits still to say when the number is too short. */
  missing: number;
}

export function startVoiceForm(form: WorkerForm): VoiceFormState {
  return { step: 'name', form, problem: null, missing: 0 };
}

const ORDER: VoiceFormStep[] = ['name', 'phone', 'language', 'confirm', 'done'];

const LANGUAGE_WORDS: Record<Language, RegExp> = {
  hi: /हिंदी|हिन्दी|hindi/i,
  en: /इंग्लिश|अंग्रेज़ी|अंग्रेजी|english|angrezi/i,
};

// DIGIT_WORDS in packages/voice includes the English digit names.
const DIGIT_NAMES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];
const asWords = (digits: string) => Array.from(digits, (d) => DIGIT_NAMES[Number(d)]).join(' ');

const at = (state: VoiceFormState, step: VoiceFormStep): VoiceFormState => ({
  ...state,
  step,
  problem: null,
  missing: 0,
});

/** Apply what Vosk heard to the current step. */
export function hearForm(state: VoiceFormState, heard: string): VoiceFormState {
  const text = heard
    .replace(/\[unk\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { ...state, problem: 'heard_nothing' };

  const command = matchCommand(text);
  if (command === 'back') {
    return at(state, ORDER[ORDER.indexOf(state.step) - 1] ?? 'name');
  }
  if (command === 'repeat') return { ...state, problem: null };

  switch (state.step) {
    case 'name':
      return at({ ...state, form: { ...state.form, name: text } }, 'phone');
    case 'phone': {
      // After "too few", the next words carry on from the digits already heard.
      const carried = state.problem === 'phone_too_few' ? `${asWords(state.form.phone)} ` : '';
      const result = phoneFromSpeech(carried + text);
      const form = { ...state.form, phone: result.digits };
      if (result.phone) return at({ ...state, form: { ...form, phone: result.phone } }, 'language');
      if (!result.digits) return { ...state, problem: 'heard_nothing' };
      return {
        ...state,
        form,
        problem: `phone_${result.problem ?? 'too_few'}`,
        missing: result.missing,
      };
    }
    case 'language': {
      const language = (Object.keys(LANGUAGE_WORDS) as Language[]).find((l) =>
        LANGUAGE_WORDS[l].test(text),
      );
      if (!language) return { ...state, problem: 'language_unclear' };
      return at({ ...state, form: { ...state.form, language } }, 'confirm');
    }
    case 'confirm': {
      const answer = parseYesNo(text);
      if (answer === 'yes') return at(state, 'done');
      // "No": go through the fields again, keeping what was heard so it can be fixed.
      if (answer === 'no') return at(state, 'name');
      return { ...state, problem: 'yes_no_unclear' };
    }
    case 'done':
      return state;
  }
}
